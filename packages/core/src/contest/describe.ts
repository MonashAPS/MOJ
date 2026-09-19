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

import { windowMillis } from "../contestTiming";
import type { ScoringLine } from "../formats/base";
import { freezeTime } from "../scoreboard";
import type { Audience, ContestRow, Timestamp } from "../types";
import { nameGate, organizationGate } from "./entry";

/** Which part of the summary a line belongs under. */
export type SummaryGroup = "when" | "who" | "scoring" | "rating";

export interface SummaryLine extends ScoringLine {
  readonly group: SummaryGroup;
}

/** What the summary reads. A `ContestRow` satisfies it, and so does an editor's draft. */
export type DescribeSource = Pick<
  ContestRow,
  "startTime" | "endTime" | "schedule" | "entry" | "joinLimit" | "freeze" | "rating" | "labels"
> &
  Partial<
    Pick<
      ContestRow,
      | "isVisible"
      | "scoreboard"
      | "accessCode"
      | "lockedAfter"
      | "runPretestsOnly"
      | "alwaysAdmitProfileIds"
      | "publishProblemsAtEnd"
      | "problemsPublishedAt"
    >
  >;

export interface DescribeOptions {
  /** A moment, as the viewer reads it. Defaults to an ISO string for the tests. */
  readonly moment?: (at: Timestamp) => string;
  /** A length of time, as the viewer reads it. */
  readonly duration?: (millis: number) => string;
  /** How many organisations and classes the entry gate names, once resolved. */
  readonly audience?: string;
  /** The audiences of a policy, named as the viewer reads them. */
  readonly audiences?: (list: readonly Audience[]) => string;
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

  if (contest.problemsPublishedAt !== undefined) {
    lines.push({
      group: "when",
      key: "problemsPublished",
      values: { at: moment(contest.problemsPublishedAt) },
    });
  } else if (contest.publishProblemsAtEnd) {
    lines.push({ group: "when", key: "publishAtEnd", values: { at: moment(contest.endTime) } });
  }

  /* ------------------------------------------------------------------ who -- */

  const entry = contest.entry;

  if (contest.isVisible === false) lines.push({ group: "who", key: "hidden" });

  if (entry.kind === "open") {
    lines.push({ group: "who", key: "open" });
  } else if (!organizationGate(entry) && !nameGate(entry)) {
    lines.push({ group: "who", key: "restrictedNobody" });
  } else if (organizationGate(entry) && nameGate(entry)) {
    lines.push({
      group: "who",
      key: entry.match === "all" ? "restrictedBoth" : "restrictedEither",
      values: { audience: options.audience ?? "", count: entry.profileIds.length },
    });
  } else if (organizationGate(entry)) {
    lines.push({
      group: "who",
      key: "restrictedOrganizations",
      values: { audience: options.audience ?? "" },
    });
  } else {
    lines.push({ group: "who", key: "restrictedNamed", values: { count: entry.profileIds.length } });
  }

  if (contest.accessCode) lines.push({ group: "who", key: "accessCode" });

  if (contest.joinLimit) lines.push({ group: "who", key: "joinLimit" });

  /* -------------------------------------------------------------- scoring -- */

  if (contest.scoreboard) {
    const board = contest.scoreboard;

    if (board.audiences.length === 0) {
      lines.push({ group: "scoring", key: "scoreboardStaffOnly" });
    } else {
      const who = (options.audiences ?? ((list) => list.join(", ")))(board.audiences);

      const key =
        board.from === "start"
          ? "scoreboardFromStart"
          : board.from === "ownEnd"
            ? "scoreboardFromOwnEnd"
            : "scoreboardFromEnd";

      lines.push({ group: "scoring", key, values: { who } });
    }
  }

  const freeze = contest.freeze;
  const frozenAt = freezeTime(contest);

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

  const labels = contest.labels;

  if (labels.kind === "custom") {
    lines.push({ group: "scoring", key: "labelsCustom", values: { count: labels.labels.length } });
  }

  if (contest.runPretestsOnly) lines.push({ group: "scoring", key: "pretests" });

  /* --------------------------------------------------------------- rating -- */

  const rating = contest.rating;

  if (!rating) {
    lines.push({ group: "rating", key: "unrated" });

    return lines;
  }

  lines.push({ group: "rating", key: rating.everyone ? "ratedEveryone" : "ratedScorers" });

  if (rating.floor !== undefined || rating.ceiling !== undefined) {
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

  if (rating.performanceCeiling !== undefined) {
    lines.push({ group: "rating", key: "performanceCeiling", values: { at: rating.performanceCeiling } });
  }

  return lines;
}
