/**
 * Every message the contest summary can ask for has to exist.
 *
 * `catalogue.test.ts` checks that each locale carries every English key, which
 * is the wrong direction for this: a key the code asks for and English does not
 * have passes that test and renders as `admin.contests.summary.whatever` on the
 * page. One did, on staging, because the duration formatter was wired to a key
 * nobody had written.
 *
 * So the keys are collected from the functions that emit them rather than
 * listed, and a new warning with no message fails here.
 */

import { readFile } from "node:fs/promises";
import { contestWarnings, type DescribeSource, describeContest } from "@moj/core";
import { describe, expect, it } from "vitest";
import { isMessages, type Messages } from "@/i18n/messages";

const HOUR = 60 * 60 * 1000;

const START = Date.UTC(2026, 0, 1, 10);

/** A contest of each shape the editor can produce, so every branch emits. */
const CORPUS: DescribeSource[] = [
  {
    startTime: START,
    endTime: START + 3 * HOUR,
    isVisible: true,
    isPrivate: false,
    isOrganizationPrivate: false,
  },
  // Windowed, which is the branch the incident came from.
  {
    startTime: START,
    endTime: START + 3 * HOUR,
    isVisible: true,
    isPrivate: false,
    isOrganizationPrivate: false,
    timeLimit: HOUR / 1000,
  },
  // Windowed as long as the contest, plus a freeze that covers it.
  {
    startTime: START,
    endTime: START + 3 * HOUR,
    isVisible: false,
    isPrivate: false,
    isOrganizationPrivate: false,
    timeLimit: (3 * HOUR) / 1000,
    freezeMinutes: 180,
    blindDuringFreeze: true,
    lockedAfter: START + 4 * HOUR,
    runPretestsOnly: true,
  },
  // Restricted by organisation and by name at once, with a join limit.
  {
    startTime: START,
    endTime: START + 3 * HOUR,
    isVisible: true,
    isPrivate: true,
    isOrganizationPrivate: true,
    organizationIds: ["o1"],
    privateContestantProfileIds: ["p1"],
    limitJoinOrganizations: true,
    joinOrganizationIds: [],
    accessCode: "hunter2",
    viewContestScoreboardProfileIds: ["p2"],
  },
  // Restricted and naming nobody.
  {
    startTime: START,
    endTime: START + 3 * HOUR,
    isVisible: true,
    isPrivate: true,
    isOrganizationPrivate: false,
  },
  // Rated, with a band that excludes newcomers and a custom label list.
  {
    startTime: START,
    endTime: START + 3 * HOUR,
    isVisible: true,
    isPrivate: false,
    isOrganizationPrivate: false,
    isRated: true,
    rateAll: true,
    rateExcludeProfileIds: ["p1"],
    ratingFloor: 1300,
    ratingCeiling: 2400,
    performanceCeilingOverride: 3000,
    labelScheme: "custom",
    customLabels: ["A1"],
    freezeMinutes: 30,
  },
];

/** The catalogue, flattened to the dotted paths `useTranslations` resolves. */
async function adminMessageKeys(): Promise<Set<string>> {
  const raw: unknown = JSON.parse(
    await readFile(new URL("../../messages/en/admin.json", import.meta.url), "utf8"),
  );

  if (!isMessages(raw)) throw new Error("admin.json is not a message catalogue");
  const keys = new Set<string>();

  const walk = (messages: Messages, prefix: string): void => {
    for (const [segment, value] of Object.entries(messages)) {
      const path = prefix ? `${prefix}.${segment}` : segment;

      if (isMessages(value)) walk(value, path);
      else keys.add(path);
    }
  };

  walk(raw, "");

  return keys;
}

describe("the keys the contest summary emits", () => {
  it("all exist in the English catalogue", async () => {
    const keys = await adminMessageKeys();
    const missing: string[] = [];

    for (const contest of CORPUS) {
      for (const line of describeContest(contest, { problemCount: 3 })) {
        const path = `contests.summary.${line.group}.${line.key}`;

        if (!keys.has(path)) missing.push(path);
      }
    }

    expect(missing).toEqual([]);
  });

  it("covers every group heading it can render under", async () => {
    const keys = await adminMessageKeys();

    for (const group of ["when", "who", "scoring", "rating", "check"]) {
      expect(keys.has(`contests.summary.group.${group}`)).toBe(true);
    }
  });
});

describe("the keys the contest warnings emit", () => {
  it("all exist in the English catalogue", async () => {
    const keys = await adminMessageKeys();
    const missing: string[] = [];

    for (const contest of CORPUS) {
      const warnings = contestWarnings(contest, {
        now: START,
        problemCount: 3,
        pretestedProblemCount: 0,
        participantCount: 2,
      });

      for (const warning of warnings) {
        const path = `contests.warnings.${warning.key}`;

        if (!keys.has(path)) missing.push(path);
      }
    }

    expect(missing).toEqual([]);
  });

  it("emits enough of them for the check to be worth anything", () => {
    const seen = new Set<string>();

    for (const contest of CORPUS) {
      for (const warning of contestWarnings(contest, { now: START, problemCount: 3, participantCount: 2 })) {
        seen.add(warning.key);
      }
    }

    // A corpus that stopped triggering warnings would pass the checks above
    // while testing nothing.
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });
});
