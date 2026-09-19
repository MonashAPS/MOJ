/**
 * The general tab's form values, and what they mean as mutation arguments.
 *
 * Both halves are pure so they can be tested, which matters here because the web
 * app has no DOM tests: everything worth proving about this form has to live
 * outside the component.
 *
 * The reason it exists is that the tab used to send all forty fields on every
 * save. That made every save a rewrite of the whole row, and two fields the form
 * cannot represent exactly were rewritten with it — `labelScheme: "numbers"`,
 * which the form reads as `letters`, and `isOrganizationPrivate`, which the form
 * derives from whether the organisation and class lists are empty. Opening a
 * contest and pressing Save changed both. Sending only what differs makes an
 * untouched field impossible to damage, because it is never in the patch.
 */

import type { Id } from "@convex/_generated/dataModel";
import type { ContestEdit } from "./types";

/**
 * Whatever the chosen format decided to store. `contests.formatConfig` is
 * `v.any()` in the schema and each format validates its own shape through
 * `validateContestFormatConfig`, so there is nothing narrower to say here.
 */
export type FormatConfig = ContestEdit["formatConfig"];

/** A format's config is whatever the format decided to store, so the editor
 *  shows it as the JSON it is. */
export function toJson(value: FormatConfig): string {
  if (value === null || value === undefined) return "";

  return JSON.stringify(value, null, 2);
}

/**
 * What the controls hold. Strings where the widget is a text input, so the
 * coercion happens once, here, rather than inline in the JSX.
 */
export interface ContestGeneralFields {
  name: string;
  description: string;
  summary: string;
  startTime: number | null;
  endTime: number | null;
  /** Minutes, because that is what the field asks for; the mutation takes seconds. */
  timeLimit: string;
  isVisible: boolean;
  isRated: boolean;
  ratingFloor: string;
  ratingCeiling: string;
  performanceCeiling: string;
  rateAll: boolean;
  rateExclude: string[];
  formatName: string;
  formatConfig: string;
  labelScheme: "letters" | "custom";
  customLabels: string;
  scoreboardVisibility: ContestEdit["scoreboardVisibility"];
  freezeMinutes: string;
  blindDuringFreeze: boolean;
  accessCode: string;
  isPrivate: boolean;
  privateContestants: string[];
  organizationSlugs: string[];
  classNames: string[];
  limitJoinOrganizations: boolean;
  joinOrganizationSlugs: string[];
  tagNames: string[];
  lockedAfter: number | null;
  pointsPrecision: string;
  hideProblemTags: boolean;
  disableLockdown: boolean;
  hideProblemAuthors: boolean;
  runPretestsOnly: boolean;
  showShortDisplay: boolean;
  useClarifications: boolean;
  ogImage: string;
  logoOverrideImage: string;
  bannedUsers: string[];
}

/**
 * The part of a contest this tab reads. Naming it, rather than taking the whole
 * `ContestEdit`, is what lets the tests build one without pretending to be the
 * ids and permissions `edit` also resolves and nothing here touches.
 */
export type ContestFieldSource = Pick<
  ContestEdit,
  | "name"
  | "description"
  | "summary"
  | "startTime"
  | "endTime"
  | "timeLimit"
  | "isVisible"
  | "isRated"
  | "ratingFloor"
  | "ratingCeiling"
  | "performanceCeilingOverride"
  | "rateAll"
  | "rateExclude"
  | "formatName"
  | "formatConfig"
  | "labelScheme"
  | "customLabels"
  | "scoreboardVisibility"
  | "freezeMinutes"
  | "blindDuringFreeze"
  | "accessCode"
  | "isPrivate"
  | "privateContestants"
  | "organizationSlugs"
  | "classNames"
  | "limitJoinOrganizations"
  | "joinOrganizationSlugs"
  | "tagNames"
  | "lockedAfter"
  | "pointsPrecision"
  | "hideProblemTags"
  | "disableLockdown"
  | "hideProblemAuthors"
  | "runPretestsOnly"
  | "showShortDisplay"
  | "useClarifications"
  | "ogImage"
  | "logoOverrideImage"
  | "bannedUsers"
>;

/**
 * The stored contest as the controls hold it.
 *
 * `labelScheme: "numbers"` reads as `letters` because numbering was removed from
 * the site and a contest still carrying it already renders as lettered. Reading
 * it that way is only safe because the save diffs against this same projection,
 * so an untouched contest sends no `labelScheme` at all and keeps what it has.
 */
