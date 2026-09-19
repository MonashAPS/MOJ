/**
 * What a contest will do, in sentences, for the editor to show beside the form.
 *
 * This is the whole point of the redesign. A contest went out with its penalty
 * clock re-based to each competitor's join moment because the field that does
 * that is called "Time limit" and sits between Start and End, and nothing
 * anywhere said what setting it would do. Reading the settings back as
 * consequences is what catches that before Save, not better labels.
 *
 * A line is a message key, not a sentence, for the reason `ScoringLine` is:
 * this package has no locale. Times and durations arrive already formatted,
 * because how long "5 hours" is in words is the web app's business.
 */

import type { ScoringLine } from "../formats/base";
import type { Timestamp } from "../types";
import {
  type ContestSettingsSource,
  entryOf,
  freezeAt,
  freezeOf,
  joinLimitOf,
  labelsOf,
  ratingOf,
  windowMillis,
} from "./settings";

/** Which part of the summary a line belongs under. */
export type SummaryGroup = "when" | "who" | "scoring" | "rating";

export interface SummaryLine extends ScoringLine {
  readonly group: SummaryGroup;
}

export interface DescribeSource extends ContestSettingsSource {
  readonly startTime: Timestamp;
  readonly endTime: Timestamp;
  readonly isVisible?: boolean;
  readonly accessCode?: string | null;
  readonly lockedAfter?: Timestamp | null;
  readonly runPretestsOnly?: boolean;
  /**
   * Named for the scoreboard, but `contestAccessCheck` returns access outright
   * for anyone on it, so it admits people to the whole contest.
   */
  readonly viewContestScoreboardProfileIds?: readonly string[];
}

export interface DescribeOptions {
  /** A moment, as the viewer reads it. Defaults to an ISO string for the tests. */
  readonly moment?: (at: Timestamp) => string;
  /** A length of time, as the viewer reads it. */
  readonly duration?: (millis: number) => string;
  /** How many organisations and classes the entry gate names, once resolved. */
  readonly audience?: string;
  /** How many problems the contest carries, for the lines that count them. */
  readonly problemCount?: number;
}

const RATING_INIT = 1200;

function isoMoment(at: Timestamp): string {
  return new Date(at).toISOString();
}

function plainDuration(millis: number): string {
  return `${Math.round(millis / 60_000)} min`;
}

export function describeContest(contest: DescribeSource, options: DescribeOptions = {}): SummaryLine[] {
  const moment = options.moment ?? isoMoment;
  const duration = options.duration ?? plainDuration;
  const lines: SummaryLine[] = [];
  const window = contest.endTime - contest.startTime;

  /* ----------------------------------------------------------------- when -- */

  lines.push({
    group: "when",
    key: "window",
    values: { start: moment(contest.startTime), end: moment(contest.endTime), length: duration(window) },
  });

  const own = windowMillis(contest);

  if (own === null) {
    lines.push({ group: "when", key: "together" });
  } else {
    lines.push({ group: "when", key: "ownWindow", values: { length: duration(own) } });

    // Every window still stops at the contest end, so joining late is a shorter
    // contest rather than a later finish.
    if (own < window) {
      lines.push({ group: "when", key: "ownWindowCutoff", values: { at: moment(contest.endTime - own) } });
    }
  }

  if (contest.lockedAfter != null) {
    lines.push({ group: "when", key: "locked", values: { at: moment(contest.lockedAfter) } });
  }

  /* ------------------------------------------------------------------ who -- */

  const entry = entryOf(contest);

  if (contest.isVisible === false) lines.push({ group: "who", key: "hidden" });

  if (entry.kind === "open") {
    lines.push({ group: "who", key: "open" });
  } else if (entry.byOrganization && entry.byName) {
    lines.push({
      group: "who",
      key: entry.match === "all" ? "restrictedBoth" : "restrictedEither",
      values: { audience: options.audience ?? "", count: entry.profileIds.length },
    });
  } else if (entry.byOrganization) {
    lines.push({
      group: "who",
      key: "restrictedOrganizations",
      values: { audience: options.audience ?? "" },
    });
  } else {
    lines.push({ group: "who", key: "restrictedNamed", values: { count: entry.profileIds.length } });
  }

  if (contest.accessCode) lines.push({ group: "who", key: "accessCode" });

  if (joinLimitOf(contest)) lines.push({ group: "who", key: "joinLimit" });

  /* -------------------------------------------------------------- scoring -- */

  const freeze = freezeOf(contest);
  const frozenAt = freezeAt(contest);

  if (freeze && frozenAt !== null) {
    lines.push({
      group: "scoring",
      key: "freeze",
      values: { minutes: freeze.minutes, at: moment(frozenAt) },
    });

    // The blind lifts when the contest ends; the freeze itself does not, which
    // is the half people read as one switch.
    if (freeze.blind) lines.push({ group: "scoring", key: "blind" });
  } else {
    lines.push({ group: "scoring", key: "noFreeze" });
  }

  const labels = labelsOf(contest);

  if (labels.kind === "custom") {
    lines.push({ group: "scoring", key: "labelsCustom", values: { count: labels.labels.length } });
  }

  if (contest.runPretestsOnly) lines.push({ group: "scoring", key: "pretests" });

  /* --------------------------------------------------------------- rating -- */

  const rating = ratingOf(contest);

  if (!rating) {
    lines.push({ group: "rating", key: "unrated" });

    return lines;
  }

  lines.push({ group: "rating", key: rating.everyone ? "ratedEveryone" : "ratedScorers" });

  if (rating.floor !== null || rating.ceiling !== null) {
    lines.push({
      group: "rating",
      key: "ratedBand",
      values: {
        floor: rating.floor ?? 0,
        ceiling: rating.ceiling ?? 0,
        newcomer: RATING_INIT,
      },
    });
  }

  if (rating.performanceCeiling !== null) {
    lines.push({ group: "rating", key: "performanceCeiling", values: { at: rating.performanceCeiling } });
  }

  return lines;
}
