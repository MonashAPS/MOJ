/**
 * Each warning is bound to the rule it describes: the test calls the real rule
 * rather than restating it, so a change to `permissions`, `ratings` or
 * `contestTiming` breaks the test rather than quietly making the warning a lie.
 */

import { describe, expect, it } from "vitest";
import { participationEndTime, participationStart } from "../contestTiming";
import { contestAccessCheck, contestIsLiveJoinableBy } from "../permissions";
import { rateContest } from "../ratings";
import { freezeTime } from "../scoreboard";
import { createParticipation, createUser, withOrganizations } from "../test.fixtures";
import { describeContest } from "./describe";
import { blockingWarnings, contestWarnings, dangerWarnings } from "./warnings";

const HOUR = 60 * 60 * 1000;

const START = Date.UTC(2026, 0, 1, 10);

const CONTEST = {
  id: "c1",
  key: "weekly",
  startTime: START,
  endTime: START + 3 * HOUR,
  isVisible: true,
  schedule: { kind: "together" },
  entry: { kind: "open" },
  labels: { kind: "letters" },
  scoreboard: { audiences: ["everyone"], from: "start" },
} as const;

const RESTRICTED = {
  kind: "restricted",
  match: "all",
  organizationIds: [],
  classIds: [],
  profileIds: [],
} as const;

function keysOf(warnings: ReturnType<typeof contestWarnings>): string[] {
  return warnings.map((warning) => warning.key);
}

describe("a per-participant window as long as the contest", () => {
  const contest = { ...CONTEST, schedule: { kind: "window", seconds: (3 * HOUR) / 1000 } } as const;

  it("is flagged as a danger", () => {
    const warnings = contestWarnings(contest, { now: START });

    expect(keysOf(warnings)).toContain("windowIsWholeContest");
    expect(dangerWarnings(warnings).map((w) => w.key)).toContain("windowIsWholeContest");
  });

  it("is flagged because the penalty clock really does move to the join moment", () => {
    // The rule the warning is about. Without a window the origin is the contest
    // start; with one it is when the competitor joined.
    const joinedLate = createParticipation("c1", "u", { realStart: START + HOUR, virtual: 0 });

    expect(participationStart(joinedLate, CONTEST)).toBe(START);
    expect(participationStart(joinedLate, contest)).toBe(START + HOUR);
  });

  it("is flagged because it buys nobody a single extra second", () => {
    // Every window is still clamped to the contest end.
    const joinedLate = createParticipation("c1", "u", { realStart: START + HOUR, virtual: 0 });

    expect(participationEndTime(joinedLate, contest)).toBe(CONTEST.endTime);
  });

  it("says nothing about a window that is genuinely shorter", () => {
    const shorter = { ...CONTEST, schedule: { kind: "window", seconds: HOUR / 1000 } } as const;

    expect(keysOf(contestWarnings(shorter, { now: START }))).not.toContain("windowIsWholeContest");
  });
});

describe("a freeze at least as long as the contest", () => {
  const contest = { ...CONTEST, freeze: { minutes: 180, blind: false } };

  it("blocks the save", () => {
    expect(blockingWarnings(contestWarnings(contest)).map((w) => w.key)).toEqual(["freezeCoversContest"]);
  });

  it("blocks it because the board would be frozen from the moment it opens", () => {
    expect(freezeTime(contest)).toBe(contest.startTime);
  });
});

describe("an entry gate that names nobody", () => {
  it("blocks the save", () => {
    const contest = { ...CONTEST, entry: RESTRICTED };

    expect(blockingWarnings(contestWarnings(contest)).map((w) => w.key)).toEqual(["restrictedNamesNobody"]);
  });

  it("blocks it because the access check admits nobody but staff", () => {
    const contest = { ...CONTEST, entry: RESTRICTED };

    expect(contestAccessCheck(contest, createUser("nobody")).kind).toBe("privateContest");
  });
});

