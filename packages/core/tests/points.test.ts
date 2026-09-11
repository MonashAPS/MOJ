/**
 * judge/models/tests/test_profile.py, plus `Problem.update_stats` and the
 * ranker from judge/utils/ranker.py.
 */

import { describe, expect, it } from "vitest";
import { shouldLeaveContest } from "../src/contestTiming";
import {
  calculateProfilePoints,
  computeProblemStats,
  isFullSolve,
  PP_ENTRIES,
  PP_STEP,
  PP_TABLE,
  ppBonus,
  ranker,
} from "../src/points";
import { getUserCssClass } from "../src/ratings";
import { commonUsers, createContest, createParticipation, createUser, DAY, NOW } from "./fixtures";

describe("ProfileTestCase", () => {
  const users = commonUsers();

  it("test_calculate_points with no submissions", () => {
    expect(calculateProfilePoints([])).toEqual({
      points: 0,
      problemCount: 0,
      performancePoints: 0,
    });
  });

  it("test_css_class", () => {
    expect(getUserCssClass("user", null)).toBe("rating rate-none user");
  });

  it("test_get_user_css_class", () => {
    expect(getUserCssClass("abcdef", null, true)).toBe("rating rate-none abcdef");
    expect(getUserCssClass("admin", 1300, true)).toBe("rating rate-expert admin");
    expect(getUserCssClass(1111, 1299, true)).toBe("rating rate-amateur 1111");
    expect(getUserCssClass("random", 1299, false)).toBe("random");
  });

  it("test_update_contest: contest mode drops when the window closes", () => {
    const finished = createContest("finished_contest", {
      startTime: NOW - 100 * DAY,
      endTime: NOW - 10 * DAY,
      isVisible: true,
    });
    const inaccessible = createContest("inaccessible_contest", {
      startTime: NOW - 100 * DAY,
      endTime: NOW + 10 * DAY,
    });

    for (const contest of [finished, inaccessible]) {
      const participation = createParticipation(contest.id, "normal");
      expect(shouldLeaveContest(participation, contest, users.normal, NOW), contest.key).toBe(true);
    }

    const ongoing = createContest("ongoing", {
      startTime: NOW - DAY,
      endTime: NOW + DAY,
      isVisible: true,
    });
    const participation = createParticipation(ongoing.id, "normal");
    expect(shouldLeaveContest(participation, ongoing, users.normal, NOW)).toBe(false);
  });
});

describe("Profile.calculate_points", () => {
  it("sums the best score per problem and weights the top hundred", () => {
    const submissions = [
      { problemId: "a", points: 10, result: "AC" as const, casePoints: 1, caseTotal: 1 },
      { problemId: "a", points: 4, result: "WA" as const, casePoints: 0, caseTotal: 1 },
      { problemId: "b", points: 20, result: "AC" as const, casePoints: 2, caseTotal: 2 },
      { problemId: "c", points: 0, result: "WA" as const, casePoints: 0, caseTotal: 1 },
    ];

    const result = calculateProfilePoints(submissions);
    expect(result.points).toBe(30);
    expect(result.problemCount).toBe(2);
    // data sorted descending: [20, 10]
    expect(result.performancePoints).toBeCloseTo(20 * 1 + 10 * PP_STEP + ppBonus(2), 10);
  });

  it("ignores archived submissions, null points and non-public problems", () => {
    const result = calculateProfilePoints([
      { problemId: "a", points: 100, result: "AC", casePoints: 1, caseTotal: 1, isArchived: true },
      { problemId: "b", points: null, result: "AC", casePoints: 1, caseTotal: 1 },
      {
        problemId: "c",
        points: 50,
        result: "AC",
        casePoints: 1,
        caseTotal: 1,
        isPublicProblem: false,
      },
    ]);
    // b still counts as a solve (points is null but the result is a full AC).
    expect(result).toEqual({ points: 0, problemCount: 1, performancePoints: ppBonus(1) });
  });

  it("counts only a full AC as a solve", () => {
    expect(isFullSolve({ result: "AC", casePoints: 1, caseTotal: 1 })).toBe(true);
    expect(isFullSolve({ result: "AC", casePoints: 0.5, caseTotal: 1 })).toBe(false);
    expect(isFullSolve({ result: "WA", casePoints: 1, caseTotal: 1 })).toBe(false);
  });

  it("weights at most PP_ENTRIES problems", () => {
    const submissions = Array.from({ length: PP_ENTRIES + 10 }, (_unused, i) => ({
      problemId: `p${i}`,
      points: 1,
      result: "AC" as const,
      casePoints: 1,
      caseTotal: 1,
    }));
    const result = calculateProfilePoints(submissions);
    expect(result.points).toBe(PP_ENTRIES + 10);
    const expectedWeighted = PP_TABLE.reduce((sum, weight) => sum + weight, 0);
    expect(result.performancePoints).toBeCloseTo(expectedWeighted + ppBonus(PP_ENTRIES + 10), 10);
  });

  it("uses DMOJ_PP_BONUS_FUNCTION", () => {
    expect(ppBonus(0)).toBe(0);
    expect(ppBonus(100)).toBeCloseTo(300 * (1 - 0.997 ** 100), 10);
    expect(PP_TABLE[0]).toBe(1);
    expect(PP_TABLE[1]).toBe(PP_STEP);
    expect(PP_TABLE).toHaveLength(PP_ENTRIES);
  });
});

describe("Problem.update_stats", () => {
  it("counts distinct solvers and the AC rate", () => {
    const stats = computeProblemStats([
      { profileId: "a", result: "AC", casePoints: 1, caseTotal: 1 },
      { profileId: "a", result: "AC", casePoints: 1, caseTotal: 1 },
      { profileId: "b", result: "WA", casePoints: 0, caseTotal: 1 },
      { profileId: "c", result: "AC", casePoints: 0.5, caseTotal: 1 },
    ]);
    expect(stats.userCount).toBe(1);
    expect(stats.acRate).toBeCloseTo((100 * 2) / 4, 10);
  });

  it("excludes unlisted users and archived submissions", () => {
    const stats = computeProblemStats([
      { profileId: "a", result: "AC", casePoints: 1, caseTotal: 1, isUserUnlisted: true },
      { profileId: "b", result: "AC", casePoints: 1, caseTotal: 1, isArchived: true },
    ]);
    expect(stats).toEqual({ userCount: 0, acRate: 0 });
  });

  it("reports a zero rate with no submissions", () => {
    expect(computeProblemStats([])).toEqual({ userCount: 0, acRate: 0 });
  });
});

describe("ranker", () => {
  it("shares ranks and skips ahead after a tie", () => {
    const rows = [{ points: 10 }, { points: 10 }, { points: 5 }, { points: 5 }, { points: 1 }];
    expect(ranker(rows).map((entry) => entry.rank)).toEqual([1, 1, 3, 3, 5]);
  });

  it("honours a custom key and a starting rank", () => {
    const rows = [{ score: 3 }, { score: 2 }];
    expect(ranker(rows, (row) => row.score, 10).map((entry) => entry.rank)).toEqual([11, 12]);
  });

  it("handles an empty sequence", () => {
    expect(ranker([])).toEqual([]);
  });
});

describe("fixtures sanity", () => {
  it("creates users with judge-prefixed permissions", () => {
    const user = createUser("u", { permissions: ["edit_own_problem"] });
    expect(user.permissions).toEqual(["judge.edit_own_problem"]);
  });
});
