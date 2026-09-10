/**
 * User points, performance points and problem statistics.
 *
 * Source: judge/models/profile.py (`Profile.calculate_points`),
 * judge/models/problem.py (`Problem.update_stats`) and judge/utils/ranker.py.
 */

import type { Id, SubmissionResult } from './types';

/** `settings.DMOJ_PP_STEP`. */
export const PP_STEP = 0.95;
/** `settings.DMOJ_PP_ENTRIES`. */
export const PP_ENTRIES = 100;

/** `[PP_STEP ** i for i in range(PP_ENTRIES)]` (`Profile._pp_table`). */
export const PP_TABLE: readonly number[] = Array.from({ length: PP_ENTRIES }, (_unused, i) =>
  PP_STEP ** i,
);

/** `settings.DMOJ_PP_BONUS_FUNCTION`: `300 * (1 - 0.997 ** n)`. */
export function ppBonus(problemCount: number): number {
  return 300 * (1 - 0.997 ** problemCount);
}

export interface PointsSubmissionRow {
  readonly problemId: Id;
  /** `Submission.points`; null means the submission was never scored. */
  readonly points?: number | null;
  readonly result?: SubmissionResult | null;
  readonly casePoints: number;
  readonly caseTotal: number;
  readonly isArchived?: boolean;
  /**
   * `Problem.get_public_problems()`: public and not organization-private.
   * Only these count towards points, problem count and performance points.
   * Defaults to true so a pre-filtered list can be passed straight in.
   */
  readonly isPublicProblem?: boolean;
}

export interface ProfilePoints {
  readonly points: number;
  readonly problemCount: number;
  readonly performancePoints: number;
}

/** A submission that fully solved its problem. */
export function isFullSolve(submission: {
  readonly result?: SubmissionResult | null;
  readonly casePoints: number;
  readonly caseTotal: number;
}): boolean {
  return submission.result === 'AC' && submission.casePoints >= submission.caseTotal;
}

/**
 * `Profile.calculate_points()` (judge/models/profile.py:242).
 *
 * `points` is the sum of the best score on each public, non-organization-private
 * problem. `performancePoints` weights those best scores by `PP_STEP ** i` over
 * the hundred highest, then adds a bonus for the number of problems fully
 * solved. `problemCount` counts distinct fully solved problems.
 */
export function calculateProfilePoints(
  submissions: readonly PointsSubmissionRow[],
  table: readonly number[] = PP_TABLE,
): ProfilePoints {
  const bestPoints = new Map<Id, number>();
  const solved = new Set<Id>();

  for (const submission of submissions) {
    if (submission.isArchived) continue;
    if (submission.isPublicProblem === false) continue;

    if (submission.points !== null && submission.points !== undefined) {
      const current = bestPoints.get(submission.problemId);
      if (current === undefined || submission.points > current) {
        bestPoints.set(submission.problemId, submission.points);
      }
    }
    if (isFullSolve(submission)) solved.add(submission.problemId);
  }

  // `.filter(max_points__gt=0).order_by('-max_points')`
  const data = [...bestPoints.values()].filter((value) => value > 0).sort((a, b) => b - a);

  let points = 0;
  for (const value of data) points += value;

  const entries = Math.min(data.length, table.length);
  let performancePoints = 0;
  for (let i = 0; i < entries; i++) performancePoints += (table[i] as number) * (data[i] as number);
  performancePoints += ppBonus(solved.size);

  return { points, problemCount: solved.size, performancePoints };
}

export interface ProblemStatsSubmissionRow {
  readonly profileId: Id;
  readonly result?: SubmissionResult | null;
  readonly casePoints: number;
  readonly caseTotal: number;
  readonly isArchived?: boolean;
  /** `user__is_unlisted`: unlisted users are excluded from problem statistics. */
  readonly isUserUnlisted?: boolean;
}

export interface ProblemStats {
  /** Distinct users with a full solve. */
  readonly userCount: number;
  /** Percentage of counted submissions that fully solved the problem. */
  readonly acRate: number;
}

/** `Problem.update_stats()` (judge/models/problem.py:396). */
export function computeProblemStats(
  submissions: readonly ProblemStatsSubmissionRow[],
): ProblemStats {
  let total = 0;
  let accepted = 0;
  const solvers = new Set<Id>();

  for (const submission of submissions) {
    if (submission.isUserUnlisted) continue;
    if (submission.isArchived) continue;
    total += 1;
    if (isFullSolve(submission)) {
      accepted += 1;
      solvers.add(submission.profileId);
    }
  }

  return {
    userCount: solvers.size,
    acRate: total ? (100.0 * accepted) / total : 0,
  };
}

export interface RankedItem<T> {
  readonly rank: number;
  readonly item: T;
}

/**
 * `judge/utils/ranker.py:ranker`.
 *
 * Standard competition ranking over an already-sorted sequence: equal keys
 * share a rank and the next distinct key skips ahead by the size of the tie
 * (1, 1, 3, ...). `startRank` matches DMOJ's `rank` argument, which is the rank
 * *before* the first item, so the default 0 makes the first item rank 1.
 */
export function ranker<T>(
  items: readonly T[],
  key: (item: T) => unknown = (item) => (item as { points?: unknown }).points,
  startRank = 0,
): RankedItem<T>[] {
  const ranked: RankedItem<T>[] = [];
  let rank = startRank;
  let delta = 1;
  let last: unknown = Symbol('unset');

  for (const item of items) {
    const current = key(item);
    if (current !== last) {
      rank += delta;
      delta = 0;
    }
    delta += 1;
    ranked.push({ rank, item });
    last = current;
  }
  return ranked;
}
