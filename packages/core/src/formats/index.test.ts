/**
 * The contest formats, checked against hand-computed cases derived from the
 * SQL in judge/contest_format/*.py.
 */

import { describe, expect, it } from "vitest";
import { createContest, createContestProblem, createParticipation, NOW } from "../test.fixtures";
import type { ContestSubmissionRow, SubmissionTestCaseRow } from "../types";
import {
  bestSolutionState,
  FORMATS,
  FormatConfigError,
  formatChoices,
  getContestLabelForProblem,
  getContestLabels,
  getFormat,
  getFormatOrDefault,
  getLabelForProblem,
  letterLabel,
  numberLabel,
  UnknownContestFormatError,
  updateParticipation,
  validateContestFormatConfig,
} from "./index";

const START = NOW;

const HOURS = 3_600_000;

const contest = createContest("c", {
  startTime: START,
  endTime: START + 5 * HOURS,
  timeLimit: null,
});

const p1 = createContestProblem("c", "one", { points: 100, order: 1 });

const p2 = createContestProblem("c", "two", { points: 100, order: 2 });

const contestProblems = [p1, p2];

const participation = createParticipation("c", "user", { realStart: START });

function minutes(count: number): number {
  return START + count * 60_000;
}

function submission(
  contestProblemId: string,
  minute: number,
  contestPoints: number,
  spec: Partial<ContestSubmissionRow> = {},
): ContestSubmissionRow {
  return {
    id: `${contestProblemId}@${minute}`,
    contestProblemId,
    participationId: participation.id,
    contestPoints,
    casePoints: contestPoints,
    caseTotal: 100,
    result: contestPoints === 100 ? "AC" : "WA",
    status: "D",
    date: minutes(minute),
    ...spec,
  };
}

function run(formatName: string, submissions: ContestSubmissionRow[], config?: unknown) {
  return updateParticipation({
    participation,
    submissions,
    contestProblems,
    contest: { ...contest, formatName, formatConfig: config ?? null },
  });
}

describe("registry", () => {
  it("registers the six DMOJ formats", () => {
    expect(Object.keys(FORMATS).sort()).toEqual(["atcoder", "default", "ecoo", "icpc", "ioi", "ioi16"]);
    expect(getFormat("icpc").displayName).toBe("ICPC");
    expect(() => getFormat("nope")).toThrow(UnknownContestFormatError);
    expect(getFormatOrDefault("nope").name).toBe("default");
    expect(getFormatOrDefault(undefined).name).toBe("default");
    expect(formatChoices()[0]).toEqual(["atcoder", "AtCoder"]);
  });
});

describe("default format", () => {
  const submissions = [submission(p1.id, 10, 30), submission(p1.id, 20, 100), submission(p2.id, 30, 0)];

  it("takes the best score and the latest submission time", () => {
    const update = run("default", submissions);
    expect(update.score).toBe(100);
    // Only problems with a non-zero score add to cumtime.
    expect(update.cumtime).toBe(20 * 60);
    expect(update.tiebreaker).toBe(0);
    expect(update.formatData).toEqual({
      [p1.id]: { time: 20 * 60, points: 100 },
      [p2.id]: { time: 30 * 60, points: 0 },
    });
  });

  it("truncates cumtime the way the integer column does", () => {
    // 20 minutes and 640 milliseconds: DMOJ's format_data keeps the fraction
    // but cumtime is a PositiveIntegerField, so Django's int() drops it.
    const update = run("default", [submission(p1.id, 0, 100, { date: START + 1_200_640 })]);
    expect(update.formatData[p1.id]).toEqual({ time: 1200.64, points: 100 });
    expect(update.cumtime).toBe(1200);
    expect(Number.isInteger(update.cumtime)).toBe(true);
  });

  it("rejects a non-empty config", () => {
    expect(() => validateContestFormatConfig("default", {})).not.toThrow();
    expect(() => validateContestFormatConfig("default", null)).not.toThrow();
    expect(() => validateContestFormatConfig("default", { penalty: 5 })).toThrow(FormatConfigError);
  });

  it("renders a cell and a result", () => {
    const update = run("default", submissions);
    const format = getFormat("default");
    const stored = { ...participation, formatData: update.formatData, score: 100, cumtime: 1200 };

    const cell = format.displayUserProblem(stored, p1, contest);
    expect(cell).toMatchObject({ state: "full-score", points: 100, timeText: "00:20:00" });

    const partial = format.displayUserProblem(stored, p2, contest);
    expect(partial).toMatchObject({ state: "failed-score", points: 0 });

    const missing = format.displayUserProblem({ formatData: {} }, p1, contest);
    expect(missing).toBeNull();

    expect(format.displayParticipationResult(stored, contest)).toEqual({
      points: 100,
      pointsText: "100",
      cumtime: 1200,
      cumtimeText: "00:20:00",
    });

    expect(format.getProblemBreakdown(stored, contestProblems)).toEqual([
      { time: 1200, points: 100 },
      { time: 1800, points: 0 },
    ]);
  });

  it("marks pretest cells while run_pretests_only is set", () => {
    const update = run("default", submissions);
    const format = getFormat("default");
    const pretestContest = { ...contest, runPretestsOnly: true };
    const pretestProblem = { ...p1, isPretested: true };
    const cell = format.displayUserProblem({ formatData: update.formatData }, pretestProblem, pretestContest);
    expect(cell?.state).toBe("pretest-full-score");
    expect(cell?.isPretest).toBe(true);
  });
});

