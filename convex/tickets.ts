// DMOJ's tickets: judge/views/ticket.py, judge/models/ticket.py and
// judge/utils/tickets.py.
//
// DMOJ pushes ticket changes over a websocket channel; here every read is a
// Convex query, so subscribers see new messages, assignments and status changes
// without any channel code.

import { hasPerm, isStaff, problemIsAccessibleBy, problemIsEditableBy } from "@moj/core";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { optionalViewer, requireViewer } from "./lib/auth";
import {
  type AuthorSummary,
  authorSummaries,
  authorSummary,
  coreRow,
  coreViewer,
  hasAnySolve,
  type OffsetPage,
  siteSettings,
  sliceOffset,
  TICKET_MAX_TITLE,
} from "./lib/community";
import { forbidden, invalid, notFound } from "./lib/errors";

/** The preset `@moj/content` renders ticket messages with. */
export const TICKET_PRESET = "ticket" as const;

type CoreViewer = Awaited<ReturnType<typeof coreViewer>>;

export type TicketSummary = {
  _id: Id<"tickets">;
  legacyId?: number;
  title: string;
  time: number;
  isOpen: boolean;
  notes: string;
  author: AuthorSummary | null;
  assignees: AuthorSummary[];
  linkedType?: string;
  linkedKey?: string;
  linkedTitle: string | null;
  linkedHref: string | null;
  messageCount: number;
  lastMessageTime: number;
  href: string;
};

export type TicketMessage = {
  _id: Id<"ticketMessages">;
  body: string;
  bodyPreset: typeof TICKET_PRESET;
  time: number;
  author: AuthorSummary | null;
};

export type TicketDetail = TicketSummary & {
  messages: TicketMessage[];
  canEditNotes: boolean;
  canAssign: boolean;
  canSetOpen: boolean;
  canReply: boolean;
};

/* -------------------------------------------------------------------------- */
/* Visibility                                                                 */
/* -------------------------------------------------------------------------- */

function isOwnTicket(ticket: Doc<"tickets">, profileId: Id<"profiles">): boolean {
  return ticket.profileId === profileId || ticket.assigneeProfileIds.includes(profileId);
}

async function linkedProblem(
  ctx: QueryCtx | MutationCtx,
  ticket: Doc<"tickets">,
): Promise<Doc<"problems"> | null> {
  if (ticket.linkedType !== "problem" || !ticket.linkedKey) return null;
  return await ctx.db
    .query("problems")
    .withIndex("by_code", (q) => q.eq("code", ticket.linkedKey ?? ""))
    .unique();
}

/**
 * `TicketMixin.get_object` (judge/views/ticket.py:110) and
 * `filter_visible_tickets` (judge/utils/tickets.py:11), which agree.
 */
async function canSeeTicket(
  ctx: QueryCtx | MutationCtx,
  ticket: Doc<"tickets">,
  profile: Doc<"profiles"> | null,
  viewer: CoreViewer,
): Promise<boolean> {
  if (!profile) return false;
  if (hasPerm(viewer, "judge.change_ticket")) return true;
  if (isOwnTicket(ticket, profile._id)) return true;
  const problem = await linkedProblem(ctx, ticket);
  return problem !== null && problemIsEditableBy(coreRow(problem), viewer);
}

/** Whether the viewer manages this ticket rather than merely reading it. */
async function canManageTicket(
  ctx: QueryCtx | MutationCtx,
  ticket: Doc<"tickets">,
  viewer: CoreViewer,
): Promise<boolean> {
  if (hasPerm(viewer, "judge.change_ticket")) return true;
  const problem = await linkedProblem(ctx, ticket);
  return problem !== null && problemIsEditableBy(coreRow(problem), viewer);
}

