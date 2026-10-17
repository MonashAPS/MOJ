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
  PARTICIPATION_LIVE,
  type ProblemScoring,
  type ScoringBest,
  type ScoringMeasure,
  scoringPoints,
} from "@moj/core";
import { type Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { problemScoring } from "../schema";

/** What the staff console and the problems API send: a kind, or `standard` for none. */
export const scoringChoice = v.union(v.object({ kind: v.literal("standard") }), ...problemScoring.members);

export function scoringFromChoice(choice: Infer<typeof scoringChoice>): ProblemScoring | undefined {
  return choice.kind === "standard" ? undefined : choice;
}

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
 * The contest problem whose best a submission counts towards, if any. Only a
 * live participation's do: a virtual or spectating entrant is scored against
 * the live best but never moves it, so nobody who sat the contest loses
 * points to someone who took it afterwards.
 */
async function liveContestProblem(
  ctx: QueryCtx,
  submission: Doc<"submissions">,
): Promise<Id<"contestProblems"> | undefined> {
  if (!submission.contestProblemId || !submission.participationId) return undefined;
  const participation = await ctx.db.get(submission.participationId);

  return participation?.virtual === PARTICIPATION_LIVE ? submission.contestProblemId : undefined;
}

/**
 * Grading end on a scored problem: measure the submission, fold it into its
 * practice scope and, from a live participation, its contest problem's, and
 * return its measure and practice points. Null for standard scoring.
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
  const contestProblemId = await liveContestProblem(ctx, submission);

  if (contestProblemId) await foldIntoScope(ctx, scoring, problem._id, contestProblemId, measure);

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

  const contestProblemId = await liveContestProblem(ctx, submission);
  const scopes = contestProblemId ? [undefined, contestProblemId] : [undefined];

  for (const scope of scopes) {
    const best = await scopeBest(ctx, problem._id, scope);

    if (!holdsBest(problem.scoring, best, measure)) continue;
    await ctx.scheduler.runAfter(0, internal.scoring.rebuildBest, {
      problemId: problem._id,
      contestProblemId: scope,
    });
  }
}

/**
 * Each scored problem in a contest, keyed by contest problem, with its live
 * best: what a live and a virtual participation alike are scored against.
 */
export async function contestScoring(
  ctx: QueryCtx,
  contestProblems: readonly Doc<"contestProblems">[],
): Promise<Map<Id<"contestProblems">, ScopeScoring>> {
  const scored = new Map<Id<"contestProblems">, ScopeScoring>();

  for (const contestProblem of contestProblems) {
    const problem = await ctx.db.get(contestProblem.problemId);

    // Staff score a manually graded problem's submissions themselves.
    if (!problem?.scoring || problem.manualGrading) continue;
    scored.set(contestProblem._id, {
      scoring: problem.scoring,
      best: await scopeBest(ctx, problem._id, contestProblem._id),
    });
  }

  return scored;
}

/**
 * A problem changing kind drops its bests: a new kind starts from nothing, and
 * a rejudge measures the submissions that were graded under the old one.
 */
export async function resetBests(ctx: MutationCtx, problemId: Id<"problems">): Promise<void> {
  const rows = await ctx.db
    .query("scoringBests")
    .withIndex("by_problem_contestProblem", (q) => q.eq("problemId", problemId))
    .collect();

  for (const row of rows) await ctx.db.delete(row._id);
}
