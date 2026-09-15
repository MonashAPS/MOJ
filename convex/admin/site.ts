// Staff console: the navigation bar, misc config, flat pages and the site
// settings document. judge/models/interface.py and DMOJ's admin site.

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requirePerm, requireSuperuser } from "../lib/auth";
import { writeRevision } from "../lib/community";
import { invalid, notFound } from "../lib/errors";

const NAV_PERM = "judge.change_navigationbar";

const CONFIG_PERM = "judge.change_miscconfig";

const FLATPAGE_PERM = "judge.change_flatpage";

/** `validate_regex` (judge/models/interface.py:23). */
function checkRegex(regex: string): void {
  try {
    new RegExp(regex);
  } catch (error) {
    throw invalid(`Invalid regex: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Navigation bar                                                             */
/* -------------------------------------------------------------------------- */

export const navRows = query({
  args: {},
  handler: async (ctx): Promise<Doc<"navigationBar">[]> => {
    await requirePerm(ctx, NAV_PERM);
    const rows = await ctx.db.query("navigationBar").withIndex("by_order").collect();
    rows.sort((a, b) => a.order - b.order);

    return rows;
  },
});

export const createNavItem = mutation({
  args: {
    key: v.string(),
    label: v.string(),
    path: v.string(),
    regex: v.string(),
    order: v.number(),
    parentId: v.optional(v.id("navigationBar")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"navigationBar">> => {
    const editor = await requirePerm(ctx, NAV_PERM);
    checkRegex(args.regex);

    const key = args.key.trim();

    if (key.length === 0) throw invalid("A navigation item needs an identifier.");

    if (key.length > 10) throw invalid("Identifiers are limited to 10 characters.");

    const clash = await ctx.db
      .query("navigationBar")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    if (clash) throw invalid(`A navigation item with the identifier ${key} already exists.`);

    const id = await ctx.db.insert("navigationBar", {
      key,
      label: args.label,
      path: args.path,
      regex: args.regex,
      order: args.order,
      parentId: args.parentId,
    });

    await writeRevision(
      ctx,
      "navigationBar",
      id,
      await ctx.db.get(id),
      editor._id,
      args.reason ?? "Created navigation item",
    );

    return id;
  },
});

export const updateNavItem = mutation({
  args: {
    id: v.id("navigationBar"),
    key: v.optional(v.string()),
    label: v.optional(v.string()),
    path: v.optional(v.string()),
    regex: v.optional(v.string()),
    order: v.optional(v.number()),
    parentId: v.optional(v.union(v.id("navigationBar"), v.null())),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const editor = await requirePerm(ctx, NAV_PERM);
    const row = await ctx.db.get(args.id);

    if (!row) throw notFound("Navigation item");

    if (args.regex !== undefined) checkRegex(args.regex);

    if (args.parentId === args.id) throw invalid("A navigation item cannot be its own parent.");

    const patch: Partial<Doc<"navigationBar">> = {};

    if (args.key !== undefined) patch.key = args.key.trim();

    if (args.label !== undefined) patch.label = args.label;

    if (args.path !== undefined) patch.path = args.path;

    if (args.regex !== undefined) patch.regex = args.regex;

    if (args.order !== undefined) patch.order = args.order;

    if (args.parentId !== undefined) patch.parentId = args.parentId ?? undefined;

    await ctx.db.patch(args.id, patch);
    await writeRevision(
      ctx,
      "navigationBar",
      args.id,
      await ctx.db.get(args.id),
      editor._id,
      args.reason ?? "Edited navigation item",
    );
  },
});

export const deleteNavItem = mutation({
  args: { id: v.id("navigationBar"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const editor = await requirePerm(ctx, NAV_PERM);
    const row = await ctx.db.get(id);

    if (!row) throw notFound("Navigation item");

    const children = await ctx.db
      .query("navigationBar")
      .withIndex("by_parent", (q) => q.eq("parentId", id))
      .collect();

    for (const child of children) await ctx.db.patch(child._id, { parentId: row.parentId });

    await writeRevision(ctx, "navigationBar", id, row, editor._id, reason ?? "Deleted navigation item");
    await ctx.db.delete(id);
  },
});

/** Drag-and-drop reordering: one write per moved row. */
export const reorderNav = mutation({
  args: {
    items: v.array(
      v.object({
        id: v.id("navigationBar"),
        order: v.number(),
        parentId: v.optional(v.union(v.id("navigationBar"), v.null())),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    await requirePerm(ctx, NAV_PERM);

    for (const item of items) {
      const row = await ctx.db.get(item.id);

      if (!row) throw notFound("Navigation item");

      if (item.parentId === item.id) throw invalid("A navigation item cannot be its own parent.");
      const patch: Partial<Doc<"navigationBar">> = { order: item.order };

      if (item.parentId !== undefined) patch.parentId = item.parentId ?? undefined;
      await ctx.db.patch(item.id, patch);
    }
  },
});

/* -------------------------------------------------------------------------- */
/* Misc config                                                                */
/* -------------------------------------------------------------------------- */

/** The keys DMOJ ships templates for; the console offers these first. */
export const KNOWN_CONFIG_KEYS = [
  "announcement",
  "footer",
  "home_page_top",
  "home_page_bottom",
  "site_name",
  "meta_keywords",
  "analytics",
  "problem_list_header",
  "contest_list_header",
  "user_list_header",
] as const;

export const configRows = query({
  args: {},
  handler: async (ctx) => {
    await requirePerm(ctx, CONFIG_PERM);
    const rows = await ctx.db.query("miscConfig").collect();
    rows.sort((a, b) => a.key.localeCompare(b.key));

    return { rows, knownKeys: KNOWN_CONFIG_KEYS as readonly string[] };
  },
});

export const setConfig = mutation({
  args: { key: v.string(), value: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { key, value, reason }) => {
    const editor = await requirePerm(ctx, CONFIG_PERM);
    const trimmed = key.trim();

    if (trimmed.length === 0) throw invalid("A configuration item needs a key.");

    if (trimmed.length > 30) throw invalid("Keys are limited to 30 characters.");

    const existing = await ctx.db
      .query("miscConfig")
      .withIndex("by_key", (q) => q.eq("key", trimmed))
      .first();

    if (existing) {
      await writeRevision(
        ctx,
        "miscConfig",
        existing._id,
        existing,
        editor._id,
        reason ?? "Edited configuration",
      );
      await ctx.db.patch(existing._id, { value });

      return existing._id;
    }

    const id = await ctx.db.insert("miscConfig", { key: trimmed, value });
    await writeRevision(
      ctx,
      "miscConfig",
      id,
      { key: trimmed, value },
      editor._id,
      reason ?? "Created configuration",
    );

    return id;
  },
});

export const deleteConfig = mutation({
  args: { key: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { key, reason }) => {
    const editor = await requirePerm(ctx, CONFIG_PERM);

    const existing = await ctx.db
      .query("miscConfig")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    if (!existing) throw notFound("Configuration item");
    await writeRevision(
      ctx,
      "miscConfig",
      existing._id,
      existing,
      editor._id,
      reason ?? "Deleted configuration",
    );
    await ctx.db.delete(existing._id);
  },
});

/* -------------------------------------------------------------------------- */
/* Flat pages                                                                 */
/* -------------------------------------------------------------------------- */

export const flatPageRows = query({
  args: {},
  handler: async (ctx) => {
    await requirePerm(ctx, FLATPAGE_PERM);
    const rows = await ctx.db.query("flatPages").collect();
    rows.sort((a, b) => a.url.localeCompare(b.url));

    return rows;
  },
});

function normaliseUrl(url: string): string {
  const trimmed = url.trim();

  if (!trimmed.startsWith("/")) throw invalid("A flat page URL must start with a slash.");

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export const createFlatPage = mutation({
  args: {
    url: v.string(),
    title: v.string(),
    content: v.string(),
    enableComments: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"flatPages">> => {
    const editor = await requirePerm(ctx, FLATPAGE_PERM);
    const url = normaliseUrl(args.url);

    const clash = await ctx.db
      .query("flatPages")
      .withIndex("by_url", (q) => q.eq("url", url))
      .first();

    if (clash) throw invalid(`A flat page already lives at ${url}.`);

    const id = await ctx.db.insert("flatPages", {
      url,
      title: args.title,
      content: args.content,
      enableComments: args.enableComments,
    });

    await writeRevision(
      ctx,
      "flatPage",
      id,
      await ctx.db.get(id),
      editor._id,
      args.reason ?? "Created flat page",
    );

    return id;
  },
});

export const updateFlatPage = mutation({
  args: {
    id: v.id("flatPages"),
    url: v.optional(v.string()),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    enableComments: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const editor = await requirePerm(ctx, FLATPAGE_PERM);
    const row = await ctx.db.get(args.id);

    if (!row) throw notFound("Flat page");

    const patch: Partial<Doc<"flatPages">> = {};

    if (args.url !== undefined) {
      const url = normaliseUrl(args.url);

      if (url !== row.url) {
        const clash = await ctx.db
          .query("flatPages")
          .withIndex("by_url", (q) => q.eq("url", url))
          .first();

        if (clash) throw invalid(`A flat page already lives at ${url}.`);
      }

      patch.url = url;
    }

    if (args.title !== undefined) patch.title = args.title;

    if (args.content !== undefined) patch.content = args.content;

    if (args.enableComments !== undefined) patch.enableComments = args.enableComments;

    await writeRevision(ctx, "flatPage", args.id, row, editor._id, args.reason ?? "Edited flat page");
    await ctx.db.patch(args.id, patch);
  },
});

export const deleteFlatPage = mutation({
  args: { id: v.id("flatPages"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const editor = await requirePerm(ctx, FLATPAGE_PERM);
    const row = await ctx.db.get(id);

    if (!row) throw notFound("Flat page");
    await writeRevision(ctx, "flatPage", id, row, editor._id, reason ?? "Deleted flat page");
    await ctx.db.delete(id);
  },
});

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export const updateSettings = mutation({
  args: {
    siteName: v.optional(v.string()),
    siteLongName: v.optional(v.string()),
    siteAdminEmail: v.optional(v.string()),
    registrationOpen: v.optional(v.boolean()),
    defaultUserTimezone: v.optional(v.string()),
    defaultUserLanguageKey: v.optional(v.string()),
    problemsPerPage: v.optional(v.number()),
    commentsPerPage: v.optional(v.number()),
    submissionsPerPage: v.optional(v.number()),
    userRankingsPerPage: v.optional(v.number()),
    blogPostsPerPage: v.optional(v.number()),
    ticketsPerPage: v.optional(v.number()),
    ratingRatios: v.optional(v.array(v.number())),
    requireStaffTwoFactor: v.optional(v.boolean()),
    pdfEnabled: v.optional(v.boolean()),
    mossApiKey: v.optional(v.string()),
    analytics: v.optional(v.string()),
    enableComments: v.optional(v.boolean()),
    commentVoteHideThreshold: v.optional(v.number()),
    commentReplyTimeframeDays: v.optional(v.number()),
    commentMaxBodyLength: v.optional(v.number()),
    blogNewProblemCount: v.optional(v.number()),
    statsLanguageThreshold: v.optional(v.number()),
    submissionSourceVisibility: v.optional(
      v.union(v.literal("all"), v.literal("all-solved"), v.literal("only-own")),
    ),
    submissionLimitPerMinute: v.optional(v.number()),
    maxSubmissionsPerProblem: v.optional(v.number()),
    ppStep: v.optional(v.number()),
    ppEntries: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const editor = await requireSuperuser(ctx);
    const { reason, ...patch } = args;

    for (const [key, value] of Object.entries(patch)) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw invalid(`${key} must be a number.`);
      }
    }

    if (patch.commentReplyTimeframeDays !== undefined && patch.commentReplyTimeframeDays < 0) {
      throw invalid("The reply timeframe cannot be negative.");
    }

    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
      .unique();

    if (!existing) throw notFound("Site settings");

    await writeRevision(
      ctx,
      "siteSettings",
      existing._id,
      existing,
      editor._id,
      reason ?? "Edited site settings",
    );
    await ctx.db.patch(existing._id, patch);
  },
});