async function summarise(ctx: QueryCtx | MutationCtx, ticket: Doc<"tickets">): Promise<TicketSummary> {
  const author = await ctx.db.get(ticket.profileId);
  const assignees = await authorSummaries(ctx, ticket.assigneeProfileIds);
  const messages = await ctx.db
    .query("ticketMessages")
    .withIndex("by_ticket_time", (q) => q.eq("ticketId", ticket._id))
    .collect();

  let linkedTitle: string | null = null;
  let linkedHref: string | null = null;
  if (ticket.linkedType === "problem" && ticket.linkedKey) {
    const problem = await linkedProblem(ctx, ticket);
    linkedTitle = problem?.name ?? ticket.linkedKey;
    linkedHref = `/problem/${ticket.linkedKey}`;
  }

  const lastMessageTime = messages.reduce((latest, row) => Math.max(latest, row.time), ticket.time);

  return {
    _id: ticket._id,
    legacyId: ticket.legacyId,
    title: ticket.title,
    time: ticket.time,
    isOpen: ticket.isOpen,
    notes: ticket.notes,
    author: author ? authorSummary(author) : null,
    assignees,
    linkedType: ticket.linkedType,
    linkedKey: ticket.linkedKey,
    linkedTitle,
    linkedHref,
    messageCount: messages.length,
    lastMessageTime,
    href: `/ticket/${ticket.legacyId ?? ticket._id}`,
  };
}

async function ticketByKey(ctx: QueryCtx | MutationCtx, key: string): Promise<Doc<"tickets"> | null> {
  const numeric = Number(key);
  if (Number.isInteger(numeric) && key.trim() !== "") {
    const byLegacy = await ctx.db
      .query("tickets")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", numeric))
      .unique();
    if (byLegacy) return byLegacy;
  }
  const id = ctx.db.normalizeId("tickets", key);
  return id ? await ctx.db.get(id) : null;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** `TicketList.get_queryset` (judge/views/ticket.py:213), newest first. */
export const list = query({
  args: {
    paginationOpts: v.optional(paginationOptsValidator),
    onlyOpen: v.optional(v.boolean()),
    onlyOwn: v.optional(v.boolean()),
    problemCode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<OffsetPage<TicketSummary>> => {
    const empty: OffsetPage<TicketSummary> = {
      page: [],
      isDone: true,
      continueCursor: "0",
      totalCount: 0,
    };
    const profile = await optionalViewer(ctx);
    if (!profile) return empty;
    const viewer = await coreViewer(ctx, profile);
    const settings = await siteSettings(ctx);

    let rows: Doc<"tickets">[];
    if (args.problemCode) {
      const problem = await ctx.db
        .query("problems")
        .withIndex("by_code", (q) => q.eq("code", args.problemCode ?? ""))
        .unique();
      if (!problem) return empty;
      if (!problemIsAccessibleBy(coreRow(problem), viewer)) return empty;
      rows = await ctx.db
        .query("tickets")
        .withIndex("by_linked", (q) => q.eq("linkedType", "problem").eq("linkedKey", problem.code))
        .collect();
      if (!problemIsEditableBy(coreRow(problem), viewer)) {
        rows = rows.filter((row) => isOwnTicket(row, profile._id));
      }
    } else if (args.onlyOpen) {
      rows = await ctx.db
        .query("tickets")
        .withIndex("by_open_time", (q) => q.eq("isOpen", true))
        .order("desc")
        .collect();
    } else {
      rows = await ctx.db.query("tickets").withIndex("by_time").order("desc").collect();
    }

    if (args.onlyOpen) rows = rows.filter((row) => row.isOpen);
    if (args.onlyOwn) {
      rows = rows.filter((row) => isOwnTicket(row, profile._id));
    } else if (!hasPerm(viewer, "judge.change_ticket")) {
      const kept: Doc<"tickets">[] = [];
      for (const row of rows) {
        if (await canSeeTicket(ctx, row, profile, viewer)) kept.push(row);
      }
      rows = kept;
    }

    rows.sort((a, b) => b.time - a.time || (a._id < b._id ? 1 : -1));

    const perPage = args.paginationOpts?.numItems || settings?.ticketsPerPage || 50;
    const sliced = sliceOffset(rows, args.paginationOpts?.cursor, perPage);
    return {
      ...sliced,
      page: await Promise.all(sliced.page.map((row) => summarise(ctx, row))),
    };
  },
});

/** `TicketView` (judge/views/ticket.py:121). Null when the viewer may not see it. */
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }): Promise<TicketDetail | null> => {
    const ticket = await ticketByKey(ctx, id);
    if (!ticket) return null;
    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    if (!(await canSeeTicket(ctx, ticket, profile, viewer))) return null;

    const rows = await ctx.db
      .query("ticketMessages")
      .withIndex("by_ticket_time", (q) => q.eq("ticketId", ticket._id))
      .collect();
    rows.sort((a, b) => a.time - b.time);

    const messages: TicketMessage[] = [];
    for (const row of rows) {
      const author = await ctx.db.get(row.profileId);
      messages.push({
        _id: row._id,
        body: row.body,
        bodyPreset: TICKET_PRESET,
        time: row.time,
        author: author ? authorSummary(author) : null,
      });
    }

    const manages = await canManageTicket(ctx, ticket, viewer);
    return {
      ...(await summarise(ctx, ticket)),
      messages,
      canEditNotes: manages,
      canAssign: hasPerm(viewer, "judge.change_ticket"),
      canSetOpen: true,
      canReply: !!profile && !profile.mute,
    };
  },
});

