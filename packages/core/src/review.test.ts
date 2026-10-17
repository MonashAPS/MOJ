import { describe, expect, it } from "vitest";
import { isFullSolve } from "./points";
import { ReviewScoreError, reviewOutcome } from "./review";
import { resultClassFromCode } from "./verdicts";

describe("reviewOutcome", () => {
  it("gives full marks an accept that counts as solved", () => {
    const outcome = reviewOutcome(100, 100, 100);

    expect(outcome).toEqual({ result: "AC", casePoints: 100, caseTotal: 100, points: 100 });
    expect(resultClassFromCode(outcome.result, outcome.casePoints, outcome.caseTotal)).toBe("AC");
    expect(isFullSolve(outcome)).toBe(true);
  });

  it("reads part marks as a partial accept that is not a solve", () => {
    const outcome = reviewOutcome(30, 50, 100);

    expect(outcome).toEqual({ result: "AC", casePoints: 30, caseTotal: 50, points: 60 });
    expect(resultClassFromCode(outcome.result, outcome.casePoints, outcome.caseTotal)).toBe("_AC");
    expect(isFullSolve(outcome)).toBe(false);
  });

  it("gives no marks a wrong answer", () => {
    expect(reviewOutcome(0, 10, 100)).toEqual({ result: "WA", casePoints: 0, caseTotal: 10, points: 0 });
  });

  it("scales practice points by the problem's own, whatever the contest problem is worth", () => {
    expect(reviewOutcome(1, 3, 10).points).toBe(3.333);
  });

  it("refuses a score outside the range, or nothing to score out of", () => {
    expect(() => reviewOutcome(-1, 10, 10)).toThrow(ReviewScoreError);
    expect(() => reviewOutcome(11, 10, 10)).toThrow(ReviewScoreError);
    expect(() => reviewOutcome(Number.NaN, 10, 10)).toThrow(ReviewScoreError);
    expect(() => reviewOutcome(0, 0, 10)).toThrow(ReviewScoreError);
  });
});
