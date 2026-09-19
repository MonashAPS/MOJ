/**
 * The settings tabs' form values, and what they mean as mutation arguments.
 *
 * Both halves are pure so they can be tested, which matters here because the web
 * app has no DOM tests: everything worth proving about this form has to live
 * outside the component.
 *
 * A save sends only what differs from the stored contest, so an untouched field
 * is never in the patch and can never be damaged by one.
 */

import type { AudiencePolicy, DescribeSource } from "@moj/core";
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
 * coercion happens once, here, rather than inline in the JSX. An empty string
 * in `windowMinutes` or `freezeMinutes` is the mode with no number in it.
 */
export interface ContestGeneralFields {
  name: string;
  description: string;
  summary: string;
  startTime: number | null;
  endTime: number | null;
  /** Minutes each contestant gets, or "" when everyone runs on the contest's clock. */
  windowMinutes: string;
  isVisible: boolean;
  entry: "open" | "restricted";
  entryMatch: "all" | "any";
  organizationSlugs: string[];
  classNames: string[];
  namedUsers: string[];
  /** Organisations that may join; empty means anyone who can enter. */
  joinOrganizationSlugs: string[];
  accessCode: string;
  formatName: string;
  formatConfig: string;
  labels: "letters" | "custom";
  customLabels: string;
  scoreboard: AudiencePolicy;
  /** Minutes before the end, or "" for no freeze. */
  freezeMinutes: string;
  blind: boolean;
  isRated: boolean;
  rateEveryone: boolean;
  ratingFloor: string;
  ratingCeiling: string;
  performanceCeiling: string;
  rateExclude: string[];
  tagNames: string[];
  lockedAfter: number | null;
  pointsPrecision: string;
  hideProblemTags: boolean;
  disableLockdown: boolean;
  hideProblemAuthors: boolean;
  runPretestsOnly: boolean;
  proctorRequired: boolean;
  useClarifications: boolean;
  bannedUsers: string[];
}

/**
 * The part of a contest these tabs read. Naming it, rather than taking the whole
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
  | "schedule"
  | "isVisible"
  | "entry"
  | "joinLimit"
  | "accessCode"
  | "formatName"
  | "formatConfig"
  | "labels"
  | "scoreboard"
  | "freeze"
  | "rating"
  | "tagNames"
  | "lockedAfter"
  | "pointsPrecision"
  | "hideProblemTags"
  | "disableLockdown"
  | "hideProblemAuthors"
  | "runPretestsOnly"
  | "proctorRequired"
  | "publishProblemsAt"
  | "problemsPublishedAt"
  | "useClarifications"
  | "bannedUsers"
>;

/** The stored contest as the controls hold it. */
export function fieldsFromContest(contest: ContestFieldSource): ContestGeneralFields {
  const restricted = contest.entry.kind === "restricted" ? contest.entry : null;

  return {
    name: contest.name,
    description: contest.description,
    summary: contest.summary,
    startTime: contest.startTime,
    endTime: contest.endTime,
    // Whole minutes. A stored value that is not a whole number of minutes cannot
    // survive the round trip, and would be rewritten to the nearest one by any
    // save that touches the schedule.
    windowMinutes:
      contest.schedule.kind === "window" ? String(Math.round(contest.schedule.seconds / 60)) : "",
    isVisible: contest.isVisible,
    entry: contest.entry.kind,
    entryMatch: restricted?.match ?? "all",
    organizationSlugs: restricted?.organizationSlugs ?? [],
    classNames: restricted?.classNames ?? [],
    namedUsers: restricted?.usernames ?? [],
    joinOrganizationSlugs: contest.joinLimit?.organizationSlugs ?? [],
    accessCode: contest.accessCode,
    formatName: contest.formatName,
    formatConfig: toJson(contest.formatConfig),
    labels: contest.labels.kind,
    customLabels: contest.labels.kind === "custom" ? contest.labels.labels.join(", ") : "",
    scoreboard: contest.scoreboard,
    freezeMinutes: contest.freeze ? String(contest.freeze.minutes) : "",
    blind: contest.freeze?.blind ?? false,
    isRated: contest.rating !== null,
    rateEveryone: contest.rating?.everyone ?? false,
    ratingFloor: contest.rating?.floor?.toString() ?? "",
    ratingCeiling: contest.rating?.ceiling?.toString() ?? "",
    performanceCeiling: contest.rating?.performanceCeiling?.toString() ?? "",
    rateExclude: contest.rating?.excluded ?? [],
    tagNames: contest.tagNames,
    lockedAfter: contest.lockedAfter,
    pointsPrecision: String(contest.pointsPrecision),
    hideProblemTags: contest.hideProblemTags,
    disableLockdown: contest.disableLockdown,
    hideProblemAuthors: contest.hideProblemAuthors,
    runPretestsOnly: contest.runPretestsOnly,
    proctorRequired: contest.proctorRequired,
    useClarifications: contest.useClarifications,
    bannedUsers: contest.bannedUsers,
  };
}

/**
 * What the names on the form stand for. The mutation wants document ids, from
 * `useResolvedRefs`; the summary is happy with the names themselves, because
 * it only ever counts them.
 */
export interface SettingsRefs<P extends string, O extends string, C extends string> {
  profileIdsFor: (usernames: readonly string[]) => P[];
  organizationIds: O[];
  joinOrganizationIds: O[];
  classIds: C[];
}

/** The ids the names on the form resolved to, from `useResolvedRefs`. */
export type FieldRefs<P extends string, O extends string, C extends string, T extends string> = SettingsRefs<
  P,
  O,
  C
> & {
  tagIds: T[];
};

