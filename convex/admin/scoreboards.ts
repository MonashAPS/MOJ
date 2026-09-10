/**
 * Staff console: hall scoreboard events (SPEC section 8, "scoreboards").
 *
 * These rows replace the fork's hard-coded scoreboard setting, so editing one is
 * a deploy-free change to what the hall display shows. Editing needs
 * `judge.edit_all_contest` or superuser, the same bar as the reveal.
 */

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { type MutationCtx, mutation, query } from "../_generated/server";
import { hasPerm, isStaff, optionalViewer, requireViewer } from "../lib/auth";
import { forbidden, invalid, mojError, notFound } from "../lib/errors";

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const THEMES = ["default", "olympics"];

async function requireScoreboardEditor(ctx: MutationCtx) {
  const profile = await requireViewer(ctx);
  if (!hasPerm(profile, "judge.edit_all_contest")) {
    throw forbidden("Missing permission judge.edit_all_contest.");
  }
  return profile;
}

async function writeRevision(
  ctx: MutationCtx,
  entityId: string,
  snapshot: unknown,
  authorProfileId: Id<"profiles">,
  reason: string,
): Promise<void> {
  await ctx.db.insert("revisions", {
    entityType: "scoreboardEvent",
    entityId,
    snapshot,
    authorProfileId,
    reason: reason.trim() || "Edited from the staff console",
    createdAt: Date.now(),
  });
}

async function resolveContests(ctx: MutationCtx, keys: readonly string[]): Promise<Id<"contests">[]> {
  const ids: Id<"contests">[] = [];
  const missing: string[] = [];
  for (const key of keys) {
    const contest = await ctx.db
      .query("contests")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (contest) ids.push(contest._id);
    else missing.push(key);
  }
  if (missing.length) throw invalid(`Unknown contest(s): ${missing.join(", ")}`);
  if (ids.length === 0) throw invalid("A scoreboard needs at least one contest.");
  return ids;
}

export type AdminScoreboardRow = Doc<"scoreboardEvents"> & { contestKeys: string[] };

export const list = query({
  args: {},
  handler: async (ctx): Promise<AdminScoreboardRow[]> => {
    const profile = await optionalViewer(ctx);
    if (!isStaff(profile)) return [];
    const rows = await ctx.db.query("scoreboardEvents").collect();
    const out: AdminScoreboardRow[] = [];
    for (const row of rows) {
      const contestKeys: string[] = [];
      for (const id of row.contestIds) {
        const contest = await ctx.db.get(id);
        if (contest) contestKeys.push(contest.key);
      }
      out.push({ ...row, contestKeys });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  },
});

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<AdminScoreboardRow | null> => {
    const profile = await optionalViewer(ctx);
    if (!isStaff(profile)) return null;
    const row = await ctx.db
      .query("scoreboardEvents")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) return null;
    const contestKeys: string[] = [];
    for (const id of row.contestIds) {
      const contest = await ctx.db.get(id);
      if (contest) contestKeys.push(contest.key);
    }
    return { ...row, contestKeys };
  },
});

export const create = mutation({
  args: {
    key: v.string(),
    name: v.string(),
    contestKeys: v.array(v.string()),
    theme: v.optional(v.string()),
    flagUrlTemplate: v.optional(v.union(v.string(), v.null())),
    badgeOrganizationSlugs: v.optional(v.array(v.string())),
    inPersonOrganizationSlug: v.optional(v.union(v.string(), v.null())),
    freezeMinutes: v.optional(v.number()),
    isPublic: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"scoreboardEvents">> => {
    const profile = await requireScoreboardEditor(ctx);
    const key = args.key.trim();
    if (!KEY_PATTERN.test(key)) {
      throw invalid("Scoreboard keys use lowercase letters, digits, '-' and '_'.");
    }
    const existing = await ctx.db
      .query("scoreboardEvents")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) throw mojError("CONFLICT", "That scoreboard key is already taken.");

    const theme = args.theme ?? "default";
    if (!THEMES.includes(theme)) throw invalid(`Unknown theme "${theme}".`);
    if (args.flagUrlTemplate && !args.flagUrlTemplate.includes("{username}")) {
      throw invalid("Flag patterns take {username} and nothing else.");
    }
    const freezeMinutes = args.freezeMinutes ?? 60;
    if (freezeMinutes < 0) throw invalid("The freeze cannot be negative.");

    const id = await ctx.db.insert("scoreboardEvents", {
      key,
      name: args.name.trim() || key,
      contestIds: await resolveContests(ctx, args.contestKeys),
      theme,
      flagUrlTemplate: args.flagUrlTemplate ?? undefined,
      badgeOrganizationSlugs: args.badgeOrganizationSlugs ?? [],
      inPersonOrganizationSlug: args.inPersonOrganizationSlug ?? undefined,
      freezeMinutes,
      isPublic: args.isPublic ?? true,
    });

    await writeRevision(ctx, id, { key, name: args.name }, profile._id, args.reason ?? "Created scoreboard");
    return id;
  },
});

export const update = mutation({
  args: {
    key: v.string(),
    name: v.optional(v.string()),
    contestKeys: v.optional(v.array(v.string())),
    theme: v.optional(v.string()),
    flagUrlTemplate: v.optional(v.union(v.string(), v.null())),
    badgeOrganizationSlugs: v.optional(v.array(v.string())),
    inPersonOrganizationSlug: v.optional(v.union(v.string(), v.null())),
    freezeMinutes: v.optional(v.number()),
    isPublic: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireScoreboardEditor(ctx);
    const row = await ctx.db
      .query("scoreboardEvents")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (!row) throw notFound(`Scoreboard "${args.key}"`);

    const patch: Partial<Doc<"scoreboardEvents">> = {};
    if (args.name !== undefined) patch.name = args.name.trim() || row.key;
    if (args.contestKeys !== undefined) {
      patch.contestIds = await resolveContests(ctx, args.contestKeys);
    }
    if (args.theme !== undefined) {
      if (!THEMES.includes(args.theme)) throw invalid(`Unknown theme "${args.theme}".`);
      patch.theme = args.theme;
    }
    if (args.flagUrlTemplate !== undefined) {
      if (args.flagUrlTemplate && !args.flagUrlTemplate.includes("{username}")) {
        throw invalid("Flag patterns take {username} and nothing else.");
      }
      patch.flagUrlTemplate = args.flagUrlTemplate ?? undefined;
    }
    if (args.badgeOrganizationSlugs !== undefined) {
      patch.badgeOrganizationSlugs = args.badgeOrganizationSlugs;
    }
    if (args.inPersonOrganizationSlug !== undefined) {
      patch.inPersonOrganizationSlug = args.inPersonOrganizationSlug ?? undefined;
    }
    if (args.freezeMinutes !== undefined) {
      if (args.freezeMinutes < 0) throw invalid("The freeze cannot be negative.");
      patch.freezeMinutes = args.freezeMinutes;
    }
    if (args.isPublic !== undefined) patch.isPublic = args.isPublic;
    if (Object.keys(patch).length === 0) return null;

    await ctx.db.patch(row._id, patch);
    await writeRevision(ctx, row._id, patch, profile._id, args.reason ?? "Edited scoreboard");
    return null;
  },
});

export const remove = mutation({
  args: { key: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { key, reason }): Promise<null> => {
    const profile = await requireScoreboardEditor(ctx);
    const row = await ctx.db
      .query("scoreboardEvents")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) throw notFound(`Scoreboard "${key}"`);
    await ctx.db.delete(row._id);
    await writeRevision(ctx, row._id, { key: row.key }, profile._id, reason ?? "Deleted scoreboard");
    return null;
  },
});