/** The home page's "your open tickets" and staff's "open tickets" boxes. */
export const openForViewer = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<{ own: TicketSummary[]; staff: TicketSummary[] }> => {
    const profile = await optionalViewer(ctx);
    if (!profile) return { own: [], staff: [] };
    const viewer = await coreViewer(ctx, profile);
    const take = Math.max(1, Math.min(limit ?? 10, 50));

    const open = await ctx.db
      .query("tickets")
      .withIndex("by_open_time", (q) => q.eq("isOpen", true))
      .order("desc")
      .collect();

    const own = open.filter((row) => row.profileId === profile._id).slice(0, take);

    const staff: Doc<"tickets">[] = [];
    if (isStaff(viewer)) {
      for (const row of open) {
        if (staff.length >= take) break;
        if (await canSeeTicket(ctx, row, profile, viewer)) staff.push(row);
      }
    }

    return {
      own: await Promise.all(own.map((row) => summarise(ctx, row))),
      staff: await Promise.all(staff.map((row) => summarise(ctx, row))),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `NewTicketView.form_valid` and `NewProblemTicketView.get_assignees`
 * (judge/views/ticket.py:66, :84).
 */
export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    problemCode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"tickets">> => {
    const profile = await requireViewer(ctx);
    const viewer = await coreViewer(ctx, profile);

    if (profile.mute) throw invalid("Your part is silent, little toad.");
    const inContest = profile.currentParticipationId !== undefined;
    if (!inContest && !isStaff(viewer) && !(await hasAnySolve(ctx, profile._id))) {
      throw invalid("You must solve at least one problem before you can create a ticket.");
    }

    const title = args.title.trim();
    if (title.length === 0) throw invalid("A ticket needs a title.");
    if (title.length > TICKET_MAX_TITLE) {
      throw invalid(`Ticket titles are limited to ${TICKET_MAX_TITLE} characters.`);
    }
    const body = args.body.trim();
    if (body.length === 0) throw invalid("A ticket needs a message.");

    let assignees: Id<"profiles">[] = [];
    let linkedType: string | undefined;
    let linkedKey: string | undefined;

    if (args.problemCode) {
      const problem = await ctx.db
        .query("problems")
        .withIndex("by_code", (q) => q.eq("code", args.problemCode ?? ""))
        .unique();
      if (!problem) throw notFound("Problem");
      if (!problemIsAccessibleBy(coreRow(problem), viewer)) throw forbidden();
      linkedType = "problem";
      linkedKey = problem.code;
      assignees = [...problem.authorProfileIds];

      // In contest, the contest's authors take the ticket instead.
      if (profile.currentParticipationId) {
        const participation = await ctx.db.get(profile.currentParticipationId);
        if (participation) {
          const inThisContest = await ctx.db
            .query("contestProblems")
            .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
            .filter((q) => q.eq(q.field("contestId"), participation.contestId))
            .first();
          if (inThisContest) {
            const contest = await ctx.db.get(participation.contestId);
            if (contest) assignees = [...contest.authorProfileIds];
          }
        }
      }
    }

    const now = Date.now();
    const ticketId = await ctx.db.insert("tickets", {
      title,
      profileId: profile._id,
      time: now,
      assigneeProfileIds: assignees,
      notes: "",
      linkedType,
      linkedKey,
      isOpen: true,
    });
    await ctx.db.insert("ticketMessages", {
      ticketId,
      profileId: profile._id,
      body,
      time: now,
    });
    return ticketId;
  },
});

