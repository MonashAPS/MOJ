/**
 * judge/bridge/judge_handler.py and judge/bridge/judge_list.py.
 */

import { describe, expect, it } from "vitest";
import type { ClaimableSubmission, JudgeRow } from "./judging";
import {
  BATCH_REJUDGE_PRIORITY,
  CONTEST_SUBMISSION_PRIORITY,
  canClaim,
  compareQueued,
  computeContestSubmissionPoints,
  computeGradingEnd,
  currentTierJudges,
  DEFAULT_PRIORITY,
  decodeCaseStatus,
  isValidPriority,
  judgeCanJudge,
  judgeIsWorking,
  minimumOnlineTier,
  REJUDGE_PRIORITY,
  STATUS_CODES,
  selectClaim,
  shouldReserveJudge,
  submissionPriority,
} from "./judging";
import type { SubmissionTestCaseRow } from "./types";

describe("decodeCaseStatus", () => {
  it("decodes single bits", () => {
    expect(decodeCaseStatus(0)).toBe("AC");
    expect(decodeCaseStatus(1)).toBe("WA");
    expect(decodeCaseStatus(2)).toBe("RTE");
    expect(decodeCaseStatus(4)).toBe("TLE");
    expect(decodeCaseStatus(8)).toBe("MLE");
    expect(decodeCaseStatus(16)).toBe("IR");
    expect(decodeCaseStatus(32)).toBe("SC");
    expect(decodeCaseStatus(64)).toBe("OLE");
  });

  it("resolves combinations in DMOJ order", () => {
    expect(decodeCaseStatus(4 | 1)).toBe("TLE");
    expect(decodeCaseStatus(8 | 1)).toBe("MLE");
    expect(decodeCaseStatus(64 | 2 | 1)).toBe("OLE");
    expect(decodeCaseStatus(2 | 16 | 1)).toBe("RTE");
    expect(decodeCaseStatus(16 | 1)).toBe("IR");
    expect(decodeCaseStatus(32 | 1)).toBe("WA");
  });
});

describe("computeGradingEnd", () => {
  const problem = { points: 100, partial: true };

  function testCase(spec: Partial<SubmissionTestCaseRow> = {}): SubmissionTestCaseRow {
    return { case: 1, status: "AC", points: 10, total: 10, time: 0.1, memory: 1000, ...spec };
  }

  it("sums unbatched cases and picks the worst status", () => {
    const result = computeGradingEnd(
      [
        testCase({ case: 1, status: "AC", points: 10, total: 10, time: 0.5, memory: 1000 }),
        testCase({ case: 2, status: "WA", points: 0, total: 10, time: 0.25, memory: 2000 }),
      ],
      problem,
    );

    expect(result.status).toBe("D");
    expect(result.result).toBe("WA");
    expect(result.time).toBeCloseTo(0.75, 10);
    expect(result.memory).toBe(2000);
    expect(result.casePoints).toBe(10);
    expect(result.caseTotal).toBe(20);
    expect(result.points).toBe(50);
  });

  it("collapses a batch to its minimum points and maximum total", () => {
    const result = computeGradingEnd(
      [
        testCase({ case: 1, status: "AC", points: 10, total: 10, batch: 1 }),
        testCase({ case: 2, status: "WA", points: 0, total: 10, batch: 1 }),
        testCase({ case: 3, status: "AC", points: 5, total: 5, batch: 2 }),
      ],
      problem,
    );

    expect(result.casePoints).toBe(5);
    expect(result.caseTotal).toBe(15);
    expect(result.result).toBe("WA");
  });

  it("treats batch 0 as unbatched, as the Python truthiness does", () => {
    const result = computeGradingEnd(
      [
        testCase({ case: 1, points: 10, total: 10, batch: 0 }),
        testCase({ case: 2, points: 10, total: 10, batch: 0 }),
      ],
      problem,
    );

    expect(result.casePoints).toBe(20);
    expect(result.caseTotal).toBe(20);
  });

  it("orders the result by the worst status", () => {
    expect(STATUS_CODES).toEqual(["SC", "AC", "WA", "MLE", "TLE", "IR", "RTE", "OLE"]);

    const worst = (statuses: SubmissionTestCaseRow["status"][]) =>
      computeGradingEnd(
        statuses.map((status, index) => testCase({ case: index, status })),
        problem,
      ).result;

    expect(worst(["AC", "AC"])).toBe("AC");
    expect(worst(["SC", "SC"])).toBe("SC");
    expect(worst(["AC", "SC"])).toBe("AC");
    expect(worst(["AC", "WA", "MLE"])).toBe("MLE");
    expect(worst(["OLE", "RTE"])).toBe("OLE");
    expect(worst(["TLE", "WA"])).toBe("TLE");
  });

  it("zeroes a non-partial problem that fell short", () => {
    const cases = [testCase({ case: 1, points: 9, total: 10 })];
    expect(computeGradingEnd(cases, { points: 100, partial: true }).points).toBe(90);
    expect(computeGradingEnd(cases, { points: 100, partial: false }).points).toBe(0);

    const full = [testCase({ case: 1, points: 10, total: 10 })];
    expect(computeGradingEnd(full, { points: 100, partial: false }).points).toBe(100);
  });

  it("awards nothing when there is nothing to score", () => {
    expect(computeGradingEnd([], problem)).toMatchObject({
      result: "SC",
      casePoints: 0,
      caseTotal: 0,
      points: 0,
      time: 0,
      memory: 0,
    });
  });

  it("rounds case points to one decimal and the award to three", () => {
    const result = computeGradingEnd(
      [
        testCase({ case: 1, points: 0.3333333, total: 1 }),
        testCase({ case: 2, points: 0.3333333, total: 1 }),
        testCase({ case: 3, points: 0.3333333, total: 1 }),
      ],
      { points: 7, partial: true },
    );

    expect(result.casePoints).toBe(1);
    expect(result.caseTotal).toBe(3);
    expect(result.points).toBe(2.333);
  });

  it("tolerates null times and memories", () => {
    const result = computeGradingEnd([testCase({ case: 1, time: null, memory: null })], problem);
    expect(result.time).toBe(0);
    expect(result.memory).toBe(0);
  });
});

