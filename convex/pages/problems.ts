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
import type { Doc, Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { matchesFilter, type RejudgeFilter, toIdRange } from "../jobs";
import { optionalViewer } from "../lib/auth";
import { forbidden } from "../lib/errors";
import { canSeeContestAssociation, loadViewerContext, toCoreProblem } from "../problems";

/** The same cap `problems.list` scans behind. */
const MAX_SCAN = 20_000;

export const filterOptions = query({
  args: { contestLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const viewer = await loadViewerContext(ctx);

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
    const visibleIds = new Set(visible.map((row) => row._id));
    const contests: { key: string; name: string; startTime: number; problemCount: number }[] = [];

    const rows = (await ctx.db.query("contests").collect()).filter((row: Doc<"contests">) =>
      canSeeContestAssociation(row, viewer),
    );

    rows.sort((a, b) => b.startTime - a.startTime);

    for (const contest of rows) {
      if (contests.length >= limit) break;

      const links = await ctx.db
        .query("contestProblems")
        .withIndex("by_contest_order", (q) => q.eq("contestId", contest._id))
        .collect();

      const count = links.filter((link) => visibleIds.has(link.problemId)).length;

      if (count === 0) continue;
      contests.push({
        key: contest.key,
        name: contest.name,
        startTime: contest.startTime,
        problemCount: count,
      });
    }

    return {
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

/* -------------------------------------------------------------------------- */
/* Rejudge preview                                                            */
/* -------------------------------------------------------------------------- */

/**
 * DMOJ's `problem_submissions_rejudge_preview`: how many submissions the filter
 * on `/problem/<code>/manage/submission` would put back in the queue, so the
 * confirmation can name the number before anything is scheduled.
 *
 * The filter is `jobs.matchesFilter`, the same predicate the job itself runs, so
 * the preview cannot drift from the work.
 */
export const rejudgePreview = query({
  args: {
    problemCode: v.string(),
    idRange: v.optional(v.array(v.number())),
    languageKeys: v.optional(v.array(v.string())),
    results: v.optional(v.array(v.string())),
    archiveLocked: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const profile = await optionalViewer(ctx);

    if (!profile || !(profile.isStaff || profile.isSuperuser)) throw forbidden("Staff only.");

    const problem = await ctx.db
      .query("problems")
      .withIndex("by_code", (q) => q.eq("code", args.problemCode))
      .unique();

    if (!problem) return { count: 0, capped: false };

    const languageIds: Id<"languages">[] = [];

    for (const key of args.languageKeys ?? []) {
      const language = await ctx.db
        .query("languages")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();

      if (language) languageIds.push(language._id);
    }

    const filter: RejudgeFilter = {
      problemId: problem._id,
      idRange: toIdRange(args.idRange),
      languageIds: languageIds.length > 0 ? languageIds : undefined,
      results: args.results && args.results.length > 0 ? args.results : undefined,
      archiveLocked: args.archiveLocked ?? true,
    };

    const now = Date.now();

    const rows = await ctx.db
      .query("submissions")
      .withIndex("by_problem_date", (q) => q.eq("problemId", problem._id))
      .take(MAX_SCAN);

    return {
      count: rows.filter((row) => matchesFilter(row, filter, now)).length,
      capped: rows.length >= MAX_SCAN,
    };
  },
});