async function loadForWrite(
  ctx: MutationCtx,
  ticketId: Id<"tickets">,
): Promise<{ ticket: Doc<"tickets">; profile: Doc<"profiles">; viewer: CoreViewer }> {
  const profile = await requireViewer(ctx);
  const viewer = await coreViewer(ctx, profile);
  const ticket = await ctx.db.get(ticketId);
  if (!ticket) throw notFound("Ticket");
  if (!(await canSeeTicket(ctx, ticket, profile, viewer))) throw forbidden();
  return { ticket, profile, viewer };
}

/** `TicketView.form_valid` (judge/views/ticket.py:126). */
export const reply = mutation({
  args: { ticketId: v.id("tickets"), body: v.string() },
  handler: async (ctx, { ticketId, body }): Promise<Id<"ticketMessages">> => {
    const { profile } = await loadForWrite(ctx, ticketId);
    if (profile.mute) throw invalid("Your part is silent, little toad.");
    const trimmed = body.trim();
    if (trimmed.length === 0) throw invalid("A message needs a body.");
    return await ctx.db.insert("ticketMessages", {
      ticketId,
      profileId: profile._id,
      body: trimmed,
      time: Date.now(),
    });
  },
});

/** `TicketStatusChangeView` (judge/views/ticket.py:151). */
export const setOpen = mutation({
  args: { ticketId: v.id("tickets"), open: v.boolean() },
  handler: async (ctx, { ticketId, open }) => {
    const { ticket } = await loadForWrite(ctx, ticketId);
    if (ticket.isOpen === open) return;
    await ctx.db.patch(ticketId, { isOpen: open });
  },
});

/** `TicketNotesEditView` (judge/views/ticket.py:174), narrowed to managers. */
export const setNotes = mutation({
  args: { ticketId: v.id("tickets"), notes: v.string() },
  handler: async (ctx, { ticketId, notes }) => {
    const { ticket, viewer } = await loadForWrite(ctx, ticketId);
    if (!(await canManageTicket(ctx, ticket, viewer))) throw forbidden();
    await ctx.db.patch(ticketId, { notes });
  },
});

/** DMOJ assigns from the admin; `judge.change_ticket` is the same gate. */
export const assign = mutation({
  args: { ticketId: v.id("tickets"), profileIds: v.array(v.id("profiles")) },
  handler: async (ctx, { ticketId, profileIds }) => {
    const { viewer } = await loadForWrite(ctx, ticketId);
    if (!hasPerm(viewer, "judge.change_ticket")) throw forbidden();
    const unique = [...new Set(profileIds)];
    for (const id of unique) {
      if (!(await ctx.db.get(id))) throw notFound("Profile");
    }
    await ctx.db.patch(ticketId, { assigneeProfileIds: unique });
  },
});