describe("ioi (legacy) format", () => {
  const submissions = [
    submission(p1.id, 10, 30),
    submission(p1.id, 20, 100),
    submission(p1.id, 40, 100),
    submission(p2.id, 30, 0),
  ];

  it("scores the maximum and ignores time without cumtime", () => {
    const update = run("ioi", submissions);
    expect(update.score).toBe(100);
    expect(update.cumtime).toBe(0);
    expect(update.formatData).toEqual({
      [p1.id]: { points: 100, time: 0 },
      [p2.id]: { points: 0, time: 0 },
    });
  });

  it("uses the first submission to reach the maximum when cumtime is on", () => {
    const update = run("ioi", submissions, { cumtime: true });
    expect(update.cumtime).toBe(20 * 60);
    expect(update.formatData[p1.id]).toEqual({ points: 100, time: 20 * 60 });
    // A zero-score problem records its time but adds nothing.
    expect(update.formatData[p2.id]).toEqual({ points: 0, time: 30 * 60 });
  });

  it("validates its config", () => {
    expect(() => validateContestFormatConfig("ioi", { cumtime: true })).not.toThrow();
    expect(() => validateContestFormatConfig("ioi", { cumtime: 1 })).toThrow(
      /invalid type for config key "cumtime"/,
    );
    expect(() => validateContestFormatConfig("ioi", { nope: true })).toThrow(/unknown config key "nope"/);
    expect(() => validateContestFormatConfig("ioi", [])).toThrow(/expects no config or dict/);
  });
});

describe("ioi16 format", () => {
  function batched(
    minute: number,
    cases: SubmissionTestCaseRow[],
    spec: Partial<ContestSubmissionRow> = {},
  ): ContestSubmissionRow {
    return {
      id: `s${minute}`,
      contestProblemId: p1.id,
      participationId: participation.id,
      contestPoints: 0,
      result: "WA",
      status: "D",
      date: minutes(minute),
      testCases: cases,
      ...spec,
    };
  }

  const first = batched(10, [
    { case: 1, status: "AC", points: 10, total: 20, batch: 1 },
    { case: 2, status: "AC", points: 20, total: 20, batch: 1 },
    { case: 3, status: "WA", points: 0, total: 30, batch: 2 },
  ]);

  const second = batched(20, [
    { case: 1, status: "AC", points: 20, total: 20, batch: 1 },
    { case: 2, status: "AC", points: 20, total: 20, batch: 1 },
    { case: 3, status: "AC", points: 30, total: 30, batch: 2 },
  ]);

  const third = batched(30, [
    { case: 1, status: "AC", points: 20, total: 20, batch: 1 },
    { case: 2, status: "WA", points: 0, total: 30, batch: 2 },
  ]);

  it("sums the best score of every batch", () => {
    const update = run("ioi16", [first, second, third]);
    expect(update.score).toBe(50);
    expect(update.formatData[p1.id]).toEqual({ points: 50, time: 0 });
  });

  it("times a problem by the last batch to reach its best score", () => {
    const update = run("ioi16", [first, second, third], { cumtime: true });
    // Batch 1 first hit 20 at minute 20, batch 2 hit 30 at minute 20.
    expect(update.formatData[p1.id]).toEqual({ points: 50, time: 20 * 60 });
    expect(update.cumtime).toBe(20 * 60);
  });

  it("collapses unbatched cases into one pseudo-batch scored by the minimum", () => {
    const unbatched = batched(5, [
      { case: 1, status: "AC", points: 5, total: 10 },
      { case: 2, status: "AC", points: 15, total: 10 },
    ]);

    const update = run("ioi16", [unbatched]);
    expect(update.formatData[p1.id]).toEqual({ points: 5, time: 0 });
  });

  it("ignores submissions that are not fully graded", () => {
    const queued = batched(40, [{ case: 1, status: "AC", points: 100, total: 100, batch: 1 }], {
      status: "QU",
    });

    const update = run("ioi16", [first, queued]);
    expect(update.formatData[p1.id]).toEqual({ points: 10, time: 0 });
  });
});

