/**
 * `atcoder` — judge/contest_format/atcoder.py.
 *
 * Score is the sum of per-problem maxima. Cumulative time is the *latest*
 * first-to-max time over solved problems, plus `penalty` minutes for every
 * rejected submission that preceded a solve.
 */

import { participationStart } from "../contestTiming";
import type { FormatData } from "../types";
import { pyRound } from "../util/number";
import type {
  ContestFormat,
  FormatConfigInput,
  FormatConfigValidators,
  ParticipationUpdate,
  ScoringLine,
  UpdateParticipationInput,
} from "./base";
import {
  breakdown,
  buildParticipationResult,
  buildProblemCell,
  cumtimeSeconds,
  groupByProblem,
  numberConfig,
  numberLabel,
  pointsPrecision,
  secondsSince,
  validateAgainstDefaults,
} from "./base";
import { computeMaxPointsRows } from "./penalty";

export const ATCODER_DEFAULTS = { penalty: 5 } as const;

const VALIDATORS: FormatConfigValidators = { penalty: (value) => Number(value) >= 0 };

export type AtcoderConfig = {
  /** Minutes added per rejected submission that preceded a solve. */
  readonly penalty: number;
};

export function validateAtcoderConfig(config: FormatConfigInput): void {
  validateAgainstDefaults(config, ATCODER_DEFAULTS, VALIDATORS, "AtCoder-styled contest");
}

export function resolveAtcoderConfig(config: FormatConfigInput): AtcoderConfig {
  validateAtcoderConfig(config);

  return { penalty: numberConfig(config, "penalty", ATCODER_DEFAULTS.penalty) };
}

export function updateParticipationAtcoder(input: UpdateParticipationInput): ParticipationUpdate {
  const { participation, submissions, contestProblems, contest } = input;
  const config = resolveAtcoderConfig(input.config ?? contest.formatConfig);
  const start = input.start ?? participationStart(participation, contest);

  let cumtime = 0;
  let penalty = 0;
  let points = 0;
  const formatData: FormatData = {};

  const groups = groupByProblem(submissions, participation.id);

  for (const row of computeMaxPointsRows(groups, contestProblems, config.penalty)) {
    const dt = secondsSince(start, row.time);

    if (config.penalty && row.points) {
      penalty += row.penaltyCount * config.penalty * 60;
    }

    if (row.points) cumtime = Math.max(cumtime, dt);

    formatData[row.problemId] = {
      time: dt,
      points: row.points,
      penalty: row.penaltyCount,
      attempts: row.attempts,
    };
    points += row.points;
  }

  return {
    cumtime: cumtimeSeconds(cumtime + penalty),
    score: pyRound(points, pointsPrecision(contest)),
    tiebreaker: 0,
    formatData,
  };
}

export const atcoderFormat: ContestFormat = {
  name: "atcoder",
  displayName: "AtCoder",
  configDefaults: ATCODER_DEFAULTS,
  defaultLabelScheme: "numbers",

  validate: validateAtcoderConfig,
  resolveConfig: (config) => resolveAtcoderConfig(config),

  updateParticipation: updateParticipationAtcoder,

  displayUserProblem(participation, contestProblem, contest) {
    const entry = participation.formatData?.[contestProblem.id];

    if (!entry) return null;

    return buildProblemCell(entry, contestProblem, contest, { penalty: true });
  },

  displayParticipationResult(participation, contest) {
    return buildParticipationResult(participation, contest, true);
  },

  getProblemBreakdown: breakdown,
  getLabelForProblem: numberLabel,

  getShortFormDisplay(config) {
    const { penalty } = resolveAtcoderConfig(config);
    const lines: ScoringLine[] = [{ key: "maxScoreSubmission" }];

    if (penalty) lines.push({ key: "penalty", values: { minutes: penalty } });
    lines.push({ key: "tiesByLastScoreAltering" });

    return lines;
  },
};
