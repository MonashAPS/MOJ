/**
 * `ioi` — judge/contest_format/legacy_ioi.py (IOI pre-2016).
 *
 * Per problem: the maximum score, and the *earliest* submission that reached
 * it. Times only count when `cumtime` is on; otherwise every time is stored as
 * zero and ties are not broken.
 */

import { participationStart } from "../contestTiming";
import type { FormatData } from "../types";
import { pyRound } from "../util/number";
import type { ContestFormat, ParticipationUpdate, ScoringLine, UpdateParticipationInput } from "./base";
import {
  breakdown,
  buildParticipationResult,
  buildProblemCell,
  cumtimeSeconds,
  groupByProblem,
  mergeConfig,
  numberLabel,
  orderedProblemIds,
  pointsPrecision,
  secondsSince,
  validateAgainstDefaults,
} from "./base";

export const LEGACY_IOI_DEFAULTS = { cumtime: false } as const;

export function validateLegacyIoiConfig(config: unknown): void {
  validateAgainstDefaults(config, LEGACY_IOI_DEFAULTS, {}, "IOI-styled contest");
}

export function resolveLegacyIoiConfig(config: unknown): { cumtime: boolean } {
  validateLegacyIoiConfig(config);
  const merged = mergeConfig(LEGACY_IOI_DEFAULTS, config);
  return { cumtime: Boolean(merged.cumtime) };
}

export function updateParticipationLegacyIoi(input: UpdateParticipationInput): ParticipationUpdate {
  const { participation, submissions, contestProblems, contest } = input;
  const config = resolveLegacyIoiConfig(input.config ?? contest.formatConfig);
  const start = input.start ?? participationStart(participation, contest);

  let cumtime = 0;
  let score = 0;
  const formatData: FormatData = {};

  const groups = groupByProblem(submissions, participation.id);
  for (const problemId of orderedProblemIds(groups, contestProblems)) {
    const rows = groups.get(problemId) as { date: number; contestPoints: number }[];
    const points = Math.max(...rows.map((row) => row.contestPoints));
    // MIN(date) among the submissions that scored the maximum.
    const time = Math.min(...rows.filter((row) => row.contestPoints === points).map((row) => row.date));

    let dt = 0;
    if (config.cumtime) {
      dt = secondsSince(start, time);
      if (points) cumtime += dt;
    }

    formatData[problemId] = { points, time: dt };
    score += points;
  }

  return {
    cumtime: cumtimeSeconds(cumtime),
    score: pyRound(score, pointsPrecision(contest)),
    tiebreaker: 0,
    formatData,
  };
}

export const legacyIoiFormat: ContestFormat = {
  name: "ioi",
  displayName: "IOI (pre-2016)",
  configDefaults: LEGACY_IOI_DEFAULTS,
  defaultLabelScheme: "numbers",

  validate: validateLegacyIoiConfig,
  resolveConfig: (config) => resolveLegacyIoiConfig(config),

  updateParticipation: updateParticipationLegacyIoi,

  displayUserProblem(participation, contestProblem, contest, config) {
    const entry = participation.formatData?.[contestProblem.id];
    if (!entry) return null;
    const resolved = resolveLegacyIoiConfig(config ?? contest.formatConfig);
    return buildProblemCell(entry, contestProblem, contest, { showTime: resolved.cumtime });
  },

  displayParticipationResult(participation, contest, config) {
    const resolved = resolveLegacyIoiConfig(config ?? contest.formatConfig);
    return buildParticipationResult(participation, contest, resolved.cumtime);
  },

  getProblemBreakdown: breakdown,
  getLabelForProblem: numberLabel,

  getShortFormDisplay(config) {
    const resolved = resolveLegacyIoiConfig(config);
    const lines: ScoringLine[] = [{ key: "maxScoreSubmission" }];
    lines.push({ key: resolved.cumtime ? "tiesByScoreAltering" : "tiesNotBroken" });
    return lines;
  },
};
