/**
 * `default` — judge/contest_format/default.py.
 *
 * Per problem: the maximum score of any contest submission, and the *latest*
 * submission date on that problem (not the date of the best submission).
 * Cumulative time is the sum of those times over problems with a non-zero
 * score.
 */

import type { ContestFormat, ParticipationUpdate, UpdateParticipationInput } from './base.js';
import {
  breakdown,
  buildParticipationResult,
  buildProblemCell,
  cumtimeSeconds,
  FormatConfigError,
  groupByProblem,
  numberLabel,
  orderedProblemIds,
  pointsPrecision,
  secondsSince,
} from './base.js';
import { participationStart } from '../contestTiming.js';
import { pyRound } from '../util/number.js';
import type { FormatData } from '../types.js';

export function validateDefaultConfig(config: unknown): void {
  if (config === null || config === undefined) return;
  const isEmptyDict =
    typeof config === 'object' && !Array.isArray(config) && Object.keys(config).length === 0;
  if (!isEmptyDict) {
    throw new FormatConfigError('default contest expects no config or empty dict as config');
  }
}

export function updateParticipationDefault(input: UpdateParticipationInput): ParticipationUpdate {
  const { participation, submissions, contestProblems, contest } = input;
  const start = input.start ?? participationStart(participation, contest);

  let cumtime = 0;
  let points = 0;
  const formatData: FormatData = {};

  const groups = groupByProblem(submissions, participation.id);
  for (const problemId of orderedProblemIds(groups, contestProblems)) {
    const rows = groups.get(problemId) as { date: number; contestPoints: number }[];
    // MAX(submission.date), MAX(contest submission points), grouped by problem.
    const time = Math.max(...rows.map((row) => row.date));
    const best = Math.max(...rows.map((row) => row.contestPoints));

    const dt = secondsSince(start, time);
    if (best) cumtime += dt;
    formatData[problemId] = { time: dt, points: best };
    points += best;
  }

  return {
    cumtime: cumtimeSeconds(cumtime),
    score: pyRound(points, pointsPrecision(contest)),
    tiebreaker: 0,
    formatData,
  };
}

export const defaultFormat: ContestFormat = {
  name: 'default',
  displayName: 'Default',
  configDefaults: {},
  defaultLabelScheme: 'numbers',

  validate: validateDefaultConfig,
  resolveConfig(config) {
    validateDefaultConfig(config);
    return {};
  },

  updateParticipation: updateParticipationDefault,

  displayUserProblem(participation, contestProblem, contest) {
    const entry = (participation.formatData ?? {})[contestProblem.id];
    if (!entry) return null;
    return buildProblemCell(entry, contestProblem, contest);
  },

  displayParticipationResult(participation, contest) {
    return buildParticipationResult(participation, contest, true);
  },

  getProblemBreakdown: breakdown,
  getLabelForProblem: numberLabel,

  getShortFormDisplay() {
    return [
      'The maximum score submission for each problem will be used.',
      'Ties will be broken by the sum of the last submission time on problems with a non-zero score.',
    ];
  },
};
