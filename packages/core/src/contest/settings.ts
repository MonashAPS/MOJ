/**
 * A contest's settings as the shapes they actually are.
 *
 * The stored row spells four decisions as loose flags that only mean something
 * together: whether the clock is shared or per-participant (`timeLimit`), who
 * may enter (`isPrivate` and `isOrganizationPrivate` over three lists), whether
 * the board freezes (`freezeMinutes` and four more), and whether the contest is
 * rated (`isRated` and five more). Every reader has to know the combining rules,
 * and several combinations mean nothing at all — a rating floor on an unrated
 * contest, a blind freeze of zero minutes, a join limit naming no organisation.
 *
 * These accessors name the shapes instead, so a reader asks what the contest
 * does rather than reassembling it from flags. They are also the seam the stored
 * shape changes behind: while the schema carries both, only this file knows, and
 * every caller keeps reading the same thing.
 */

import type { Id, JsonValue, LabelScheme, Timestamp } from "../types";

/* -------------------------------------------------------------------------- */
/* The shapes                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How the clock runs.
 *
 * `window` is the one that surprises people: it does not only cap how long a
 * competitor has, it moves the origin their penalty time is measured from to the
 * moment they joined. See `participationStart`.
 */
export type ContestSchedule =
  | { readonly kind: "together" }
  | { readonly kind: "window"; readonly seconds: number };

/**
 * Who may enter.
 *
 * `match` is what DMOJ leaves implicit: with both an organisation gate and a
 * named-people gate set, a competitor has to satisfy *both*, which is why
 * turning on the second for an organisation contest locks out every member who
 * is not also named.
 */
export type ContestEntry =
  | { readonly kind: "open" }
  | {
      readonly kind: "restricted";
      readonly match: "all" | "any";
      /**
       * Which gates are on. A gate that is on and names nobody admits nobody,
       * which is not the same as a gate that is off — and the stored flags can
       * say both, so the shape has to as well.
       */
      readonly byOrganization: boolean;
      readonly byName: boolean;
      readonly organizationIds: readonly Id[];
      readonly classIds: readonly Id[];
      readonly profileIds: readonly Id[];
    };

/** Which organisations may join, once entry has been allowed. Null means anyone. */
export interface ContestJoinLimit {
  readonly organizationIds: readonly Id[];
}

/** Null means the board never freezes. */
export interface ContestFreeze {
  readonly minutes: number;
  /** Contestants see "pending" for their own verdicts, until the contest ends. */
  readonly blind: boolean;
}

/** Null means unrated, and every setting below is inert. */
export interface ContestRating {
  /** `rateAll`: rate competitors who submitted nothing. */
  readonly everyone: boolean;
  readonly excludeProfileIds: readonly Id[];
  /** Filters on the competitor's *previous* rating, with a newcomer counting as 1200. */
  readonly floor: number | null;
  /** Also caps performance at `ceiling + 400` unless `performanceCeiling` overrides it. */
  readonly ceiling: number | null;
  readonly performanceCeiling: number | null;
}

export type ContestLabels =
  | { readonly kind: "letters" }
  | { readonly kind: "custom"; readonly labels: readonly string[] };

/* -------------------------------------------------------------------------- */
/* Reading them off a contest                                                 */
/* -------------------------------------------------------------------------- */

/** The fields these read. A `ContestRow` satisfies it, and so does a Convex document. */
export interface ContestSettingsSource {
  readonly timeLimit?: number | null;
  /** Absent reads as off, for the callers that carry only part of a contest. */
  readonly isPrivate?: boolean;
  readonly isOrganizationPrivate?: boolean;
  readonly privateContestantProfileIds?: readonly Id[];
  readonly organizationIds?: readonly Id[];
  readonly classIds?: readonly Id[];
  readonly limitJoinOrganizations?: boolean;
  readonly joinOrganizationIds?: readonly Id[];
  readonly freezeMinutes?: number;
  readonly blindDuringFreeze?: boolean;
  readonly isRated?: boolean;
  readonly rateAll?: boolean;
  readonly rateExcludeProfileIds?: readonly Id[];
  readonly ratingFloor?: number | null;
  readonly ratingCeiling?: number | null;
  readonly performanceCeilingOverride?: number | null;
  readonly labelScheme?: LabelScheme;
  readonly customLabels?: readonly string[];
}