describe("atcoder format", () => {
  const submissions = [
    submission(p1.id, 5, 0),
    submission(p1.id, 10, 100),
    submission(p1.id, 15, 0),
    submission(p2.id, 20, 0),
  ];

  it("penalises the tries before the first maximum", () => {
    const update = run("atcoder", submissions);
    expect(update.score).toBe(100);
    // cumtime is the latest solve time; the penalty is 5 minutes per earlier try.
    expect(update.cumtime).toBe(10 * 60 + 1 * 5 * 60);
    expect(update.tiebreaker).toBe(0);
    expect(update.formatData).toEqual({
      [p1.id]: { time: 10 * 60, points: 100, penalty: 1 },
      // An unsolved problem still displays its attempt count.
      [p2.id]: { time: 20 * 60, points: 0, penalty: 1 },
    });
  });

  it("ignores IE, CE and unjudged submissions in the penalty count", () => {
    const noisy = [
      submission(p1.id, 1, 0, { result: "CE" }),
      submission(p1.id, 2, 0, { result: "IE" }),
      submission(p1.id, 3, 0, { result: null, status: "QU" }),
      submission(p1.id, 5, 0),
      submission(p1.id, 10, 100),
    ];

    const update = run("atcoder", noisy);
    expect(update.formatData[p1.id]?.penalty).toBe(1);
  });

  it("counts every attempt on an unsolved problem", () => {
    const update = run("atcoder", [submission(p2.id, 5, 0), submission(p2.id, 6, 0)]);
    expect(update.formatData[p2.id]?.penalty).toBe(2);
  });

  it("drops the penalty entirely when configured to zero", () => {
    const update = run("atcoder", submissions, { penalty: 0 });
    expect(update.cumtime).toBe(10 * 60);
    expect(update.formatData[p1.id]?.penalty).toBe(0);
  });

  it("defaults to a five minute penalty and validates it", () => {
    expect(getFormat("atcoder").configDefaults).toEqual({ penalty: 5 });
    expect(() => validateContestFormatConfig("atcoder", { penalty: -1 })).toThrow(
      /invalid value "-1" for config key "penalty"/,
    );
  });
});

describe("icpc format", () => {
  const submissions = [
    submission(p1.id, 5, 0),
    submission(p1.id, 10, 100),
    submission(p1.id, 15, 0),
    submission(p2.id, 20, 0),
  ];

  it("sums solve times and adds twenty minutes per rejected try", () => {
    const update = run("icpc", submissions);
    expect(update.score).toBe(100);
    expect(update.cumtime).toBe(10 * 60 + 1 * 20 * 60);
    expect(update.tiebreaker).toBe(10 * 60);
    expect(update.formatData).toEqual({
      [p1.id]: { time: 10 * 60, points: 100, penalty: 1 },
      [p2.id]: { time: 20 * 60, points: 0, penalty: 1 },
    });
  });

  it("tiebreaks on the last solve", () => {
    const update = run("icpc", [submission(p1.id, 10, 100), submission(p2.id, 40, 100)]);
    expect(update.score).toBe(200);
    expect(update.cumtime).toBe(10 * 60 + 40 * 60);
    expect(update.tiebreaker).toBe(40 * 60);
  });

  it("defaults to a twenty minute penalty and letters its problems", () => {
    expect(getFormat("icpc").configDefaults).toEqual({ penalty: 20 });
    expect(getFormat("icpc").getLabelForProblem(0)).toBe("A");
  });
});

