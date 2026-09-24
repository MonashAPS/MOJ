/**
 * Settings that are legal, and not what they look like.
 *
 * `describeContest` says what a contest will do; this says which of it the
 * operator probably did not mean. The two are separate because most of a
 * configuration is unremarkable and only a handful of combinations bite, and
 * because a warning has to be actionable — it names the field, and often the
 * one-field change that fixes it.
 *
 * Each of these is bound to a rule somewhere else in this package, and the tests
 * call that rule rather than restating it, so a warning cannot rot into a lie
 * when the rule it describes changes.
 */

import { windowMillis } from "../contestTiming";
import type { Timestamp } from "../types";
import type { DescribeSource } from "./describe";
import { nameGate, organizationGate } from "./entry";
import { problemListReleasePolicy } from "./release";

export type WarningSeverity =
  /** The contest cannot work. The server refuses it too. */
  | "blocked"
  /** Legal, and almost never what was meant. Saving asks for confirmation. */
  | "danger"
  /** Worth a look, no gate. */
  | "caution";

export interface ContestWarning {
  readonly key: string;
  readonly severity: WarningSeverity;
  /** The setting to take the reader to. */
  readonly field: WarningField;
  readonly values?: Readonly<Record<string, number | string>>;
}

export type WarningField =
  | "schedule"
  | "freeze"
  | "entry"
  | "joinLimit"
  | "alwaysAdmit"
  | "rating"
  | "labels"
  | "pretests"
  | "visibility"
  | "problemRelease";

export interface WarningContext {
  readonly now?: Timestamp;
  readonly problemCount?: number;
  readonly pretestedProblemCount?: number;
  /** Whether anyone is already competing, for the changes that move under them. */
  readonly participantCount?: number;
}

const RATING_INIT = 1200;

const SEVERITY_ORDER: Record<WarningSeverity, number> = { blocked: 0, danger: 1, caution: 2 };

/** Different policies are valid, but can make the list and statements available separately. */
export function problemReleaseWarnings(contest: {
  readonly problemListReleaseAt?: "start" | "end" | null;
  readonly publishProblemsAt?: "start" | "end" | null;
}): ContestWarning[] {
  return problemListReleasePolicy(contest) === (contest.publishProblemsAt ?? null)
    ? []
    : [{ severity: "caution", key: "problemReleaseOutOfSync", field: "problemRelease" }];
}

export function contestWarnings(contest: DescribeSource, context: WarningContext = {}): ContestWarning[] {
  const found: ContestWarning[] = problemReleaseWarnings(contest);
  const window = contest.endTime - contest.startTime;
  const now = context.now ?? Date.now();

  /* ------------------------------------------------------------- schedule -- */

  const own = windowMillis(contest);

  if (own !== null && own >= window) {
    // The incident. `participationStart` re-bases the penalty origin to each
    // competitor's join moment, and `participationEndTime` clamps every window
    // to the contest end — so a window this long moves the clock and gives
    // nobody a second more.
    found.push({
      severity: "danger",
      key: own === window ? "windowIsWholeContest" : "windowExceedsContest",
      field: "schedule",
      values: { length: Math.round(own / 60_000) },
    });
  }

  if (own !== null && (context.participantCount ?? 0) > 0 && contest.startTime <= now) {
    found.push({
      severity: "danger",
      key: "scheduleChangedMidContest",
      field: "schedule",
      values: { count: context.participantCount ?? 0 },
    });
  }

  /* ---------------------------------------------------------------- freeze -- */

  const freeze = contest.freeze;

  if (freeze && freeze.minutes * 60_000 >= window) {
    // `freezeTime` clamps to the start, so the board never moves at all.
    found.push({ severity: "blocked", key: "freezeCoversContest", field: "freeze" });
  }

  if (freeze?.blind) {
    // The blind lifts at the contest end; the freeze persists until revealed.
    found.push({ severity: "caution", key: "blindLiftsBeforeFreeze", field: "freeze" });
  }

  /* ----------------------------------------------------------------- entry -- */

  const entry = contest.entry;

  if (entry.kind === "restricted") {
    if (!organizationGate(entry) && !nameGate(entry)) {
      found.push({ severity: "blocked", key: "restrictedNamesNobody", field: "entry" });
    } else if (organizationGate(entry) && nameGate(entry) && entry.match === "all") {
      // `contestAccessCheck` requires both gates, so every organisation member
      // who is not also named is locked out.
      found.push({ severity: "danger", key: "entryNeedsBothGates", field: "entry" });
    }
  }

  const joinLimit = contest.joinLimit;

  if (joinLimit && joinLimit.organizationIds.length === 0) {
    // `contestIsLiveJoinableBy` intersects against an empty list, which nothing
    // satisfies, so the contest is visible and unjoinable.
    found.push({ severity: "blocked", key: "joinLimitNamesNobody", field: "joinLimit" });
  }

  if ((contest.alwaysAdmitProfileIds?.length ?? 0) > 0 && entry.kind === "restricted") {
    // It reads as a scoreboard grant and returns access outright.
    found.push({
      severity: "caution",
      key: "alwaysAdmitIsFullAccess",
      field: "alwaysAdmit",
      values: { count: contest.alwaysAdmitProfileIds?.length ?? 0 },
    });
  }

  if (contest.isVisible === false && contest.startTime <= now && contest.endTime > now) {
    found.push({ severity: "caution", key: "hiddenWhileRunning", field: "visibility" });
  }

  /* ---------------------------------------------------------------- rating -- */

  const rating = contest.rating;

  if (rating) {
    if (rating.floor !== undefined && rating.ceiling !== undefined && rating.floor > rating.ceiling) {
      found.push({ severity: "blocked", key: "ratingBandEmpty", field: "rating" });
    } else if (rating.floor !== undefined && rating.floor > RATING_INIT) {
      // The filter reads the competitor's *previous* rating, and a newcomer has
      // none, so they count as 1200 and a floor above it excludes all of them.
      found.push({
        severity: "danger",
        key: "ratingFloorExcludesNewcomers",
        field: "rating",
        values: { floor: rating.floor, newcomer: RATING_INIT },
      });
    }

    if (rating.everyone && rating.excludeProfileIds.length > 0) {
      found.push({
        severity: "caution",
        key: "rateEveryoneWithExclusions",
        field: "rating",
        values: { count: rating.excludeProfileIds.length },
      });
    }
  }

  /* --------------------------------------------------------------- scoring -- */

  const labels = contest.labels;
  const problemCount = context.problemCount ?? 0;

  if (labels.kind === "custom" && problemCount > 0 && labels.labels.length < problemCount) {
    // Past the end of the list the labels fall back to letters, so the problems
    // read A1, A2, C.
    found.push({
      severity: "caution",
      key: "customLabelsShort",
      field: "labels",
      values: { labels: labels.labels.length, problems: problemCount },
    });
  }

  if (contest.runPretestsOnly && (context.pretestedProblemCount ?? 0) === 0 && problemCount > 0) {
    // Grading ANDs the two, so pretests-only with no pretested problem does
    // nothing at all.
    found.push({ severity: "caution", key: "pretestsWithoutPretestedProblems", field: "pretests" });
  }

  return found.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Whether anything here should stop a save outright. */
export function blockingWarnings(warnings: readonly ContestWarning[]): ContestWarning[] {
  return warnings.filter((warning) => warning.severity === "blocked");
}

/** Whether anything here should be confirmed before a save. */
export function dangerWarnings(warnings: readonly ContestWarning[]): ContestWarning[] {
  return warnings.filter((warning) => warning.severity === "danger");
}
