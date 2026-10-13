/**
 * Problem scoring kinds on the database side: the `scoringBests` rows, and the
 * hooks grading and requeueing call to keep them right.
 *
 * A scored problem has a practice scope (every submission of the problem,
 * scored into `points`) and a scope per contest problem (its submissions,
 * scored into `contestPoints`). Grading folds the new measure into both; when
 * either best moves, every other submission in that scope is worth something
 * different, so `convex/scoring.ts` rescores the scope a chunk at a time. The
 * rules themselves are `@moj/core`'s scoring module.
 */

import {
  type GradedSubmission,
  holdsBest,
  improveBest,
  measureSubmission,
  type ProblemScoring,
  type ScoringBest,
  type ScoringMeasure,
  scoringPoints,
} from "@moj/core";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** A scored problem's kind, with one scope's best. */
export type ScopeScoring = {
  scoring: ProblemScoring;
  best: ScoringBest | null;
};

export async function bestRow(
  ctx: QueryCtx,
  problemId: Id<"problems">,
  contestProblemId: Id<"contestProblems"> | undefined,
): Promise<Doc<"scoringBests"> | null> {
  return await ctx.db
    .query("scoringBests")
    .withIndex("by_problem_contestProblem", (q) =>
      q.eq("problemId", problemId).eq("contestProblemId", contestProblemId),
    )
    .unique();
}

/** The best over a scope: a contest problem's, or the practice one when `contestProblemId` is absent. */
export async function scopeBest(
  ctx: QueryCtx,
  problemId: Id<"problems">,
  contestProblemId?: Id<"contestProblems">,
): Promise<ScoringBest | null> {
  return (await bestRow(ctx, problemId, contestProblemId))?.best ?? null;
}

export async function writeBest(
  ctx: MutationCtx,
  problemId: Id<"problems">,
  contestProblemId: Id<"contestProblems"> | undefined,
  best: ScoringBest | null,
): Promise<void> {
  const row = await bestRow(ctx, problemId, contestProblemId);

  if (best === null) {
    if (row) await ctx.db.delete(row._id);

    return;
  }

  if (row) await ctx.db.patch(row._id, { best });
  else await ctx.db.insert("scoringBests", { problemId, contestProblemId, best });
}

/** Recompute every submission in a scope against its best as it now stands. */
export async function scheduleRescore(
  ctx: MutationCtx,
  problemId: Id<"problems">,
  contestProblemId: Id<"contestProblems"> | undefined,
): Promise<void> {
  if (contestProblemId) {
    await ctx.scheduler.runAfter(0, internal.scoring.rescoreContestProblem, { contestProblemId, index: 0 });
  } else {
    await ctx.scheduler.runAfter(0, internal.scoring.rescorePractice, {
      problemId,
      cursor: null,
      profileIds: [],
    });
  }
}

/**
 * Fold a measure into one scope. A best that moves from one value to another
 * changes what every other submission in the scope is worth, so the scope is
 * rescored; the first best changes nothing else, since nothing else measured.
 */
async function foldIntoScope(
  ctx: MutationCtx,
  scoring: ProblemScoring,
  problemId: Id<"problems">,
  contestProblemId: Id<"contestProblems"> | undefined,
  measure: ScoringMeasure | null,
): Promise<ScoringBest | null> {
  const row = await bestRow(ctx, problemId, contestProblemId);
  const current = row?.best ?? null;
  const next = improveBest(scoring, current, measure);

  if (next === current || next === null) return current;

  if (row) await ctx.db.patch(row._id, { best: next });
  else await ctx.db.insert("scoringBests", { problemId, contestProblemId, best: next });

  if (current !== null) await scheduleRescore(ctx, problemId, contestProblemId);

  return next;
}

/**
 * Grading end on a scored problem: measure the submission, fold it into its
 * practice scope and its contest problem's, and return its measure and
 * practice points. Null for a problem with standard scoring.
 */
export async function scoreGraded(
  ctx: MutationCtx,
  submission: Doc<"submissions">,
  problem: Doc<"problems">,
  graded: Omit<GradedSubmission, "source">,
): Promise<{ measure: ScoringMeasure | null; points: number } | null> {
  const scoring = problem.scoring;

  if (!scoring) return null;

  const source = await ctx.db
    .query("submissionSources")
    .withIndex("by_submission", (q) => q.eq("submissionId", submission._id))
    .unique();

  const measure = measureSubmission(scoring, { ...graded, source: source?.source ?? "" });
  const best = await foldIntoScope(ctx, scoring, problem._id, undefined, measure);

  if (submission.contestProblemId) {
    await foldIntoScope(ctx, scoring, problem._id, submission.contestProblemId, measure);
  }

  return { measure, points: scoringPoints(scoring, measure, best, problem.points) };
}

/**
 * A measured submission going back to the queue stops counting. When a best
 * may have rested on it, that scope's best is rebuilt from what is left.
 */
export async function withdrawMeasure(ctx: MutationCtx, submission: Doc<"submissions">): Promise<void> {
  const measure = submission.scoringMeasure;

  if (!measure) return;
  const problem = await ctx.db.get(submission.problemId);

  if (!problem?.scoring) return;

  const scopes = submission.contestProblemId ? [undefined, submission.contestProblemId] : [undefined];

  for (const contestProblemId of scopes) {
    const best = await scopeBest(ctx, problem._id, contestProblemId);

    if (!holdsBest(problem.scoring, best, measure)) continue;
    await ctx.scheduler.runAfter(0, internal.scoring.rebuildBest, {
      problemId: problem._id,
      contestProblemId,
    });
  }
}

/** Each scored problem in a contest, keyed by contest problem, with its best in this contest. */
export async function contestScoring(
  ctx: QueryCtx,
  contestProblems: readonly Doc<"contestProblems">[],
): Promise<Map<Id<"contestProblems">, ScopeScoring>> {
  const scored = new Map<Id<"contestProblems">, ScopeScoring>();

  for (const contestProblem of contestProblems) {
    const problem = await ctx.db.get(contestProblem.problemId);

    if (!problem?.scoring) continue;
    scored.set(contestProblem._id, {
      scoring: problem.scoring,
      best: await scopeBest(ctx, problem._id, contestProblem._id),
    });
  }

  return scored;
}