describe("computeContestSubmissionPoints", () => {
  it("scales the case points by the contest problem value", () => {
    expect(
      computeContestSubmissionPoints({ casePoints: 50, caseTotal: 100 }, { points: 10, partial: true }),
    ).toBe(5);
    expect(
      computeContestSubmissionPoints({ casePoints: 0, caseTotal: 0 }, { points: 10, partial: true }),
    ).toBe(0);
    expect(computeContestSubmissionPoints({ casePoints: 50, caseTotal: 100 }, { points: 10 })).toBe(0);
    expect(computeContestSubmissionPoints({ casePoints: 100, caseTotal: 100 }, { points: 10 })).toBe(10);
  });
});

describe("priorities", () => {
  it("matches judge/judge_priority.py", () => {
    expect(CONTEST_SUBMISSION_PRIORITY).toBe(0);
    expect(DEFAULT_PRIORITY).toBe(1);
    expect(REJUDGE_PRIORITY).toBe(2);
    expect(BATCH_REJUDGE_PRIORITY).toBe(3);

    expect(submissionPriority({})).toBe(DEFAULT_PRIORITY);
    expect(submissionPriority({ inContest: true })).toBe(CONTEST_SUBMISSION_PRIORITY);
    expect(submissionPriority({ rejudge: true })).toBe(REJUDGE_PRIORITY);
    expect(submissionPriority({ inContest: true, rejudge: true })).toBe(REJUDGE_PRIORITY);
    expect(submissionPriority({ batchRejudge: true })).toBe(BATCH_REJUDGE_PRIORITY);

    expect(isValidPriority(0)).toBe(true);
    expect(isValidPriority(3)).toBe(true);
    expect(isValidPriority(4)).toBe(false);
    expect(isValidPriority(-1)).toBe(false);
  });
});

