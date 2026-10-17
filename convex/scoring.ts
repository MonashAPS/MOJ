/**
 * Rescoring a scope after its best moved (see `convex/lib/scoring.ts`).
 *
 * A practice scope can hold a problem's whole history, and every author whose
 * points change needs their profile walked again, so the work is a chain of
 * scheduled mutations as the rescore job's is: submissions a page at a time,
 * then profiles a few at a time. A contest scope recomputes each participation
 * with a submission to the contest problem, virtual ones included, which
 * rescores those submissions' contest points on the way. Only live
 * participations make a contest's best.
 */

import { bestOf, PARTICIPATION_LIVE, scoringPoints } from "@moj/core";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { RECOMPUTE_SCAN_LIMIT, recomputeParticipation, recomputeProfilePoints } from "./judging";
import { scheduleRescore, scopeBest, writeBest } from "./lib/scoring";

/** Submissions one practice step rescores. */
export const SCORING_CHUNK = 100;

/** Participations one contest step recomputes; each walks its own submissions. */
export const PARTICIPATION_BATCH = 25;

/** Profile recomputes walk a whole submission history, so they go a few at a time. */
export const PROFILE_BATCH = 10;

/**
 * Rebuild a scope's best from scratch, after a submission that may have held
 * it went back to the queue, then rescore the scope against the result.
 */
export const rebuildBest = internalMutation({
  args: {
    problemId: v.id("problems"),
    contestProblemId: v.optional(v.id("contestProblems")),
  },
  handler: async (ctx, { problemId, contestProblemId }): Promise<null> => {
    const problem = await ctx.db.get(problemId);

    if (!problem?.scoring || problem.manualGrading) return null;

    let submissions: Doc<"submissions">[];

    if (contestProblemId) {
      const contestProblem = await ctx.db.get(contestProblemId);

      if (!contestProblem) return null;

      const rows = await ctx.db
        .query("submissions")
        .withIndex("by_contest_date", (q) => q.eq("contestId", contestProblem.contestId))
        .collect();

      // Only live participations make the contest's best.
      const live = new Map<Id<"contestParticipations">, boolean>();
      submissions = [];

      for (const row of rows) {
        if (row.contestProblemId !== contestProblemId || !row.participationId) continue;

        if (!live.has(row.participationId)) {
          const participation = await ctx.db.get(row.participationId);
          live.set(row.participationId, participation?.virtual === PARTICIPATION_LIVE);
        }

        if (live.get(row.participationId)) submissions.push(row);
      }
    } else {
      submissions = await ctx.db
        .query("submissions")
        .withIndex("by_problem_date", (q) => q.eq("problemId", problemId))
        .order("desc")
        .take(RECOMPUTE_SCAN_LIMIT);
    }

    const best = bestOf(
      problem.scoring,
      submissions.map((row) => row.scoringMeasure),
    );

    await writeBest(ctx, problemId, contestProblemId, best);
    await scheduleRescore(ctx, problemId, contestProblemId);

    return null;
  },
});

/** Practice scope, first phase: every submission's points against the best. */
export const rescorePractice = internalMutation({
  args: {
    problemId: v.id("problems"),
    cursor: v.union(v.string(), v.null()),
    profileIds: v.array(v.id("profiles")),
  },
  handler: async (ctx, args): Promise<null> => {
    const problem = await ctx.db.get(args.problemId);

    if (!problem?.scoring || problem.manualGrading) return null;

    const best = await scopeBest(ctx, problem._id);

    const page = await ctx.db
      .query("submissions")
      .withIndex("by_problem_date", (q) => q.eq("problemId", problem._id))
      .paginate({ numItems: SCORING_CHUNK, cursor: args.cursor });

    const profileIds = new Set<Id<"profiles">>(args.profileIds);

    for (const submission of page.page) {
      // Unscored: still queued, or it never compiled.
      if (submission.points === undefined) continue;
      const points = scoringPoints(problem.scoring, submission.scoringMeasure, best, problem.points);

      if (points === submission.points) continue;
      await ctx.db.patch(submission._id, { points });
      profileIds.add(submission.profileId);
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.scoring.rescorePractice, {
        problemId: problem._id,
        cursor: page.continueCursor,
        profileIds: [...profileIds],
      });

      return null;
    }

    // Only public problems count towards a profile, as at grading end.
    if (profileIds.size > 0 && problem.isPublic && !problem.isOrganizationPrivate) {
      await ctx.scheduler.runAfter(0, internal.scoring.rescoreProfiles, {
        profileIds: [...profileIds],
        index: 0,
      });
    }

    return null;
  },
});

/** Practice scope, second phase: the points of every author whose submission changed. */
export const rescoreProfiles = internalMutation({
  args: {
    profileIds: v.array(v.id("profiles")),
    index: v.number(),
  },
  handler: async (ctx, { profileIds, index }): Promise<null> => {
    const end = Math.min(index + PROFILE_BATCH, profileIds.length);

    for (const profileId of profileIds.slice(index, end)) {
      await recomputeProfilePoints(ctx, profileId);
    }

    if (end < profileIds.length) {
      await ctx.scheduler.runAfter(0, internal.scoring.rescoreProfiles, { profileIds, index: end });
    }

    return null;
  },
});

/**
 * Contest scope: every participation with a submission to the contest
 * problem. The first step finds them and hands the list on.
 */
export const rescoreContestProblem = internalMutation({
  args: {
    contestProblemId: v.id("contestProblems"),
    participationIds: v.optional(v.array(v.id("contestParticipations"))),
    index: v.number(),
  },
  handler: async (ctx, { contestProblemId, participationIds, index }): Promise<null> => {
    let ids = participationIds;

    if (!ids) {
      const contestProblem = await ctx.db.get(contestProblemId);

      if (!contestProblem) return null;

      const submissions = await ctx.db
        .query("submissions")
        .withIndex("by_contest_date", (q) => q.eq("contestId", contestProblem.contestId))
        .collect();

      const found = new Set<Id<"contestParticipations">>();

      for (const submission of submissions) {
        if (submission.contestProblemId === contestProblemId && submission.participationId) {
          found.add(submission.participationId);
        }
      }

      ids = [...found];
    }

    const end = Math.min(index + PARTICIPATION_BATCH, ids.length);

    for (const participationId of ids.slice(index, end)) {
      await recomputeParticipation(ctx, participationId);
    }

    if (end < ids.length) {
      await ctx.scheduler.runAfter(0, internal.scoring.rescoreContestProblem, {
        contestProblemId,
        participationIds: ids,
        index: end,
      });
    }

    return null;
  },
});
