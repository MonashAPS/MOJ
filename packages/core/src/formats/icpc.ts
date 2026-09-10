/**
 * `icpc` — judge/contest_format/icpc.py.
 *
 * Score is the sum of per-problem maxima (one point per problem in a
 * pass/fail contest). `cumtime` is the ICPC penalty: the sum of the solve
 * times over solved problems plus `penalty` minutes per rejected submission
 * before each solve. `tiebreaker` is the last solve time, sorted ascending.
 */

import { participationStart } from "../contestTiming";
import type { FormatData } from "../types";
import { pyRound } from "../util/number";
import type { ContestFormat, ParticipationUpdate, UpdateParticipationInput } from "./base";
import {
  breakdown,
  buildParticipationResult,
  buildProblemCell,
  cumtimeSeconds,
  groupByProblem,
  letterLabel,
  mergeConfig,
  pointsPrecision,
  secondsSince,
  validateAgainstDefaults,
} from "./base";
import { computeMaxPointsRows } from "./penalty";

export const ICPC_DEFAULTS = { penalty: 20 } as const;

const VALIDATORS = { penalty: (value: number) => value >= 0 };

export function validateIcpcConfig(config: unknown): void {
  validateAgainstDefaults(config, ICPC_DEFAULTS, VALIDATORS, "ICPC-styled contest");
}

export function resolveIcpcConfig(config: unknown): { penalty: number } {
  validateIcpcConfig(config);
  const merged = mergeConfig(ICPC_DEFAULTS, config);
  return { penalty: Number(merged.penalty) };
}

export function updateParticipationIcpc(input: UpdateParticipationInput): ParticipationUpdate {
  const { participation, submissions, contestProblems, contest } = input;
  const config = resolveIcpcConfig(input.config ?? contest.formatConfig);
  const start = input.start ?? participationStart(participation, contest);

  let cumtime = 0;
  let last = 0;
  let penalty = 0;
  let score = 0;
  const formatData: FormatData = {};

  const groups = groupByProblem(submissions, participation.id);
  for (const row of computeMaxPointsRows(groups, contestProblems, config.penalty)) {
    const dt = secondsSince(start, row.time);

    if (config.penalty && row.points) {
      penalty += row.penaltyCount * config.penalty * 60;
    }
    if (row.points) {
      cumtime += dt;
      last = Math.max(last, dt);
    }

    formatData[row.problemId] = { time: dt, points: row.points, penalty: row.penaltyCount };
    score += row.points;
  }

  return {
    cumtime: cumtimeSeconds(cumtime + penalty),
    score: pyRound(score, pointsPrecision(contest)),
    tiebreaker: last,
    formatData,
  };
}

export const icpcFormat: ContestFormat = {
  name: "icpc",
  displayName: "ICPC",
  configDefaults: ICPC_DEFAULTS,
  defaultLabelScheme: "letters",

  validate: validateIcpcConfig,
  resolveConfig: (config) => resolveIcpcConfig(config),

  updateParticipation: updateParticipationIcpc,

  displayUserProblem(participation, contestProblem, contest) {
    const entry = participation.formatData?.[contestProblem.id];
    if (!entry) return null;
    return buildProblemCell(entry, contestProblem, contest, { penalty: true });
  },

  displayParticipationResult(participation, contest) {
    return buildParticipationResult(participation, contest, true);
  },

  getProblemBreakdown: breakdown,
  getLabelForProblem: letterLabel,

  getShortFormDisplay(config) {
    const { penalty } = resolveIcpcConfig(config);
    const lines = ["The maximum score submission for each problem will be used."];
    if (penalty) {
      lines.push(
        `Each submission before the first maximum score submission will incur a **penalty of ${penalty} ${
          penalty === 1 ? "minute" : "minutes"
        }**.`,
      );
    }
    lines.push(
      "Ties will be broken by the sum of the last score altering submission time on problems with a non-zero score, followed by the time of the last score altering submission.",
    );
    return lines;
  },
};
