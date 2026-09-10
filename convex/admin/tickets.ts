// Staff console: tickets. judge/views/ticket.py:TicketList and DMOJ's
// TicketAdmin.

import { hasPerm, problemIsEditableBy } from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { optionalViewer, requirePerm } from "../lib/auth";
import {
  authorSummaries,
  authorSummary,
  coreRow,
  coreViewer,
  type OffsetPage,
  sliceOffset,
  writeRevision,
} from "../lib/community";
import { notFound } from "../lib/errors";

const TICKET_PERM = "judge.change_ticket";

export type AdminTicketRow = {
  _id: Id<"tickets">;
  legacyId?: number;
  title: string;
  time: number;
  isOpen: boolean;
  notes: string;
  authorName: string;
  assigneeNames: string[];
  linkedType?: string;
  linkedKey?: string;
  messageCount: number;
};

/** Every ticket a `judge.change_ticket` holder may act on, newest first. */
export const list = query({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
    onlyOpen: v.optional(v.boolean()),
    search: v.optional(v.string()),
    assigneeProfileId: v.optional(v.id("profiles")),
    authorProfileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args): Promise<OffsetPage<AdminTicketRow>> => {
    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    const empty: OffsetPage<AdminTicketRow> = {
      page: [],
      isDone: true,
      continueCursor: "0",
      totalCount: 0,
    };
    if (!profile || !hasPerm(viewer, TICKET_PERM)) return empty;

    let rows = args.onlyOpen
      ? await ctx.db
          .query("tickets")
          .withIndex("by_open_time", (q) => q.eq("isOpen", true))
          .order("desc")
          .collect()
      : await ctx.db.query("tickets").withIndex("by_time").order("desc").collect();

    if (args.assigneeProfileId) {
      const wanted = args.assigneeProfileId;
      rows = rows.filter((row) => row.assigneeProfileIds.includes(wanted));
    }
    if (args.authorProfileId) {
      const wanted = args.authorProfileId;
      rows = rows.filter((row) => row.profileId === wanted);
    }
    const needle = args.search?.trim().toLowerCase();
    if (needle) rows = rows.filter((row) => row.title.toLowerCase().includes(needle));

    rows.sort((a, b) => b.time - a.time);
    const sliced = sliceOffset(rows, args.cursor, args.numItems ?? 50);

    const page: AdminTicketRow[] = [];
    for (const row of sliced.page) {
      const author = await ctx.db.get(row.profileId);
      const assignees = await authorSummaries(ctx, row.assigneeProfileIds);
      const messages = await ctx.db
        .query("ticketMessages")
        .withIndex("by_ticket_time", (q) => q.eq("ticketId", row._id))
        .collect();
      page.push({
        _id: row._id,
        legacyId: row.legacyId,
        title: row.title,
        time: row.time,
        isOpen: row.isOpen,
        notes: row.notes,
        authorName: author ? authorSummary(author).displayName : "deleted user",
        assigneeNames: assignees.map((entry) => entry.displayName),
        linkedType: row.linkedType,
        linkedKey: row.linkedKey,
        messageCount: messages.length,
      });
    }
    return { ...sliced, page };
  },
});

/** Candidate assignees: the editors of the linked problem, plus all staff. */
export const assigneeOptions = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    if (!hasPerm(viewer, TICKET_PERM)) return [];

    const ticket = await ctx.db.get(ticketId);
    if (!ticket) return [];

    const ids = new Set<Id<"profiles">>();
    if (ticket.linkedType === "problem" && ticket.linkedKey) {
      const problem = await ctx.db
        .query("problems")
        .withIndex("by_code", (q) => q.eq("code", ticket.linkedKey ?? ""))
        .unique();
      if (problem) {
        for (const id of problem.authorProfileIds) ids.add(id);
        for (const id of problem.curatorProfileIds) ids.add(id);
      }
    }
    const staff = await ctx.db.query("profiles").collect();
    for (const row of staff) {
      if (row.isStaff || row.isSuperuser) ids.add(row._id);
    }
    const summaries = await authorSummaries(ctx, [...ids]);
    summaries.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return summaries;
  },
});

