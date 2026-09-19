/**
 * Elo-MMR, checked against reference values produced by running DMOJ's own
 * judge/ratings.py (the pure part of it) on the same inputs.
 */

import { describe, expect, it } from "vitest";
import {
  BETA2,
  evalTanhs,
  getUserCssClass,
  getVar,
  MEAN_INIT,
  performanceCeiling,
  RATING_INIT,
  rateContest,
  ratingClass,
  ratingLevel,
  ratingName,
  ratingProgress,
  recalculateRatings,
  SD_LIM,
  solve,
  TANH_C,
  tieRanker,
  VALID_RANGE,
  VAR_INIT,
  VAR_PER_CONTEST,
} from "./ratings";
import { defined } from "./test.fixtures";

const PRECISION = 9;

function closeTo(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);

  for (const [i, target] of expected.entries()) {
    expect(actual[i]).toBeCloseTo(target, PRECISION);
  }
}

describe("constants", () => {
  it("matches judge/ratings.py", () => {
    expect(BETA2).toBeCloseTo(107800.58889999999, PRECISION);
    expect(VAR_INIT).toBeCloseTo(293822.80482934316, PRECISION);
    expect(VAR_PER_CONTEST).toBeCloseTo(2923.950943960102, PRECISION);
    expect(SD_LIM).toBeCloseTo(127.87529929597356, PRECISION);
    expect(TANH_C).toBeCloseTo(0.5513288954217921, PRECISION);
    expect(VALID_RANGE[0]).toBeCloseTo(-9341.084905660377, PRECISION);
    expect(VALID_RANGE[1]).toBeCloseTo(12341.084905660377, PRECISION);
    expect(RATING_INIT).toBe(1200);
    expect(MEAN_INIT).toBe(1500);
  });

  it("get_var grows the cache the same way", () => {
    expect(getVar(0)).toBeCloseTo(293822.80482934316, PRECISION);
    expect(getVar(1)).toBeCloseTo(79074.73735208921, PRECISION);
    expect(getVar(5)).toBeCloseTo(23703.118811077307, PRECISION);
  });
});

describe("tie_ranker", () => {
  it("gives a run of ties the average of the ranks it spans", () => {
    const items = [{ k: 3 }, { k: 3 }, { k: 3 }, { k: 2 }, { k: 1 }, { k: 1 }];
    expect(tieRanker(items, (item) => [item.k])).toEqual([2, 2, 2, 4, 5.5, 5.5]);
  });

  it("ranks a strict order 1..n", () => {
    const items = [{ k: 4 }, { k: 3 }, { k: 2 }, { k: 1 }];
    expect(tieRanker(items, (item) => [item.k])).toEqual([1, 2, 3, 4]);
  });

  it("compares the whole key tuple", () => {
    const items = [
      { score: 10, cumtime: 5 },
      { score: 10, cumtime: 7 },
    ];

    expect(tieRanker(items, (item) => [item.score, item.cumtime])).toEqual([1, 2]);
  });

  it("handles an empty field", () => {
    expect(tieRanker([], () => [])).toEqual([]);
  });
});

describe("eval_tanhs and solve", () => {
  it("match the Python results", () => {
    expect(
      evalTanhs(
        [
          [1500, 300, 1],
          [1600, 250, 0.5],
        ],
        1550,
      ),
    ).toBeCloseTo(7.780056552875427e-5, 15);
    expect(solve([[1500, 300, 1]], 0.001, 0, [0, 3000])).toBeCloseTo(1685.7119468110864, 6);
  });
});