export function fieldsFromContest(contest: ContestFieldSource): ContestGeneralFields {
  return {
    name: contest.name,
    description: contest.description,
    summary: contest.summary,
    startTime: contest.startTime,
    endTime: contest.endTime,
    // Whole minutes. A stored value that is not a whole number of minutes cannot
    // survive the round trip, and would be rewritten to the nearest one by any
    // save that touches the schedule.
    timeLimit: contest.timeLimit === null ? "" : String(Math.round(contest.timeLimit / 60)),
    isVisible: contest.isVisible,
    isRated: contest.isRated,
    ratingFloor: contest.ratingFloor?.toString() ?? "",
    ratingCeiling: contest.ratingCeiling?.toString() ?? "",
    performanceCeiling: contest.performanceCeilingOverride?.toString() ?? "",
    rateAll: contest.rateAll,
    rateExclude: contest.rateExclude,
    formatName: contest.formatName,
    formatConfig: toJson(contest.formatConfig),
    labelScheme: contest.labelScheme === "custom" ? "custom" : "letters",
    customLabels: contest.customLabels.join(", "),
    scoreboardVisibility: contest.scoreboardVisibility,
    freezeMinutes: String(contest.freezeMinutes),
    blindDuringFreeze: contest.blindDuringFreeze,
    accessCode: contest.accessCode,
    isPrivate: contest.isPrivate,
    privateContestants: contest.privateContestants,
    organizationSlugs: contest.organizationSlugs,
    classNames: contest.classNames,
    limitJoinOrganizations: contest.limitJoinOrganizations,
    joinOrganizationSlugs: contest.joinOrganizationSlugs,
    tagNames: contest.tagNames,
    lockedAfter: contest.lockedAfter,
    pointsPrecision: String(contest.pointsPrecision),
    hideProblemTags: contest.hideProblemTags,
    disableLockdown: contest.disableLockdown,
    hideProblemAuthors: contest.hideProblemAuthors,
    runPretestsOnly: contest.runPretestsOnly,
    showShortDisplay: contest.showShortDisplay,
    useClarifications: contest.useClarifications,
    ogImage: contest.ogImage,
    logoOverrideImage: contest.logoOverrideImage,
    bannedUsers: contest.bannedUsers,
  };
}

/** The ids the names on the form resolved to, from `useResolvedRefs`. */
export interface FieldRefs {
  profileIdsFor: (usernames: readonly string[]) => Id<"profiles">[];
  organizationIds: Id<"organizations">[];
  joinOrganizationIds: Id<"organizations">[];
  classIds: Id<"classes">[];
  tagIds: Id<"contestTags">[];
}

/** Every argument `admin.contests.update` takes from this tab, except `key` and `reason`. */
export type ContestGeneralArgs = ReturnType<typeof argsFromFields>;

export function argsFromFields(fields: ContestGeneralFields, refs: FieldRefs, formatConfig: FormatConfig) {
  return {
    name: fields.name,
    description: fields.description,
    summary: fields.summary.trim() || null,
    // `v.optional(v.number())`, with no null: the pickers are not clearable, so a
    // null here is a transient state and leaving the key out keeps what is stored.
    startTime: fields.startTime ?? undefined,
    endTime: fields.endTime ?? undefined,
    timeLimit: fields.timeLimit.trim() ? Number(fields.timeLimit) * 60 : null,
    isVisible: fields.isVisible,
    isRated: fields.isRated,
    ratingFloor: fields.ratingFloor.trim() ? Number(fields.ratingFloor) : null,
    ratingCeiling: fields.ratingCeiling.trim() ? Number(fields.ratingCeiling) : null,
    performanceCeilingOverride: fields.performanceCeiling.trim() ? Number(fields.performanceCeiling) : null,
    rateAll: fields.rateAll,
    rateExcludeProfileIds: refs.profileIdsFor(fields.rateExclude),
    formatName: fields.formatName,
    formatConfig,
    labelScheme: fields.labelScheme,
    customLabels: fields.customLabels
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean),
    scoreboardVisibility: fields.scoreboardVisibility,
    freezeMinutes: Number(fields.freezeMinutes) || 0,
    blindDuringFreeze: fields.blindDuringFreeze,
    accessCode: fields.accessCode.trim() || null,
    isPrivate: fields.isPrivate,
    privateContestantProfileIds: refs.profileIdsFor(fields.privateContestants),
    // Not a control: the form says a contest is organisation-private when it
    // names an organisation or a class.
    isOrganizationPrivate: fields.organizationSlugs.length > 0 || fields.classNames.length > 0,
    organizationIds: refs.organizationIds,
    classIds: refs.classIds,
    limitJoinOrganizations: fields.limitJoinOrganizations,
    joinOrganizationIds: refs.joinOrganizationIds,
    tagIds: refs.tagIds,
    lockedAfter: fields.lockedAfter,
    pointsPrecision: Number(fields.pointsPrecision) || 0,
    hideProblemTags: fields.hideProblemTags,
    disableLockdown: fields.disableLockdown,
    hideProblemAuthors: fields.hideProblemAuthors,
    runPretestsOnly: fields.runPretestsOnly,
    showShortDisplay: fields.showShortDisplay,
    useClarifications: fields.useClarifications,
    ogImage: fields.ogImage.trim() || null,
    logoOverrideImage: fields.logoOverrideImage.trim() || null,
    bannedProfileIds: refs.profileIdsFor(fields.bannedUsers),
  };
}

/**
 * The arguments that differ, which is all a save needs to send.
 *
 * `admin.contests.update` skips every absent key (`copyField`), so a field left
 * out is a field left alone — including the two this form cannot represent
 * exactly. Comparison is structural, so a list reordered by the picker counts as
 * a change and a list merely re-resolved does not.
 */
export function changedArgs(
  before: ContestGeneralArgs,
  after: ContestGeneralArgs,
): Partial<ContestGeneralArgs> {
  // SAFETY: the keys come from `after` itself, so each is one of its own; the
  // standard library types `Object.keys` as `string[]` only because a wider
  // object could have been passed, which this signature forbids. The entries
  // then carry `after`'s own values, so the result is a subset of its shape.
  const keys = Object.keys(after) as (keyof ContestGeneralArgs)[];

  const entries = keys
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => [key, after[key]] as const);

  return Object.fromEntries(entries);
}