export const setAssignees = mutation({
  args: {
    ticketId: v.id("tickets"),
    profileIds: v.array(v.id("profiles")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { ticketId, profileIds, reason }) => {
    const editor = await requirePerm(ctx, TICKET_PERM);
    const row = await ctx.db.get(ticketId);
    if (!row) throw notFound("Ticket");

    const unique = [...new Set(profileIds)];
    for (const id of unique) {
      if (!(await ctx.db.get(id))) throw notFound("Profile");
    }
    await writeRevision(ctx, "ticket", ticketId, row, editor._id, reason ?? "Changed assignees");
    await ctx.db.patch(ticketId, { assigneeProfileIds: unique });
  },
});

export const setOpen = mutation({
  args: { ticketId: v.id("tickets"), open: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, { ticketId, open, reason }) => {
    const editor = await requirePerm(ctx, TICKET_PERM);
    const row = await ctx.db.get(ticketId);
    if (!row) throw notFound("Ticket");
    if (row.isOpen === open) return;
    await writeRevision(ctx, "ticket", ticketId, row, editor._id, reason ?? (open ? "Reopened" : "Closed"));
    await ctx.db.patch(ticketId, { isOpen: open });
  },
});

export const setNotes = mutation({
  args: { ticketId: v.id("tickets"), notes: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { ticketId, notes, reason }) => {
    const editor = await requirePerm(ctx, TICKET_PERM);
    const row = await ctx.db.get(ticketId);
    if (!row) throw notFound("Ticket");
    await writeRevision(ctx, "ticket", ticketId, row, editor._id, reason ?? "Edited notes");
    await ctx.db.patch(ticketId, { notes });
  },
});

export const remove = mutation({
  args: { ticketId: v.id("tickets"), reason: v.optional(v.string()) },
  handler: async (ctx, { ticketId, reason }) => {
    const editor = await requirePerm(ctx, TICKET_PERM);
    const row = await ctx.db.get(ticketId);
    if (!row) throw notFound("Ticket");

    const messages = await ctx.db
      .query("ticketMessages")
      .withIndex("by_ticket_time", (q) => q.eq("ticketId", ticketId))
      .collect();
    for (const message of messages) await ctx.db.delete(message._id);

    await writeRevision(
      ctx,
      "ticket",
      ticketId,
      { ticket: row, messages },
      editor._id,
      reason ?? "Deleted ticket",
    );
    await ctx.db.delete(ticketId);
  },
});

/** The counts the console header shows. */
export const counts = query({
  args: {},
  handler: async (ctx): Promise<{ open: number; mine: number; total: number }> => {
    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    if (!profile) return { open: 0, mine: 0, total: 0 };

    const rows = await ctx.db.query("tickets").collect();
    const canSeeAll = hasPerm(viewer, TICKET_PERM);

    let visible: Doc<"tickets">[] = rows;
    if (!canSeeAll) {
      const kept: Doc<"tickets">[] = [];
      for (const row of rows) {
        if (row.profileId === profile._id || row.assigneeProfileIds.includes(profile._id)) {
          kept.push(row);
          continue;
        }
        if (row.linkedType === "problem" && row.linkedKey) {
          const problem = await ctx.db
            .query("problems")
            .withIndex("by_code", (q) => q.eq("code", row.linkedKey ?? ""))
            .unique();
          if (problem && problemIsEditableBy(coreRow(problem), viewer)) kept.push(row);
        }
      }
      visible = kept;
    }

    return {
      open: visible.filter((row) => row.isOpen).length,
      mine: visible.filter(
        (row) => row.profileId === profile._id || row.assigneeProfileIds.includes(profile._id),
      ).length,
      total: visible.length,
    };
  },
});