describe("claiming", () => {
  function judge(name: string, spec: Partial<JudgeRow> = {}): JudgeRow {
    return {
      id: name,
      name,
      tier: 1,
      online: true,
      isDisabled: false,
      isBlocked: false,
      problemCodes: ["aplusb"],
      runtimeKeys: ["PY3"],
      currentSubmissionId: null,
      ...spec,
    };
  }

  function queued(id: string, spec: Partial<ClaimableSubmission> = {}): ClaimableSubmission {
    return {
      id,
      problemCode: "aplusb",
      languageKey: "PY3",
      priority: DEFAULT_PRIORITY,
      date: 1000,
      status: "QU",
      ...spec,
    };
  }

  it("reports the minimum online tier", () => {
    const judges = [judge("a", { tier: 2 }), judge("b", { tier: 1 }), judge("c", { tier: 0, online: false })];
    expect(minimumOnlineTier(judges)).toBe(1);
    expect(minimumOnlineTier([])).toBeNull();
    expect(minimumOnlineTier([judge("x", { isDisabled: true })])).toBeNull();
    expect(currentTierJudges(judges, 1).map((row) => row.name)).toEqual(["b"]);
  });

  it("only lets the lowest tier claim", () => {
    const low = judge("low", { tier: 0 });
    const high = judge("high", { tier: 5 });
    const queue = [queued("s1")];
    expect(selectClaim(low, queue, [low, high])?.id).toBe("s1");
    expect(selectClaim(high, queue, [low, high])).toBeNull();
    // With the low tier judge gone, the high tier one takes over.
    expect(selectClaim(high, queue, [high])?.id).toBe("s1");
  });

  it("requires the problem data and the runtime", () => {
    const j = judge("j");
    expect(judgeCanJudge(j, "aplusb", "PY3")).toBe(true);
    expect(judgeCanJudge(j, "other", "PY3")).toBe(false);
    expect(judgeCanJudge(j, "aplusb", "CPP17")).toBe(false);
    expect(selectClaim(j, [queued("s", { problemCode: "other" })], [j])).toBeNull();
    expect(selectClaim(j, [queued("s", { languageKey: "CPP17" })], [j])).toBeNull();
  });

  it("takes a problem it never reported when the site holds the data", () => {
    const j = judge("j");
    expect(judgeCanJudge(j, "other", "PY3", null, true)).toBe(true);
    expect(selectClaim(j, [queued("s", { problemCode: "other", siteHasData: true })], [j])?.id).toBe("s");
    // The executor is still the judge's own business.
    expect(
      selectClaim(j, [queued("s", { problemCode: "other", languageKey: "CPP17", siteHasData: true })], [j]),
    ).toBeNull();
  });

  it("honours a judge pin, even for a disabled judge", () => {
    const pinned = judge("pinned", { isDisabled: true });
    const other = judge("other");
    const submission = queued("s", { judgePin: "pinned" });
    expect(selectClaim(other, [submission], [other, pinned])).toBeNull();
    expect(judgeCanJudge(pinned, "aplusb", "PY3", "pinned")).toBe(true);
    // A disabled judge is not counted for the tier, so pass it explicitly.
    expect(selectClaim(pinned, [submission], [pinned, other])?.id).toBe("s");
  });

  it("never claims for a blocked or offline judge", () => {
    const blocked = judge("blocked", { isBlocked: true });
    const offline = judge("offline", { online: false });
    expect(selectClaim(blocked, [queued("s")], [blocked])).toBeNull();
    expect(selectClaim(offline, [queued("s")], [offline])).toBeNull();
  });

  it("orders the queue by priority then date", () => {
    const j = judge("j");

    const queue = [
      queued("late", { priority: DEFAULT_PRIORITY, date: 3000 }),
      queued("rejudge", { priority: REJUDGE_PRIORITY, date: 1 }),
      queued("contest", { priority: CONTEST_SUBMISSION_PRIORITY, date: 2000 }),
      queued("early", { priority: DEFAULT_PRIORITY, date: 2000 }),
    ];

    expect([...queue].sort(compareQueued).map((row) => row.id)).toEqual([
      "contest",
      "early",
      "late",
      "rejudge",
    ]);
    expect(selectClaim(j, queue, [j])?.id).toBe("contest");
  });

  it("reserves a judge when only one of several is free", () => {
    const free = judge("free");
    const busy = judge("busy", { currentSubmissionId: "x" });
    expect(judgeIsWorking(busy)).toBe(true);
    expect(shouldReserveJudge([free, busy], 1)).toBe(true);
    expect(shouldReserveJudge([free], 1)).toBe(false);
    expect(shouldReserveJudge([free, judge("free2")], 1)).toBe(false);

    const rejudges = [queued("r", { priority: REJUDGE_PRIORITY })];
    // The last free judge does not start a rejudge.
    expect(selectClaim(free, rejudges, [free, busy])).toBeNull();
    // Alone, it does.
    expect(selectClaim(free, rejudges, [free])?.id).toBe("r");
    // And interactive work is still taken while reserving.
    expect(selectClaim(free, [queued("s"), ...rejudges], [free, busy])?.id).toBe("s");
  });

  it("ignores submissions that are not queued", () => {
    const j = judge("j");
    expect(selectClaim(j, [queued("s", { status: "G" })], [j])).toBeNull();
    expect(canClaim(j, queued("s"), [j])).toBe(true);
    expect(canClaim(j, queued("s", { status: "D" }), [j])).toBe(false);
  });
});