/**
 * `together` unless a window is set.
 *
 * Zero is `together`, which is what DMOJ means by it: `Contest.time_limit` is a
 * `DurationField` tested for truth, and a zero timedelta is falsy.
 */
export function scheduleOf(contest: ContestSettingsSource): ContestSchedule {
  const seconds = contest.timeLimit;

  if (seconds === null || seconds === undefined || seconds === 0) return { kind: "together" };

  return { kind: "window", seconds };
}

export function entryOf(contest: ContestSettingsSource): ContestEntry {
  const byOrganization = contest.isOrganizationPrivate ?? false;
  const byName = contest.isPrivate ?? false;

  if (!byOrganization && !byName) return { kind: "open" };

  return {
    kind: "restricted",
    // Both gates on means both must be satisfied. One gate on makes the
    // distinction moot, and `all` is the reading that does not change it.
    match: "all",
    byOrganization,
    byName,
    organizationIds: byOrganization ? (contest.organizationIds ?? []) : [],
    classIds: byOrganization ? (contest.classIds ?? []) : [],
    profileIds: byName ? (contest.privateContestantProfileIds ?? []) : [],
  };
}

/**
 * Null unless joining is limited to named organisations.
 *
 * A limit naming nothing is not a limit that admits nobody — it is a flag with
 * no list, which `contestIsLiveJoinableBy` reads as "nobody matches". Reporting
 * it as a limit keeps that behaviour visible to the caller rather than hiding it.
 */
export function joinLimitOf(contest: ContestSettingsSource): ContestJoinLimit | null {
  if (!contest.limitJoinOrganizations) return null;

  return { organizationIds: contest.joinOrganizationIds ?? [] };
}

export function freezeOf(contest: ContestSettingsSource): ContestFreeze | null {
  const minutes = contest.freezeMinutes ?? 0;

  if (minutes <= 0) return null;

  return { minutes, blind: contest.blindDuringFreeze ?? false };
}

export function ratingOf(contest: ContestSettingsSource): ContestRating | null {
  if (!contest.isRated) return null;

  return {
    everyone: contest.rateAll ?? false,
    excludeProfileIds: contest.rateExcludeProfileIds ?? [],
    floor: contest.ratingFloor ?? null,
    ceiling: contest.ratingCeiling ?? null,
    performanceCeiling: contest.performanceCeilingOverride ?? null,
  };
}

/**
 * `letters` unless custom labels were chosen.
 *
 * `numbers` is stored on every imported contest and has never rendered as
 * anything but letters, so it reads as what it draws.
 */
export function labelsOf(contest: ContestSettingsSource): ContestLabels {
  if (contest.labelScheme !== "custom") return { kind: "letters" };

  return { kind: "custom", labels: contest.customLabels ?? [] };
}

/* -------------------------------------------------------------------------- */
/* Questions the shapes answer                                                */
/* -------------------------------------------------------------------------- */

/** Whether a competitor's clock, and so their penalty origin, starts when they join. */
export function hasOwnWindow(contest: ContestSettingsSource): boolean {
  return scheduleOf(contest).kind === "window";
}

/** The window in milliseconds, or null when everyone shares the contest's. */
export function windowMillis(contest: ContestSettingsSource): number | null {
  const schedule = scheduleOf(contest);

  return schedule.kind === "window" ? schedule.seconds * 1000 : null;
}

/** Unused for now by the readers, but the shape the format config will take. */
export type ContestFormatConfig = JsonValue;

/** When the board stops updating, or null when it never does. */
export function freezeAt(
  contest: ContestSettingsSource & { readonly startTime: Timestamp; readonly endTime: Timestamp },
): Timestamp | null {
  const freeze = freezeOf(contest);

  if (!freeze) return null;

  // A freeze at least as long as the contest clamps to the start, so the board
  // is frozen from the moment it opens. `validateTiming` refuses new ones.
  return Math.max(contest.startTime, contest.endTime - freeze.minutes * 60_000);
}
