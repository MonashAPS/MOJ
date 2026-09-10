/**
 * The scoring core shared by `atcoder` and `icpc`.
 *
 * Both formats run the same query (judge/contest_format/atcoder.py:47 and
 * icpc.py:47): per contest problem, `MAX(contest submission points)` and the
 * earliest submission date that reached it, followed by the same penalty count
 * in Python.
 *
 * The penalty count ignores submissions with no result at all (an internal
 * error can leave `result` null) and submissions that were IE or CE. Note that
 * DMOJ does *not* ignore aborted (AB) submissions here, unlike the hall
 * scoreboard; see docs/DMOJ_RULES.md.
 */

import type { ContestProblemRow, ContestSubmissionRow, Id } from "../types";
import { orderedProblemIds } from "./base";

/** Results that never count towards an ICPC/AtCoder penalty. */
export const PENALTY_IGNORED_RESULTS: readonly string[] = ["IE", "CE"];

export interface MaxPointsRow {
  readonly problemId: Id;
  /** `MAX(cs.points)` over every contest submission on the problem. */
  readonly points: number;
  /** `MIN(date)` among the submissions that scored `points`, ms since epoch. */
  readonly time: number;
  /** DMOJ's `prev`: rejected submissions counted for the penalty. */
  readonly penaltyCount: number;
}

function counts(submission: ContestSubmissionRow): boolean {
  const result = submission.result;
  if (result === null || result === undefined) return false;
  return !PENALTY_IGNORED_RESULTS.includes(result);
}

export function computeMaxPointsRows(
  groups: Map<Id, ContestSubmissionRow[]>,
  contestProblems: readonly ContestProblemRow[],
  penaltyMinutes: number,
): MaxPointsRow[] {
  const rows: MaxPointsRow[] = [];

  for (const problemId of orderedProblemIds(groups, contestProblems)) {
    const submissions = groups.get(problemId) as ContestSubmissionRow[];
    const points = Math.max(...submissions.map((submission) => submission.contestPoints));
    const time = Math.min(
      ...submissions
        .filter((submission) => submission.contestPoints === points)
        .map((submission) => submission.date),
    );

    let penaltyCount = 0;
    if (penaltyMinutes) {
      const scored = submissions.filter(counts);
      penaltyCount = points
        ? scored.filter((submission) => submission.date <= time).length - 1
        : scored.length;
    }

    rows.push({ problemId, points, time, penaltyCount });
  }

  return rows;
}
