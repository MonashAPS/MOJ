/**
 * Staff-scored problems (`problems.manualGrading`): no judge runs a submission,
 * it waits as `RV` until someone who may edit the problem or the contest gives
 * it a score by hand.
 *
 * The score is kept the way a judged submission keeps its case score, as
 * `casePoints` out of `caseTotal`, so every rule downstream (practice points,
 * contest points, the solved check, problem stats) reads it unchanged. A score
 * is out of the contest problem's points for a contest submission and out of
 * the problem's points otherwise, which is the number the reviewer sees beside
 * the submission.
 */

import type { SubmissionResult } from "./types";
import { pyRound } from "./util/number";

export interface ReviewOutcome {
  /** `AC` for any credit, which reads as a partial accept below full marks; `WA` for none. */
  readonly result: Extract<SubmissionResult, "AC" | "WA">;
  readonly casePoints: number;
  readonly caseTotal: number;
  /** Practice points, out of the problem's own. Partial whatever the problem says. */
  readonly points: number;
}

export class ReviewScoreError extends Error {}

/** What a score of `score` out of `outOf` writes onto a submission to a problem worth `problemPoints`. */
export function reviewOutcome(score: number, outOf: number, problemPoints: number): ReviewOutcome {
  if (!Number.isFinite(outOf) || outOf <= 0) {
    throw new ReviewScoreError("This submission's problem is worth no points to score out of.");
  }

  if (!Number.isFinite(score) || score < 0 || score > outOf) {
    throw new ReviewScoreError(`A score must be between 0 and ${outOf}.`);
  }

  const casePoints = pyRound(score, 3);

  return {
    result: casePoints > 0 ? "AC" : "WA",
    casePoints,
    caseTotal: outOf,
    points: pyRound((casePoints / outOf) * problemPoints, 3),
  };
}