describe("ecoo format", () => {
  it("scores the last submission and adds the bonuses", () => {
    const submissions = [submission(p1.id, 10, 100), submission(p2.id, 20, 0), submission(p2.id, 30, 50)];
    const update = run("ecoo", submissions);

    // p1: solved in full on the only submission, so 10 bonus points, plus one
    // point per five whole minutes left of the five hour window.
    const p1TimeBonus = Math.floor(Math.floor((5 * 60 - 10) / 1) / 5);
    expect(update.formatData[p1.id]).toEqual({
      time: 10 * 60,
      points: 100,
      bonus: 10 + p1TimeBonus,
    });

    // p2: two submissions, so no first-AC bonus.
    const p2TimeBonus = Math.floor((5 * 60 - 30) / 5);
    expect(update.formatData[p2.id]).toEqual({ time: 30 * 60, points: 50, bonus: p2TimeBonus });

    expect(update.score).toBe(100 + 10 + p1TimeBonus + 50 + p2TimeBonus);
    expect(update.cumtime).toBe(0);
  });

  it("awards no bonus for a zero score", () => {
    const update = run("ecoo", [submission(p1.id, 10, 0)]);
    expect(update.formatData[p1.id]).toEqual({ time: 10 * 60, points: 0, bonus: 0 });
    expect(update.score).toBe(0);
  });

  it("excludes IE and CE submissions but counts unjudged ones", () => {
    const update = run("ecoo", [
      submission(p1.id, 5, 0, { result: "CE" }),
      submission(p1.id, 6, 0, { result: "IE" }),
      submission(p1.id, 10, 100),
    ]);

    // Only one counted submission, so the first-AC bonus still applies.
    expect(update.formatData[p1.id]?.bonus).toBe(10 + Math.floor((5 * 60 - 10) / 5));
  });

  it("sums times into cumtime when configured", () => {
    const update = run("ecoo", [submission(p1.id, 10, 100), submission(p2.id, 20, 100)], {
      cumtime: true,
    });

    expect(update.cumtime).toBe(10 * 60 + 20 * 60);
  });

  it("validates its three keys", () => {
    expect(getFormat("ecoo").configDefaults).toEqual({
      cumtime: false,
      first_ac_bonus: 10,
      time_bonus: 5,
    });
    expect(() => validateContestFormatConfig("ecoo", { time_bonus: -1 })).toThrow(FormatConfigError);
    expect(() => validateContestFormatConfig("ecoo", { first_ac_bonus: 0 })).not.toThrow();
  });

  it("drops the time bonus when disabled", () => {
    const update = run("ecoo", [submission(p1.id, 10, 100)], { time_bonus: 0 });
    expect(update.formatData[p1.id]?.bonus).toBe(10);
  });
});

describe("disqualification", () => {
  it("overrides the score of a disqualified participation", () => {
    const update = updateParticipation({
      participation: { ...participation, isDisqualified: true },
      submissions: [submission(p1.id, 10, 100)],
      contestProblems,
      contest,
    });

    expect(update).toMatchObject({ score: -9999, cumtime: 0, tiebreaker: 0 });
  });
});

describe("labels", () => {
  it("numbers, letters and custom labels", () => {
    expect(numberLabel(0)).toBe("1");
    expect(letterLabel(0)).toBe("A");
    expect(letterLabel(25)).toBe("Z");
    expect(letterLabel(26)).toBe("AA");
    expect(letterLabel(27)).toBe("AB");
    expect(letterLabel(51)).toBe("AZ");
    expect(letterLabel(52)).toBe("BA");

    expect(getLabelForProblem(0, { scheme: "numbers" })).toBe("1");
    expect(getLabelForProblem(0, { scheme: "letters" })).toBe("A");
    expect(getLabelForProblem(1, { scheme: "custom", customLabels: ["P1", "P2"] })).toBe("P2");
    // Past the end of a custom list, fall back to letters.
    expect(getLabelForProblem(2, { scheme: "custom", customLabels: ["P1"] })).toBe("C");
  });

  it("follows the format when the contest picks no scheme", () => {
    expect(getContestLabelForProblem(contest, 0)).toBe("1");
    expect(getContestLabelForProblem({ ...contest, formatName: "icpc" }, 0)).toBe("A");
    expect(getContestLabels({ ...contest, formatName: "icpc" }, 3)).toEqual(["A", "B", "C"]);
  });
});

describe("bestSolutionState", () => {
  it("matches BaseContestFormat.best_solution_state", () => {
    expect(bestSolutionState(0, 100)).toBe("failed-score");
    expect(bestSolutionState(100, 100)).toBe("full-score");
    expect(bestSolutionState(50, 100)).toBe("partial-score");
  });
});

describe("getShortFormDisplay", () => {
  it("describes each format", () => {
    expect(getFormat("default").getShortFormDisplay()).toHaveLength(2);
    expect(getFormat("ioi").getShortFormDisplay({ cumtime: false })).toContainEqual({
      key: "tiesNotBroken",
    });
    expect(getFormat("ioi16").getShortFormDisplay()[0]).toEqual({ key: "maxScoreBatch" });
    expect(getFormat("icpc").getShortFormDisplay({ penalty: 1 })[1]).toEqual({
      key: "penalty",
      values: { minutes: 1 },
    });
    expect(getFormat("atcoder").getShortFormDisplay()[1]).toEqual({
      key: "penalty",
      values: { minutes: 5 },
    });
    expect(getFormat("atcoder").getShortFormDisplay({ penalty: 0 })).toHaveLength(2);
    expect(getFormat("ecoo").getShortFormDisplay()).toEqual([
      { key: "lastNonCeSubmission" },
      { key: "firstAcBonus", values: { bonus: 10 } },
      { key: "timeBonus", values: { minutes: 5 } },
      { key: "tiesNotBroken" },
    ]);
  });
});
