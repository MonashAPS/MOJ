import { describe, expect, it } from "vitest";
import type { SubmissionResult } from "../types";
import {
  bestOf,
  holdsBest,
  improveBest,
  isScoringKind,
  measureSubmission,
  type ProblemScoring,
  type ScoringMeasure,
  sameScoring,
  scoringPoints,
  sourceBytes,
} from "./index";

const golf: ProblemScoring = { kind: "golf" };

function graded(source: string, result: SubmissionResult | null = "AC") {
  return { result, source, testCases: [] };
}

function bytes(count: number): ScoringMeasure {
  return { kind: "golf", bytes: count };
}

describe("sourceBytes", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(sourceBytes("print(1)")).toBe(8);
    expect(sourceBytes("é")).toBe(2);
    expect(sourceBytes("中")).toBe(3);
    expect(sourceBytes("😀")).toBe(4);
    expect(sourceBytes("a中😀")).toBe(8);
  });

  it("ignores trailing whitespace but keeps leading and inner whitespace", () => {
    expect(sourceBytes("print(1)\n")).toBe(8);
    expect(sourceBytes("print(1)\r\n\t  \n")).toBe(8);
    expect(sourceBytes("  print(1)")).toBe(10);
    expect(sourceBytes("a b\nc\n\n")).toBe(5);
  });

  it("counts an empty or blank source as nothing", () => {
    expect(sourceBytes("")).toBe(0);
    expect(sourceBytes(" \n\t")).toBe(0);
  });

  it("counts a lone surrogate as the replacement character an encoder writes", () => {
    expect(sourceBytes("\uD800")).toBe(3);
  });
});

describe("golf measure", () => {
  it("measures an accepted submission by its length", () => {
    expect(measureSubmission(golf, graded("print(1)\n"))).toEqual({ kind: "golf", bytes: 8 });
  });

  it("measures nothing that was not fully accepted", () => {
    for (const result of ["WA", "TLE", "MLE", "RTE", "IR", "OLE", "CE", "IE", "AB", "SC"] as const) {
      expect(measureSubmission(golf, graded("x", result))).toBeNull();
    }

    expect(measureSubmission(golf, graded("x", null))).toBeNull();
  });
});

describe("golf best", () => {
  it("starts at the first accepted length", () => {
    expect(improveBest(golf, null, bytes(40))).toEqual(bytes(40));
  });

  it("moves to a shorter length", () => {
    expect(improveBest(golf, bytes(40), bytes(25))).toEqual(bytes(25));
  });

  it("does not move for a longer length or a tie, and says so by returning the same value", () => {
    const best = bytes(40);

    expect(improveBest(golf, best, bytes(41))).toBe(best);
    expect(improveBest(golf, best, bytes(40))).toBe(best);
  });

  it("does not move for a submission that measured nothing", () => {
    const best = bytes(40);

    expect(improveBest(golf, best, null)).toBe(best);
    expect(improveBest(golf, null, undefined)).toBeNull();
  });

  it("rebuilds the shortest over every language's submissions", () => {
    const python = measureSubmission(golf, graded("print(sum(map(int,input().split())))"));
    const c = measureSubmission(golf, graded('main(a,b){scanf("%d%d",&a,&b);printf("%d",a+b);}'));
    const rejected = measureSubmission(golf, graded("1", "WA"));

    expect(bestOf(golf, [c, rejected, python, undefined])).toEqual(bytes(36));
    expect(bestOf(golf, [rejected])).toBeNull();
    expect(bestOf(golf, [])).toBeNull();
  });

  it("is held by the shortest submissions only", () => {
    expect(holdsBest(golf, bytes(30), bytes(30))).toBe(true);
    expect(holdsBest(golf, bytes(30), bytes(31))).toBe(false);
    expect(holdsBest(golf, null, bytes(30))).toBe(false);
    expect(holdsBest(golf, bytes(30), null)).toBe(false);
  });
});

describe("golf points", () => {
  it("gives the shortest full points and a longer one points × shortest / bytes", () => {
    expect(scoringPoints(golf, bytes(50), bytes(50), 100)).toBe(100);
    expect(scoringPoints(golf, bytes(100), bytes(50), 100)).toBe(50);
    expect(scoringPoints(golf, bytes(200), bytes(50), 40)).toBe(10);
  });

  it("keeps three decimals, as grading-end does", () => {
    expect(scoringPoints(golf, bytes(3), bytes(1), 1)).toBe(0.333);
    expect(scoringPoints(golf, bytes(3), bytes(2), 100)).toBe(66.667);
  });

  it("gives every tied shortest submission full points", () => {
    const best = bestOf(golf, [bytes(30), bytes(30), bytes(45)]);

    expect(scoringPoints(golf, bytes(30), best, 100)).toBe(100);
    expect(scoringPoints(golf, bytes(45), best, 100)).toBe(66.667);
  });

  it("lowers everyone else when a new shortest arrives", () => {
    const first = bytes(100);
    let best = improveBest(golf, null, first);

    expect(scoringPoints(golf, first, best, 100)).toBe(100);

    const shorter = bytes(25);
    const moved = improveBest(golf, best, shorter);

    expect(moved).not.toBe(best);
    best = moved;
    expect(scoringPoints(golf, first, best, 100)).toBe(25);
    expect(scoringPoints(golf, shorter, best, 100)).toBe(100);
  });

  it("scores a submission that was not accepted zero", () => {
    const measure = measureSubmission(golf, graded("x", "WA"));

    expect(scoringPoints(golf, measure, bytes(1), 100)).toBe(0);
    expect(scoringPoints(golf, undefined, null, 100)).toBe(0);
  });

  it("scores across languages on the same byte count", () => {
    const best = bestOf(golf, [bytes(30), bytes(120)]);

    expect(scoringPoints(golf, bytes(120), best, 100)).toBe(25);
  });

  it("never gives more than full points against a best that has not caught up", () => {
    expect(scoringPoints(golf, bytes(10), bytes(50), 100)).toBe(100);
    expect(scoringPoints(golf, bytes(10), null, 100)).toBe(100);
  });

  it("gives an empty accepted source full points", () => {
    expect(scoringPoints(golf, bytes(0), bytes(0), 100)).toBe(100);
  });
});

describe("isScoringKind", () => {
  it("knows golf and nothing else", () => {
    expect(isScoringKind("golf")).toBe(true);
    expect(isScoringKind("standard")).toBe(false);
    expect(isScoringKind("relative")).toBe(false);
  });
});

describe("sameScoring", () => {
  it("treats absent as standard and compares kinds", () => {
    expect(sameScoring(undefined, null)).toBe(true);
    expect(sameScoring(golf, { kind: "golf" })).toBe(true);
    expect(sameScoring(golf, undefined)).toBe(false);
  });
});