describe("recalculate_ratings golden cases", () => {
  it("four newcomers, no ties", () => {
    const result = recalculateRatings(
      [1, 2, 3, 4],
      [1500, 1500, 1500, 1500],
      [0, 0, 0, 0],
      [[], [], [], []],
      null,
    );

    expect(result.rating).toEqual([1901, 1493, 1200, 792]);
    closeTo(result.mean, [2054.8117718081685, 1646.6551817318596, 1353.344881857663, 945.1882281918315]);
    closeTo(result.performance, [2182.367751638652, 1679.1300621513783, 1320.87001558157, 817.6322483613482]);
  });

  it("a tie in the middle scores both the same", () => {
    const result = recalculateRatings(
      [1, 2.5, 2.5, 4],
      [1500, 1500, 1500, 1500],
      [0, 0, 0, 0],
      [[], [], [], []],
      null,
    );

    expect(result.rating).toEqual([1901, 1347, 1347, 792]);
    closeTo(result.mean, [2054.8117718081685, 1500, 1500, 945.1882281918315]);
    closeTo(result.performance, [2182.367751638652, 1500, 1500, 817.6322483613482]);
  });

  it("an experienced field with history and a performance ceiling", () => {
    const result = recalculateRatings(
      [1, 2, 3],
      [1700, 1500, 1300],
      [3, 1, 0],
      [[1750, 1600, 1500], [1450], []],
      2000,
    );

    expect(result.rating).toEqual([1721, 1399, 891]);
    closeTo(result.mean, [1758.717015419988, 1487.064419856683, 1044.6742852582906]);
    closeTo(result.performance, [1905.1183406409646, 1472.1745212163116, 987.8242438750557]);
  });

  it("a single competitor keeps their mean", () => {
    const result = recalculateRatings([1], [1500], [0], [[]], null);
    expect(result.rating).toEqual([1347]);
    expect(result.mean).toEqual([1500]);
    expect(result.performance).toEqual([1500]);
  });
});

