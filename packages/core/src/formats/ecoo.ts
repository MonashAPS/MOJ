/**
 * `ecoo` — judge/contest_format/ecoo.py.
 *
 * Only the *last* non-IE/CE submission on each problem counts. A problem
 * solved in full on the very first such submission earns `first_ac_bonus`
 * extra points, and every whole `time_bonus` minutes left in the participation
 * window when it was submitted earns one more point.
 */

import type { ContestFormat, ParticipationUpdate, UpdateParticipationInput } from './base.js';
import {
  breakdown,
  buildParticipationResult,
  buildProblemCell,
  contestProblemPoints,
  groupByProblem,
  mergeConfig,
  numberLabel,
  orderedProblemIds,
  pointsPrecision,
  secondsSince,
  validateAgainstDefaults,
} from './base.js';
import { participationEndTime, participationStart } from '../contestTiming.js';
import { pyRound } from '../util/number.js';
import type { ContestSubmissionRow, FormatData } from '../types.js';

export const ECOO_DEFAULTS = { cumtime: false, first_ac_bonus: 10, time_bonus: 5 } as const;

const VALIDATORS = {
  cumtime: () => true,
  first_ac_bonus: (value: number) => value >= 0,
  time_bonus: (value: number) => value >= 0,
};

export type EcooConfig = {
  readonly cumtime: boolean;
  readonly firstAcBonus: number;
  readonly timeBonus: number;
};

export function validateEcooConfig(config: unknown): void {
  validateAgainstDefaults(config, ECOO_DEFAULTS, VALIDATORS, 'ECOO-styled contest');
}

export function resolveEcooConfig(config: unknown): EcooConfig {
  validateEcooConfig(config);
  const merged = mergeConfig(ECOO_DEFAULTS, config);
  return {
    cumtime: Boolean(merged.cumtime),
    firstAcBonus: Number(merged.first_ac_bonus),
    timeBonus: Number(merged.time_bonus),
  };
}

/** DMOJ's excluded verdicts: IE and CE only, a null result still counts. */
function counts(submission: ContestSubmissionRow): boolean {
  return submission.result !== 'IE' && submission.result !== 'CE';
}

export function updateParticipationEcoo(input: UpdateParticipationInput): ParticipationUpdate {
  const { participation, submissions, contestProblems, contest } = input;
  const config = resolveEcooConfig(input.config ?? contest.formatConfig);
  const start = input.start ?? participationStart(participation, contest);
  const endTime = input.endTime ?? participationEndTime(participation, contest);

  const formatData: FormatData = {};
  const groups = groupByProblem(submissions.filter(counts), participation.id);

  for (const problemId of orderedProblemIds(groups, contestProblems)) {
    const rows = groups.get(problemId) as ContestSubmissionRow[];
    const submissionCount = rows.length;

    // The latest submission date, then MAX(points) among submissions at it.
    const date = Math.max(...rows.map((row) => row.date));
    const points = Math.max(
      ...rows.filter((row) => row.date === date).map((row) => row.contestPoints),
    );
    const problemPoints = contestProblemPoints(contestProblems, problemId);

    const dt = secondsSince(start, date);

    let bonus = 0;
    if (points > 0) {
      if (submissionCount === 1 && points === problemPoints) bonus += config.firstAcBonus;
      if (config.timeBonus) {
        bonus += Math.floor(Math.floor((endTime - date) / 1000 / 60) / config.timeBonus);
      }
    }

    formatData[problemId] = { time: dt, points, bonus };
  }

  let cumtime = 0;
  let score = 0;
  for (const entry of Object.values(formatData)) {
    if (config.cumtime) cumtime += entry.time;
    score += entry.points + (entry.bonus ?? 0);
  }

  return {
    cumtime,
    score: pyRound(score, pointsPrecision(contest)),
    tiebreaker: 0,
    formatData,
  };
}

export const ecooFormat: ContestFormat = {
  name: 'ecoo',
  displayName: 'ECOO',
  configDefaults: ECOO_DEFAULTS,
  defaultLabelScheme: 'numbers',

  validate: validateEcooConfig,
  resolveConfig: (config) => resolveEcooConfig(config),

  updateParticipation: updateParticipationEcoo,

  displayUserProblem(participation, contestProblem, contest) {
    const entry = (participation.formatData ?? {})[contestProblem.id];
    if (!entry) return null;
    return buildProblemCell(entry, contestProblem, contest, { bonus: true });
  },

  displayParticipationResult(participation, contest, config) {
    const resolved = resolveEcooConfig(config ?? contest.formatConfig);
    return buildParticipationResult(participation, contest, resolved.cumtime);
  },

  getProblemBreakdown: breakdown,
  getLabelForProblem: numberLabel,

  getShortFormDisplay(config) {
    const resolved = resolveEcooConfig(config);
    const lines = ['The score on your **last** non-CE submission for each problem will be used.'];
    if (resolved.firstAcBonus) {
      lines.push(
        `There is a **${resolved.firstAcBonus} bonus** for fully solving on your first non-CE submission.`,
      );
    }
    if (resolved.timeBonus) {
      lines.push(
        `For every **${resolved.timeBonus} ${
          resolved.timeBonus === 1 ? 'minute' : 'minutes'
        }** you submit before the end of your window, there will be a **1** point bonus.`,
      );
    }
    lines.push(
      resolved.cumtime
        ? 'Ties will be broken by the sum of the last submission time on **all** problems.'
        : 'Ties by score will **not** be broken.',
    );
    return lines;
  },
};
