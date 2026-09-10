/**
 * Reads the `/problems/` filter panel needs and `problems.list` does not return.
 *
 * `problems.list` answers a *filtered* page; the panel has to draw every option it
 * could offer, with the facet count beside it (DESIGN section 17.1), before the
 * viewer has picked anything. That is a different query over the same corpus, so
 * it lives beside the page rather than growing another return field onto `list`.
 */

import { problemIsVisibleTo } from "@moj/core";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { loadViewerContext, toCoreProblem } from "../problems";

/** The same cap `problems.list` scans behind. */
const MAX_SCAN = 20_000;

export const filterOptions = query({
  args: { contestLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const viewer = await loadViewerContext(ctx);

    // Inside a contest DMOJ drops the filter form entirely, so the panel has
    // nothing to draw and this query has nothing to count.
    if (viewer.inContest) {
      return { inContest: true, types: [], groups: [], contests: [], points: { min: 0, max: 0 } };
    }

    const visible = (await ctx.db.query("problems").take(MAX_SCAN)).filter((row) =>
      problemIsVisibleTo(toCoreProblem(row), viewer.core),
    );

    const typeCounts = new Map<string, number>();
    const groupCounts = new Map<string, number>();
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of visible) {
      for (const id of row.typeIds) typeCounts.set(id, (typeCounts.get(id) ?? 0) + 1);
      groupCounts.set(row.groupId, (groupCounts.get(row.groupId) ?? 0) + 1);
      if (row.points < min) min = row.points;
      if (row.points > max) max = row.points;
    }

    const types = [];
    for (const row of await ctx.db.query("problemTypes").collect()) {
      types.push({ name: row.name, fullName: row.fullName, count: typeCounts.get(row._id) ?? 0 });
    }
    types.sort((a, b) => b.count - a.count || a.fullName.localeCompare(b.fullName));

    const groups = [];
    for (const row of await ctx.db.query("problemGroups").collect()) {
      groups.push({ name: row.name, fullName: row.fullName, count: groupCounts.get(row._id) ?? 0 });
    }
    groups.sort((a, b) => a.fullName.localeCompare(b.fullName));

    // Only contests that actually carry a problem the viewer can see; a contest
    // filter that returns nothing is worse than no option at all.
    const limit = Math.max(1, Math.min(Math.floor(args.contestLimit ?? 200), 500));
    const visibleIds = new Set(visible.map((row) => row._id as string));
    const contests: { key: string; name: string; startTime: number; problemCount: number }[] = [];
    const rows = (await ctx.db.query("contests").collect()).filter(
      (row: Doc<"contests">) => row.isVisible,
    );
    rows.sort((a, b) => b.startTime - a.startTime);
    for (const contest of rows) {
      if (contests.length >= limit) break;
      const links = await ctx.db
        .query("contestProblems")
        .withIndex("by_contest_order", (q) => q.eq("contestId", contest._id))
        .collect();
      const count = links.filter((link) => visibleIds.has(link.problemId as string)).length;
      if (count === 0) continue;
      contests.push({ key: contest.key, name: contest.name, startTime: contest.startTime, problemCount: count });
    }

    return {
      inContest: false,
      types,
      groups,
      contests,
      points: {
        min: Number.isFinite(min) ? min : 0,
        max: Number.isFinite(max) ? max : 0,
      },
    };
  },
});
