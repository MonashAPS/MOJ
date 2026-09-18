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
 * scoreboard.
 */

import type { ContestProblemRow, ContestSubmissionRow, Id } from "../types";
import { orderedProblemGroups } from "./base";

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
  /** Every submission the judge actually ran, up to and including the solve. */
  readonly attempts: number;
}

/**
 * How many times a problem was gone at.
 *
 * A scoreboard cell says "3 tries", which is the submissions the judge ran —
 * so an internal error, and a compile error the judge refused, are not held
 * against anyone, the same rule the penalty uses. A solved problem counts the
 * solve itself; an unsolved one counts everything.
 */
export function attemptCount(submissions: readonly ContestSubmissionRow[], solvedAt: number | null): number {
  const scored = submissions.filter(counts);

  return solvedAt === null ? scored.length : scored.filter((row) => row.date <= solvedAt).length;
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

  for (const [problemId, submissions] of orderedProblemGroups(groups, contestProblems)) {
    const points = Math.max(...submissions.map((submission) => submission.contestPoints));

    const time = Math.min(
      ...submissions
        .filter((submission) => submission.contestPoints === points)
        .map((submission) => submission.date),
    );

    // Counted whatever the format's penalty is: a cell says how many tries it
    // took even where nothing is added to the clock for them.
    const attempts = attemptCount(submissions, points ? time : null);
    const penaltyCount = penaltyMinutes ? (points ? attempts - 1 : attempts) : 0;

    rows.push({ problemId, points, time, penaltyCount, attempts });
  }

  return rows;
}
