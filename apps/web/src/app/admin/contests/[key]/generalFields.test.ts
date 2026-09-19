/**
 * The general tab used to send all forty fields on every save, so opening a
 * contest and pressing Save rewrote the whole row — including the two fields the
 * form cannot represent exactly, which it therefore rewrote to something else.
 *
 * What these prove is the property that stops it: editing one field produces a
 * patch containing that field and nothing else, so a value the form reads
 * differently from how it is stored is never in the patch to begin with.
 */

import { describe, expect, it } from "vitest";
import { argsFromFields, type ContestFieldSource, changedArgs, fieldsFromContest } from "./generalFields";

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
    timeLimit: null,
    isVisible: true,
    isRated: false,
    ratingFloor: null,
    ratingCeiling: null,
    performanceCeilingOverride: null,
    rateAll: false,
    rateExclude: [],
    formatName: "default",
    formatConfig: null,
    labelScheme: "letters",
    customLabels: [],
    scoreboardVisibility: "V",
    freezeMinutes: 0,
    blindDuringFreeze: false,
    accessCode: "",
    isPrivate: false,
    privateContestants: [],
    organizationSlugs: [],
    classNames: [],
    limitJoinOrganizations: false,
    joinOrganizationSlugs: [],
    tagNames: [],
    lockedAfter: null,
    pointsPrecision: 3,
    hideProblemTags: false,
    disableLockdown: false,
    hideProblemAuthors: false,
    runPretestsOnly: false,
    showShortDisplay: false,
    useClarifications: true,
    ogImage: "",
    logoOverrideImage: "",
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

describe("fields the form cannot represent exactly", () => {
  it("reads a label scheme it cannot offer as letters", () => {
    // Every contest in the database carries "numbers", which has never rendered
    // as anything but letters, and the form has no option for it. This is what a
    // save that sent every field would therefore have written back.
    const contest = contestEdit({ labelScheme: "numbers" });

    expect(argsFromFields(fieldsFromContest(contest), REFS, null).labelScheme).toBe("letters");
  });

  it("leaves that label scheme out of the patch when something else is edited", () => {
    const contest = contestEdit({ labelScheme: "numbers" });

    expect(patchAfterEditing(contest, { name: "Weekly 2" })).toEqual({ name: "Weekly 2" });
  });

  it("leaves organisation privacy alone when something else is edited", () => {
    // `isOrganizationPrivate` is derived from the lists rather than edited, so a
    // full save turned it off for any contest whose lists happened to be empty.
    const contest = contestEdit({ organizationSlugs: [] });

    expect(patchAfterEditing(contest, { name: "Weekly 2" })).toEqual({ name: "Weekly 2" });
  });

  it("keeps a per-participant window in seconds across the round trip", () => {
    // The one live windowed contest: 300 minutes shown, 18000 seconds stored.
    const contest = contestEdit({ timeLimit: 300 * 60, endTime: Date.UTC(2026, 0, 10, 10) });

    expect(fieldsFromContest(contest).timeLimit).toBe("300");
    expect(argsFromFields(fieldsFromContest(contest), REFS, null).timeLimit).toBe(18000);
    expect(patchAfterEditing(contest, { name: "Weekly 2" })).toEqual({ name: "Weekly 2" });
  });
});

describe("a contest the operator has edited", () => {
  it("sends the field that changed and nothing else", () => {
    const contest = contestEdit();
    const before = argsFromFields(fieldsFromContest(contest), REFS, null);
    const after = argsFromFields({ ...fieldsFromContest(contest), name: "Weekly 2" }, REFS, null);

    expect(changedArgs(before, after)).toEqual({ name: "Weekly 2" });
  });

  it("sends a cleared optional as null, which is what clears it", () => {
    const contest = contestEdit({ ratingFloor: 1300 });
    const before = argsFromFields(fieldsFromContest(contest), REFS, null);
    const after = argsFromFields({ ...fieldsFromContest(contest), ratingFloor: "" }, REFS, null);

    expect(changedArgs(before, after)).toEqual({ ratingFloor: null });
  });

  it("turns on organisation privacy when the first organisation is named", () => {
    const contest = contestEdit();
    const before = argsFromFields(fieldsFromContest(contest), REFS, null);

    const after = argsFromFields({ ...fieldsFromContest(contest), organizationSlugs: ["maps"] }, REFS, null);

    expect(changedArgs(before, after)).toEqual({ isOrganizationPrivate: true });
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
