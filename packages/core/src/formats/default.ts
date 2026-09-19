/**
 * `default` — judge/contest_format/default.py.
 *
 * Per problem: the maximum score of any contest submission, and the *latest*
 * submission date on that problem (not the date of the best submission).
 * Cumulative time is the sum of those times over problems with a non-zero
 * score.
 */

import { participationStart } from "../contestTiming";
import type { FormatData } from "../types";
import { pyRound } from "../util/number";
import type { ContestFormat, FormatConfigInput, ParticipationUpdate, UpdateParticipationInput } from "./base";
import {
  breakdown,
  buildParticipationResult,
  buildProblemCell,
  cumtimeSeconds,
  FormatConfigError,
  groupByProblem,
  isJsonObject,
  orderedProblemGroups,
  pointsPrecision,
  secondsSince,
} from "./base";
import { attemptCount } from "./penalty";

export function validateDefaultConfig(config: FormatConfigInput): void {
  if (config === null || config === undefined) return;

  if (!isJsonObject(config) || Object.keys(config).length > 0) {
    throw new FormatConfigError("default contest expects no config or empty dict as config");
  }
}

export function updateParticipationDefault(input: UpdateParticipationInput): ParticipationUpdate {
  const { participation, submissions, contestProblems, contest } = input;
  const start = input.start ?? participationStart(participation, contest);

  let cumtime = 0;
  let points = 0;
  const formatData: FormatData = {};

  const groups = groupByProblem(submissions, participation.id);

  for (const [problemId, rows] of orderedProblemGroups(groups, contestProblems)) {
    // MAX(submission.date), MAX(contest submission points), grouped by problem.
    const time = Math.max(...rows.map((row) => row.date));
    const best = Math.max(...rows.map((row) => row.contestPoints));

    const dt = secondsSince(start, time);

    if (best) cumtime += dt;

    // The earliest submission that reached the best score is the one the cell
    // counts up to; without one, every attempt counts.
    const solvedAt = best
      ? Math.min(...rows.filter((row) => row.contestPoints === best).map((row) => row.date))
      : null;

    formatData[problemId] = { time: dt, points: best, attempts: attemptCount(rows, solvedAt) };
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
  name: "default",
  displayName: "Default",
  configDefaults: {},

  validate: validateDefaultConfig,
  resolveConfig(config) {
    validateDefaultConfig(config);

    return {};
  },

  updateParticipation: updateParticipationDefault,

  displayUserProblem(participation, contestProblem, contest) {
    const entry = participation.formatData?.[contestProblem.id];

    if (!entry) return null;

    return buildProblemCell(entry, contestProblem, contest);
  },

  displayParticipationResult(participation, contest) {
    return buildParticipationResult(participation, contest, true);
  },

  getProblemBreakdown: breakdown,

  getShortFormDisplay() {
    return [{ key: "maxScoreSubmission" }, { key: "tiesByLastSubmission" }];
  },
};