describe("both entry gates at once", () => {
  const contest = {
    ...CONTEST,
    entry: { ...RESTRICTED, organizationIds: ["o1"], profileIds: ["someone-else"] },
  };

  it("is a danger, not merely a note", () => {
    expect(dangerWarnings(contestWarnings(contest)).map((w) => w.key)).toContain("entryNeedsBothGates");
  });

  it("is flagged because an organisation member who is not named is locked out", () => {
    const member = withOrganizations(createUser("member"), ["o1"]);

    expect(contestAccessCheck(contest, member).kind).toBe("privateContest");
  });
});

describe("a join limit naming no organisation", () => {
  const contest = { ...CONTEST, joinLimit: { organizationIds: [] } };

  it("blocks the save", () => {
    expect(blockingWarnings(contestWarnings(contest)).map((w) => w.key)).toEqual(["joinLimitNamesNobody"]);
  });

  it("blocks it because nobody can join at all", () => {
    const viewer = withOrganizations(createUser("member"), ["o1"]);

    expect(contestIsLiveJoinableBy(contest, viewer, { now: START + HOUR })).toBe(false);
  });
});

describe("a rating floor above the newcomer rating", () => {
  const contest = { ...CONTEST, rating: { everyone: false, excludeProfileIds: [], floor: 1300 } };

  it("is a danger", () => {
    expect(dangerWarnings(contestWarnings(contest)).map((w) => w.key)).toContain(
      "ratingFloorExcludesNewcomers",
    );
  });

  it("is flagged because a competitor who has never been rated is excluded", () => {
    const newcomer = {
      participationId: "p1",
      profileId: "u",
      score: 10,
      cumtime: 0,
      tiebreaker: 0,
      submissionCount: 3,
    };

    expect(rateContest([newcomer], { rating: contest.rating })).toEqual([]);
    // The same competitor is rated once the floor is at or below 1200.
    expect(rateContest([newcomer], { rating: { ...contest.rating, floor: 1200 } })).toHaveLength(1);
  });

  it("says nothing when the floor is at the newcomer rating", () => {
    const at = { ...CONTEST, rating: { everyone: false, excludeProfileIds: [], floor: 1200 } };

    expect(keysOf(contestWarnings(at))).not.toContain("ratingFloorExcludesNewcomers");
  });
});

describe("an ordinary contest", () => {
  it("warns about nothing", () => {
    expect(contestWarnings(CONTEST, { now: START })).toEqual([]);
  });

  it("describes itself as shared, open, unfrozen and unrated", () => {
    const keys = describeContest(CONTEST).map((line) => line.key);

    expect(keys).toEqual(["window", "together", "open", "scoreboardFromStart", "noFreeze", "unrated"]);
  });
});

describe("the summary of a contest that publishes its problems", () => {
  it("says when, and then that it did", () => {
    const keys = (source: Parameters<typeof describeContest>[0]) =>
      describeContest(source).map((line) => line.key);

    expect(keys({ ...CONTEST, publishProblemsAtEnd: true })).toContain("publishAtEnd");
    expect(keys({ ...CONTEST, publishProblemsAtEnd: true, problemsPublishedAt: START + 3 * HOUR })).toContain(
      "problemsPublished",
    );
    expect(keys(CONTEST)).not.toContain("publishAtEnd");
  });
});

describe("the summary of a windowed contest", () => {
  it("says the penalty clock starts when the competitor does", () => {
    const contest = { ...CONTEST, schedule: { kind: "window", seconds: HOUR / 1000 } } as const;
    const keys = describeContest(contest).map((line) => line.key);

    expect(keys).toContain("ownWindow");
    expect(keys).not.toContain("together");
    // And when joining stops being worth it.
    expect(keys).toContain("ownWindowCutoff");
  });
});

describe("severity ordering", () => {
  it("puts what blocks a save above what merely surprises", () => {
    const contest = {
      ...CONTEST,
      freeze: { minutes: 180, blind: false },
      schedule: { kind: "window", seconds: (3 * HOUR) / 1000 },
      rating: { everyone: false, excludeProfileIds: [], floor: 1300 },
    } as const;

    const severities = contestWarnings(contest, { now: START }).map((warning) => warning.severity);

    expect(severities[0]).toBe("blocked");
    expect(severities.indexOf("danger")).toBeGreaterThan(-1);
    expect(severities).toEqual([...severities].sort());
  });
});
