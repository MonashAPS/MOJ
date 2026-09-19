/**
 * The accessors read the stored flags, so these pin the current combining rules
 * down before the stored shape changes underneath them. Each case is a state the
 * live data or the admin form can actually produce, including the ones that mean
 * nothing and the ones that surprise people.
 */

import { describe, expect, it } from "vitest";
import {
  entryOf,
  freezeAt,
  freezeOf,
  hasOwnWindow,
  joinLimitOf,
  labelsOf,
  ratingOf,
  scheduleOf,
  windowMillis,
} from "./settings";

const HOUR = 60 * 60 * 1000;

const START = Date.UTC(2026, 0, 1, 10);

function contest(overrides: Partial<Parameters<typeof scheduleOf>[0]> = {}) {
  return { isPrivate: false, isOrganizationPrivate: false, ...overrides };
}

describe("scheduleOf", () => {
  it("is shared when no window is set", () => {
    expect(scheduleOf(contest())).toEqual({ kind: "together" });
    expect(scheduleOf(contest({ timeLimit: null }))).toEqual({ kind: "together" });
  });

  it("treats zero as shared, which is what a falsy timedelta means in DMOJ", () => {
    expect(scheduleOf(contest({ timeLimit: 0 }))).toEqual({ kind: "together" });
  });

  it("is a window when one is set", () => {
    expect(scheduleOf(contest({ timeLimit: 18000 }))).toEqual({ kind: "window", seconds: 18000 });
    expect(hasOwnWindow(contest({ timeLimit: 18000 }))).toBe(true);
    expect(windowMillis(contest({ timeLimit: 18000 }))).toBe(5 * HOUR);
    expect(windowMillis(contest())).toBeNull();
  });
});

describe("entryOf", () => {
  it("is open when neither gate is on", () => {
    // Lists left behind by a gate that was turned off are inert, and so are not
    // reported: `contestAccessCheck` short-circuits before reading them.
    const open = contest({ organizationIds: ["o1"], privateContestantProfileIds: ["p1"] });

    expect(entryOf(open)).toEqual({ kind: "open" });
  });

  it("carries only the lists the gates that are on consult", () => {
    const byOrg = contest({
      isOrganizationPrivate: true,
      organizationIds: ["o1"],
      classIds: ["c1"],
      privateContestantProfileIds: ["p1"],
    });

    expect(entryOf(byOrg)).toEqual({
      kind: "restricted",
      match: "all",
      byOrganization: true,
      byName: false,
      organizationIds: ["o1"],
      classIds: ["c1"],
      profileIds: [],
    });
  });

  it("reports both gates as needing both, which is what the access check does", () => {
    const both = contest({
      isPrivate: true,
      isOrganizationPrivate: true,
      organizationIds: ["o1"],
      privateContestantProfileIds: ["p1"],
    });

    const entry = entryOf(both);

    expect(entry.kind).toBe("restricted");
    expect(entry.kind === "restricted" && entry.match).toBe("all");
    expect(entry.kind === "restricted" && entry.byOrganization && entry.byName).toBe(true);
  });

  it("keeps an organisation gate that names nobody, which admits nobody", () => {
    // Not the same as no gate: with the named-people gate also on, the contest
    // admits nobody at all, and reading the empty list as "no gate" would let
    // the named people straight in.
    const entry = entryOf(
      contest({ isOrganizationPrivate: true, isPrivate: true, privateContestantProfileIds: ["p1"] }),
    );

    expect(entry.kind === "restricted" && entry.byOrganization).toBe(true);
    expect(entry.kind === "restricted" && entry.organizationIds).toEqual([]);
  });

  it("is restricted even when the gate names nobody, which admits nobody", () => {
    expect(entryOf(contest({ isPrivate: true }))).toEqual({
      kind: "restricted",
      match: "all",
      byOrganization: false,
      byName: true,
      organizationIds: [],
      classIds: [],
      profileIds: [],
    });
  });
});

describe("joinLimitOf", () => {
  it("is null when joining is not limited", () => {
    expect(joinLimitOf(contest({ joinOrganizationIds: ["o1"] }))).toBeNull();
  });

  it("reports a limit naming nothing, because that is a contest nobody can join", () => {
    expect(joinLimitOf(contest({ limitJoinOrganizations: true }))).toEqual({ organizationIds: [] });
  });
});

describe("freezeOf", () => {
  it("is null at zero minutes, so the blind flag is inert with it", () => {
    expect(freezeOf(contest({ blindDuringFreeze: true }))).toBeNull();
    expect(freezeOf(contest({ freezeMinutes: 0, blindDuringFreeze: true }))).toBeNull();
  });

  it("carries the blind flag when there is a freeze to be blind through", () => {
    expect(freezeOf(contest({ freezeMinutes: 60, blindDuringFreeze: true }))).toEqual({
      minutes: 60,
      blind: true,
    });
  });
});

describe("freezeAt", () => {
  const window = { startTime: START, endTime: START + 3 * HOUR };

  it("is null without a freeze", () => {
    expect(freezeAt({ ...contest(), ...window })).toBeNull();
  });

  it("counts back from the end", () => {
    expect(freezeAt({ ...contest({ freezeMinutes: 60 }), ...window })).toBe(START + 2 * HOUR);
  });

  it("clamps to the start, so a freeze this long freezes the whole contest", () => {
    expect(freezeAt({ ...contest({ freezeMinutes: 600 }), ...window })).toBe(START);
  });
});

describe("ratingOf", () => {
  it("is null when the contest is unrated, so every setting under it is inert", () => {
    const unrated = contest({ ratingFloor: 1300, rateAll: true, rateExcludeProfileIds: ["p1"] });

    expect(ratingOf(unrated)).toBeNull();
  });

  it("carries the settings when the contest is rated", () => {
    const rated = contest({
      isRated: true,
      rateAll: true,
      rateExcludeProfileIds: ["p1"],
      ratingFloor: 1300,
      ratingCeiling: 2000,
    });

    expect(ratingOf(rated)).toEqual({
      everyone: true,
      excludeProfileIds: ["p1"],
      floor: 1300,
      ceiling: 2000,
      performanceCeiling: null,
    });
  });
});

describe("labelsOf", () => {
  it("reads every scheme but custom as letters, including the stored numbers", () => {
    expect(labelsOf(contest())).toEqual({ kind: "letters" });
    expect(labelsOf(contest({ labelScheme: "letters" }))).toEqual({ kind: "letters" });
    // Every imported contest carries this, and it has never drawn as numbers.
    expect(labelsOf(contest({ labelScheme: "numbers", customLabels: ["1", "2"] }))).toEqual({
      kind: "letters",
    });
  });

  it("carries the labels when they are custom", () => {
    expect(labelsOf(contest({ labelScheme: "custom", customLabels: ["A1", "A2"] }))).toEqual({
      kind: "custom",
      labels: ["A1", "A2"],
    });
  });
});