function optionalNumber(text: string): number | undefined {
  return text.trim() ? Number(text) : undefined;
}

/** The settings the form holds, as the shapes the contest stores. */
function settingsOf<P extends string, O extends string, C extends string>(
  fields: ContestGeneralFields,
  refs: SettingsRefs<P, O, C>,
) {
  return {
    schedule: fields.windowMinutes.trim()
      ? { kind: "window" as const, seconds: Number(fields.windowMinutes) * 60 }
      : { kind: "together" as const },
    entry:
      fields.entry === "open"
        ? { kind: "open" as const }
        : {
            kind: "restricted" as const,
            match: fields.entryMatch,
            organizationIds: refs.organizationIds,
            classIds: refs.classIds,
            profileIds: refs.profileIdsFor(fields.namedUsers),
          },
    // A join limit naming nobody admits nobody, and nothing wants to say that,
    // so the limit exists exactly when the list has somebody in it.
    joinLimit: fields.joinOrganizationSlugs.length > 0 ? { organizationIds: refs.joinOrganizationIds } : null,
    freeze: fields.freezeMinutes.trim()
      ? { minutes: Number(fields.freezeMinutes), blind: fields.blind }
      : null,
    rating: fields.isRated
      ? {
          everyone: fields.rateEveryone,
          excludeProfileIds: refs.profileIdsFor(fields.rateExclude),
          floor: optionalNumber(fields.ratingFloor),
          ceiling: optionalNumber(fields.ratingCeiling),
          performanceCeiling: optionalNumber(fields.performanceCeiling),
        }
      : null,
    labels:
      fields.labels === "custom"
        ? {
            kind: "custom" as const,
            labels: fields.customLabels
              .split(",")
              .map((label) => label.trim())
              .filter(Boolean),
          }
        : { kind: "letters" as const },
  };
}

/**
 * The draft as the summary reads it: names stand in for ids, a date the picker
 * has momentarily emptied reads as the stored one, and publishing is the
 * Problems tab's, read as saved.
 */
export function describeSourceOf(
  fields: ContestGeneralFields,
  saved: {
    startTime: number;
    endTime: number;
    publishProblemsAt: "start" | "end" | null;
    problemsPublishedAt: number | null;
  },
): DescribeSource {
  const settings = settingsOf(fields, {
    profileIdsFor: (usernames) => [...usernames],
    organizationIds: fields.organizationSlugs,
    joinOrganizationIds: fields.joinOrganizationSlugs,
    classIds: fields.classNames,
  });

  return {
    startTime: fields.startTime ?? saved.startTime,
    endTime: fields.endTime ?? saved.endTime,
    schedule: settings.schedule,
    entry: settings.entry,
    joinLimit: settings.joinLimit ?? undefined,
    freeze: settings.freeze ? settings.freeze : undefined,
    rating: settings.rating ?? undefined,
    labels: settings.labels,
    isVisible: fields.isVisible,
    scoreboard: fields.scoreboard,
    accessCode: fields.accessCode.trim() || null,
    lockedAfter: fields.lockedAfter,
    runPretestsOnly: fields.runPretestsOnly,
    publishProblemsAt: saved.publishProblemsAt ?? undefined,
    problemsPublishedAt: saved.problemsPublishedAt ?? undefined,
  };
}

/** Every argument `admin.contests.update` takes from these tabs, except `key` and `reason`. */
export function argsFromFields<P extends string, O extends string, C extends string, T extends string>(
  fields: ContestGeneralFields,
  refs: FieldRefs<P, O, C, T>,
  formatConfig: FormatConfig,
) {
  return {
    name: fields.name,
    description: fields.description,
    summary: fields.summary.trim() || null,
    // `v.optional(v.number())`, with no null: the pickers are not clearable, so a
    // null here is a transient state and leaving the key out keeps what is stored.
    startTime: fields.startTime ?? undefined,
    endTime: fields.endTime ?? undefined,
    ...settingsOf(fields, refs),
    isVisible: fields.isVisible,
    accessCode: fields.accessCode.trim() || null,
    formatName: fields.formatName,
    formatConfig,
    // The mutation takes a list it may keep; the draft holds a frozen one.
    scoreboard: { audiences: [...fields.scoreboard.audiences], from: fields.scoreboard.from },
    tagIds: refs.tagIds,
    lockedAfter: fields.lockedAfter,
    pointsPrecision: Number(fields.pointsPrecision) || 0,
    hideProblemTags: fields.hideProblemTags,
    disableLockdown: fields.disableLockdown,
    hideProblemAuthors: fields.hideProblemAuthors,
    runPretestsOnly: fields.runPretestsOnly,
    proctorRequired: fields.proctorRequired,
    useClarifications: fields.useClarifications,
    bannedProfileIds: refs.profileIdsFor(fields.bannedUsers),
  };
}

/**
 * The arguments that differ, which is all a save needs to send.
 *
 * `admin.contests.update` skips every absent key, so a field left out is a
 * field left alone. Comparison is structural, so a list reordered by the picker
 * counts as a change and a list merely re-resolved does not.
 */
export function changedArgs<Args extends object>(before: Args, after: Args): Partial<Args> {
  // SAFETY: the keys come from `after` itself, so each is one of its own; the
  // standard library types `Object.keys` as `string[]` only because a wider
  // object could have been passed, which this signature forbids. The entries
  // then carry `after`'s own values, so the result is a subset of its shape.
  const keys = Object.keys(after) as (keyof Args)[];

  const entries = keys
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => [key, after[key]] as const);

  // SAFETY: `entries` pairs each of `after`'s own keys with its own value.
  return Object.fromEntries(entries) as Partial<Args>;
}
