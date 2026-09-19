/**
 * A save sends only what differs from the stored contest, so editing one field
 * produces a patch containing that field and nothing else, and the shapes the
 * form builds round-trip through the projection the save diffs against.
 */

import { describe, expect, it } from "vitest";
import {
  argsFromFields,
  type ContestFieldSource,
  changedArgs,
  describeSourceOf,
  fieldsFromContest,
} from "./generalFields";

const REFS = {
  profileIdsFor: () => [],
  organizationIds: [],
  joinOrganizationIds: [],
  classIds: [],
  tagIds: [],
};

/** A contest as `pages.admin.contests.edit` hands it to the tab. */
function contestEdit(overrides: Partial<ContestFieldSource> = {}): ContestFieldSource {
  return {
    name: "Weekly",
    description: "",
    summary: "",
    startTime: Date.UTC(2026, 0, 1, 10),
    endTime: Date.UTC(2026, 0, 1, 13),
    schedule: { kind: "together" },
    isVisible: true,
    entry: { kind: "open" },
    joinLimit: null,
    accessCode: "",
    formatName: "default",
    formatConfig: null,
    labels: { kind: "letters" },
    scoreboard: { audiences: ["everyone"], from: "start" },
    freeze: null,
    rating: null,
    tagNames: [],
    lockedAfter: null,
    pointsPrecision: 3,
    hideProblemTags: false,
    disableLockdown: false,
    hideProblemAuthors: false,
    runPretestsOnly: false,
    proctorRequired: false,
    publishProblemsAtEnd: false,
    problemsPublishedAt: null,
    useClarifications: true,
    bannedUsers: [],
    ...overrides,
  };
}

/** What a save sends when one field was edited and nothing else was touched. */
function patchAfterEditing(contest: ContestFieldSource, edit: Partial<ReturnType<typeof fieldsFromContest>>) {
  const fields = fieldsFromContest(contest);

  return changedArgs(
    argsFromFields(fields, REFS, contest.formatConfig),
    argsFromFields({ ...fields, ...edit }, REFS, contest.formatConfig),
  );
}

describe("the shapes across the round trip", () => {
  it("keeps a per-participant window in seconds", () => {
    // The one live windowed contest: 300 minutes shown, 18000 seconds stored.
    const contest = contestEdit({
      schedule: { kind: "window", seconds: 300 * 60 },
      endTime: Date.UTC(2026, 0, 10, 10),
    });

    expect(fieldsFromContest(contest).windowMinutes).toBe("300");
    expect(argsFromFields(fieldsFromContest(contest), REFS, null).schedule).toEqual({
      kind: "window",
      seconds: 18000,
    });
    expect(patchAfterEditing(contest, { name: "Weekly 2" })).toEqual({ name: "Weekly 2" });
  });

  it("keeps a restricted entry, its match and its names", () => {
    const contest = contestEdit({
      entry: {
        kind: "restricted",
        match: "any",
        organizationSlugs: ["maps"],
        classNames: ["FIT1045"],
        usernames: ["alice"],
      },
    });

    const fields = fieldsFromContest(contest);
    expect(fields).toMatchObject({ entry: "restricted", entryMatch: "any", namedUsers: ["alice"] });
    expect(patchAfterEditing(contest, { name: "Weekly 2" })).toEqual({ name: "Weekly 2" });
    // The summary counts names, so it reads them where the mutation reads ids.
    expect(describeSourceOf(fields, contest).entry).toEqual({
      kind: "restricted",
      match: "any",
      organizationIds: ["maps"],
      classIds: ["FIT1045"],
      profileIds: ["alice"],
    });
  });

  it("sends publishing at the end as the flag it is", () => {
    expect(patchAfterEditing(contestEdit(), { publishProblemsAtEnd: true })).toEqual({
      publishProblemsAtEnd: true,
    });
    // Once published, the summary says so from the saved moment, not the draft.
    const done = contestEdit({ publishProblemsAtEnd: true, problemsPublishedAt: Date.UTC(2026, 0, 1, 13) });
    expect(describeSourceOf(fieldsFromContest(done), done).problemsPublishedAt).toBe(
      Date.UTC(2026, 0, 1, 13),
    );
  });

  it("keeps a rating band, with the blanks left out", () => {
    const contest = contestEdit({
      rating: { everyone: true, excluded: [], floor: 1300, ceiling: null, performanceCeiling: null },
    });

    expect(argsFromFields(fieldsFromContest(contest), REFS, null).rating).toEqual({
      everyone: true,
      excludeProfileIds: [],
      floor: 1300,
    });
    expect(patchAfterEditing(contest, { name: "Weekly 2" })).toEqual({ name: "Weekly 2" });
  });
});

describe("a contest the operator has edited", () => {
  it("sends the field that changed and nothing else", () => {
    expect(patchAfterEditing(contestEdit(), { name: "Weekly 2" })).toEqual({ name: "Weekly 2" });
  });

  it("sends a mode turned off as null, which is what removes it", () => {
    const contest = contestEdit({ freeze: { minutes: 60, blind: true } });

    expect(patchAfterEditing(contest, { freezeMinutes: "", blind: false })).toEqual({ freeze: null });
    expect(
      patchAfterEditing(
        contestEdit({
          rating: { everyone: false, excluded: [], floor: null, ceiling: null, performanceCeiling: null },
        }),
        { isRated: false },
      ),
    ).toEqual({ rating: null });
  });

  it("limits joining exactly when the join list names somebody", () => {
    const refs = { ...REFS, joinOrganizationIds: ["org1"] };
    const contest = contestEdit();
    const before = argsFromFields(fieldsFromContest(contest), refs, null);

    const after = argsFromFields(
      { ...fieldsFromContest(contest), joinOrganizationSlugs: ["maps"] },
      refs,
      null,
    );

    expect(changedArgs(before, after)).toEqual({ joinLimit: { organizationIds: ["org1"] } });
  });

  it("compares the format config by value, not by how it was typed", () => {
    const contest = contestEdit({ formatName: "icpc", formatConfig: { penalty: 20 } });
    const fields = fieldsFromContest(contest);
    const before = argsFromFields(fields, REFS, contest.formatConfig);
    // The same config, retyped with different whitespace.
    const after = argsFromFields({ ...fields, formatConfig: '{"penalty":20}' }, REFS, { penalty: 20 });

    expect(changedArgs(before, after)).toEqual({});
  });
});