describe("rateContest", () => {
  const rows = [
    { participationId: "p1", profileId: "a", score: 100, cumtime: 0, tiebreaker: 0, submissionCount: 1 },
    { participationId: "p2", profileId: "b", score: 90, cumtime: 0, tiebreaker: 0, submissionCount: 1 },
    { participationId: "p3", profileId: "c", score: 80, cumtime: 0, tiebreaker: 0, submissionCount: 1 },
    { participationId: "p4", profileId: "d", score: 70, cumtime: 0, tiebreaker: 0, submissionCount: 1 },
  ];

  it("produces the rows to write, in rank order", () => {
    const result = rateContest(rows, { now: 1234 });
    expect(result.map((row) => row.profileId)).toEqual(["a", "b", "c", "d"]);
    expect(result.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
    expect(result.map((row) => row.rating)).toEqual([1901, 1493, 1200, 792]);
    expect(result.every((row) => row.lastRated === 1234)).toBe(true);
    expect(result[0]?.participationId).toBe("p1");
  });

  it("sorts by score, then cumtime, then tiebreaker, with the disqualified last", () => {
    const result = rateContest(
      [
        { participationId: "p1", profileId: "a", score: 10, cumtime: 100, tiebreaker: 0, submissionCount: 1 },
        { participationId: "p2", profileId: "b", score: 10, cumtime: 50, tiebreaker: 0, submissionCount: 1 },
        { participationId: "p3", profileId: "c", score: 10, cumtime: 50, tiebreaker: 5, submissionCount: 1 },
        {
          participationId: "p4",
          profileId: "d",
          score: 999,
          cumtime: 0,
          tiebreaker: 0,
          submissionCount: 1,
          isDisqualified: true,
        },
      ],
      {},
    );

    expect(result.map((row) => row.profileId)).toEqual(["b", "c", "a", "d"]);
  });

  it("skips virtual participations, excluded users and the unsubmitted", () => {
    const result = rateContest(
      [
        ...rows,
        {
          participationId: "v",
          profileId: "virtual",
          score: 100,
          cumtime: 0,
          tiebreaker: 0,
          submissionCount: 1,
          virtual: 1,
        },
        {
          participationId: "x",
          profileId: "excluded",
          score: 100,
          cumtime: 0,
          tiebreaker: 0,
          submissionCount: 1,
        },
        {
          participationId: "z",
          profileId: "nosubs",
          score: 0,
          cumtime: 0,
          tiebreaker: 0,
          submissionCount: 0,
        },
      ],
      { rating: { everyone: false, excludeProfileIds: ["excluded"] } },
    );

    expect(result.map((row) => row.profileId)).toEqual(["a", "b", "c", "d"]);
  });

  it("rates the unsubmitted when rate_all is set", () => {
    const result = rateContest(
      [
        {
          participationId: "z",
          profileId: "nosubs",
          score: 0,
          cumtime: 0,
          tiebreaker: 0,
          submissionCount: 0,
        },
      ],
      { rating: { everyone: true, excludeProfileIds: [] } },
    );

    expect(result).toHaveLength(1);
  });

  it("applies the rating floor and ceiling to the previous rating", () => {
    const field = [
      {
        participationId: "p1",
        profileId: "low",
        score: 10,
        cumtime: 0,
        tiebreaker: 0,
        submissionCount: 1,
        lastRating: 900,
      },
      {
        participationId: "p2",
        profileId: "mid",
        score: 9,
        cumtime: 0,
        tiebreaker: 0,
        submissionCount: 1,
        lastRating: 1500,
      },
      {
        participationId: "p3",
        profileId: "high",
        score: 8,
        cumtime: 0,
        tiebreaker: 0,
        submissionCount: 1,
        lastRating: 2500,
      },
    ];

    expect(
      rateContest(field, { rating: { everyone: false, excludeProfileIds: [], floor: 1000 } }).map(
        (row) => row.profileId,
      ),
    ).toEqual(["mid", "high"]);
    expect(
      rateContest(field, { rating: { everyone: false, excludeProfileIds: [], ceiling: 2000 } }).map(
        (row) => row.profileId,
      ),
    ).toEqual(["low", "mid"]);
    // A competitor with no history is treated as RATING_INIT.
    expect(
      rateContest(
        [{ participationId: "p", profileId: "new", score: 1, cumtime: 0, tiebreaker: 0, submissionCount: 1 }],
        { rating: { everyone: false, excludeProfileIds: [], floor: 1300 } },
      ),
    ).toHaveLength(0);
  });

  it("uses the prior history and the performance ceiling", () => {
    const result = rateContest(
      [
        {
          participationId: "p1",
          profileId: "a",
          score: 10,
          cumtime: 0,
          tiebreaker: 0,
          submissionCount: 1,
          lastMean: 1700,
          timesRated: 3,
        },
        {
          participationId: "p2",
          profileId: "b",
          score: 5,
          cumtime: 0,
          tiebreaker: 0,
          submissionCount: 1,
          lastMean: 1500,
          timesRated: 1,
        },
        {
          participationId: "p3",
          profileId: "c",
          score: 1,
          cumtime: 0,
          tiebreaker: 0,
          submissionCount: 1,
          lastMean: 1300,
          timesRated: 0,
        },
      ],
      {
        rating: { everyone: false, excludeProfileIds: [], performanceCeiling: 2000 },
        priorHistory: { a: [1750, 1600, 1500], b: [1450], c: [] },
      },
    );

    expect(result.map((row) => row.rating)).toEqual([1721, 1399, 891]);
  });

  it("caps performance only where a cap was asked for", () => {
    expect(performanceCeiling(undefined)).toBeNull();
    expect(performanceCeiling({ everyone: false, excludeProfileIds: [] })).toBeNull();
    expect(performanceCeiling({ everyone: false, excludeProfileIds: [], performanceCeiling: 1234 })).toBe(
      1234,
    );
  });

  it("does not let the eligibility ceiling cap performance", () => {
    // DMOJ derives a cap of the rating ceiling + 400, so a ceiling set to keep
    // strong competitors out of the rating silently capped everyone else's performance.
    expect(performanceCeiling({ everyone: false, excludeProfileIds: [], ceiling: 1600 })).toBeNull();
  });
});

describe("monotonicity", () => {
  /** Deterministic PRNG so a failure is reproducible. */
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;

    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("never rewards a worse rank with a better performance or rating", () => {
    const random = mulberry32(20260910);

    for (let trial = 0; trial < 40; trial++) {
      const n = 2 + Math.floor(random() * 12);
      const oldMean = Array.from({ length: n }, () => 800 + random() * 1600);
      const timesRanked = Array.from({ length: n }, () => Math.floor(random() * 8));

      const historical = timesRanked.map((times) =>
        Array.from({ length: times }, () => 800 + random() * 1600),
      );

      const ranking = Array.from({ length: n }, (_unused, i) => i + 1);

      const { rating, performance } = recalculateRatings(ranking, oldMean, timesRanked, historical, null);

      let previous: number | null = null;

      for (const value of performance) {
        if (previous !== null) {
          expect(value, `trial ${trial}: performance must not increase with rank`).toBeLessThanOrEqual(
            previous + 1e-6,
          );
        }

        previous = value;
      }

      // Two competitors with the same history: the better rank must not rate lower.
      const uniform = recalculateRatings(
        ranking,
        Array.from({ length: n }, () => 1500),
        Array.from({ length: n }, () => 0),
        Array.from({ length: n }, () => []),
        null,
      );

      let previousRating: number | null = null;

      for (const value of uniform.rating) {
        if (previousRating !== null) expect(value).toBeLessThanOrEqual(previousRating);

        previousRating = value;
      }

      expect(rating.every((value) => value >= 1)).toBe(true);
    }
  });

  it("a better placing in the same field never lowers the rating", () => {
    const field = (winner: "a" | "b") => [
      {
        participationId: "p1",
        profileId: winner,
        score: 10,
        cumtime: 0,
        tiebreaker: 0,
        submissionCount: 1,
      },
      {
        participationId: "p2",
        profileId: winner === "a" ? "b" : "a",
        score: 5,
        cumtime: 0,
        tiebreaker: 0,
        submissionCount: 1,
      },
      { participationId: "p3", profileId: "c", score: 1, cumtime: 0, tiebreaker: 0, submissionCount: 1 },
    ];

    const won = defined(
      rateContest(field("a")).find((row) => row.profileId === "a"),
      "a's row",
    );

    const lost = defined(
      rateContest(field("b")).find((row) => row.profileId === "a"),
      "a's row",
    );

    expect(won.rating).toBeGreaterThan(lost.rating);
  });
});

describe("rating levels", () => {
  it("bands ratings the way DMOJ does", () => {
    expect(ratingLevel(999)).toBe(0);
    expect(ratingLevel(1000)).toBe(1);
    expect(ratingLevel(1299)).toBe(1);
    expect(ratingLevel(1300)).toBe(2);
    expect(ratingLevel(3000)).toBe(6);
    expect(ratingLevel(5000)).toBe(6);

    expect(ratingName(999)).toBe("Newbie");
    expect(ratingName(1300)).toBe("Expert");
    expect(ratingName(3000)).toBe("Target");

    expect(ratingClass(999)).toBe("rate-newbie");
    expect(ratingClass(1300)).toBe("rate-expert");
    expect(ratingClass(2399)).toBe("rate-master");
    expect(ratingClass(2400)).toBe("rate-grandmaster");
    expect(ratingClass(3000)).toBe("rate-target");
  });

  it("reports progress through the current band", () => {
    expect(ratingProgress(0)).toBe(0);
    expect(ratingProgress(500)).toBeCloseTo(0.5, 10);
    expect(ratingProgress(1000)).toBeCloseTo(0, 10);
    expect(ratingProgress(1150)).toBeCloseTo(0.5, 10);
    expect(ratingProgress(3000)).toBe(1);
    expect(ratingProgress(4000)).toBe(1);
  });

  it("builds the CSS class DMOJ renders", () => {
    expect(getUserCssClass("user", 1500)).toBe("rating rate-expert user");
    expect(getUserCssClass("setter", null)).toBe("rating rate-none setter");
  });
});
