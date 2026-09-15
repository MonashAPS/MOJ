/**
 * The revision history every console edit form shows.
 *
 * `admin/problems.revisions` covers problems; contests, scoreboards, tags,
 * users and the site settings write the same rows under their own
 * `entityType`, so the console reads them all through here and diffs the
 * snapshots client side. `byKey` takes the key a screen already has in its URL
 * and checks the viewer may edit that entity; `byId` takes a document id for
 * the screens whose entity has no key of its own.
 */

import { contestIsEditableBy, problemIsEditableBy } from "@moj/core";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { query } from "../../_generated/server";
import { contestByKey, toContestRow, toViewerRowInContest } from "../../contests/formats";
import { requireStaff } from "../../lib/auth";
import { problemByCode, toCoreProblem } from "../../problems";
import { staffViewer } from "./console";

export type ConsoleRevision = {
  _id: Id<"revisions">;
  createdAt: number;
  reason: string;
  author: string | null;
};

export const byKey = query({
  args: {
    entityType: v.union(v.literal("problem"), v.literal("contest"), v.literal("scoreboardEvent")),
    key: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await staffViewer(ctx);

    if (!viewer) return [];

    let entityId: string | null = null;

    if (args.entityType === "problem") {
      const problem = await problemByCode(ctx, args.key);

      if (problem && problemIsEditableBy(toCoreProblem(problem), viewer.core)) entityId = problem._id;
    } else if (args.entityType === "contest") {
      const contest = await contestByKey(ctx, args.key);
      const contestViewer = await toViewerRowInContest(ctx, viewer.profile);

      if (contest && contestIsEditableBy(toContestRow(contest), contestViewer)) entityId = contest._id;
    } else {
      const event = await ctx.db
        .query("scoreboardEvents")
        .withIndex("by_key", (q) => q.eq("key", args.key))
        .unique();

      if (event) entityId = event._id;
    }

    if (!entityId) return [];
    const key = entityId;
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 50), 200));

    const rows = await ctx.db
      .query("revisions")
      .withIndex("by_entity", (q) => q.eq("entityType", args.entityType).eq("entityId", key))
      .order("desc")
      .take(limit);

    const out = [];

    for (const row of rows) {
      const author = row.authorProfileId ? await ctx.db.get(row.authorProfileId) : null;
      out.push({
        id: row._id,
        createdAt: row.createdAt,
        reason: row.reason,
        author: author?.username ?? null,
        snapshot: row.snapshot ?? null,
      });
    }

    return out;
  },
});

/** Newest first, so the panel reads as a changelog. */
export const byId = query({
  args: {
    entityType: v.string(),
    entityId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConsoleRevision[]> => {
    await requireStaff(ctx);

    const rows = await ctx.db
      .query("revisions")
      .withIndex("by_entity", (q) => q.eq("entityType", args.entityType).eq("entityId", args.entityId))
      .collect();

    rows.sort((a, b) => b.createdAt - a.createdAt);

    const limited = rows.slice(0, Math.max(1, Math.min(args.limit ?? 25, 200)));
    const out: ConsoleRevision[] = [];

    for (const row of limited) {
      const author = row.authorProfileId ? await ctx.db.get(row.authorProfileId) : null;
      out.push({
        _id: row._id,
        createdAt: row.createdAt,
        reason: row.reason,
        author: author ? author.usernameDisplayOverride || author.username : null,
      });
    }

    return out;
  },
});
