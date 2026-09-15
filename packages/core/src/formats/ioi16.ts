/**
 * `ioi16` — judge/contest_format/ioi.py (IOI 2016 onwards).
 *
 * Scores per *subtask*, not per submission: for every (problem, batch) pair the
 * best batch score across the participation's graded submissions counts, and
 * the problem's time is the latest of the times at which those best batch
 * scores were first reached.
 *
 * The raw SQL groups by `(contest problem, test case batch, submission)` and
 * takes `MIN(points)` inside a batch, so an unbatched submission collapses into
 * a single pseudo-batch keyed by `NULL` whose score is the *minimum* over all
 * of its cases. That is DMOJ's behaviour, quirk included.
 *
 * Only submissions with status `D` (completed) are considered: the SQL inner
 * joins the test cases onto `sub.status = 'D'`.
 */

import { participationStart } from "../contestTiming";
import type { ContestSubmissionRow, FormatData } from "../types";
import { pyRound } from "../util/number";
import type { ContestFormat, ParticipationUpdate, ScoringLine, UpdateParticipationInput } from "./base";
import {
  breakdown,
  buildParticipationResult,
  buildProblemCell,
  cumtimeSeconds,
  groupByProblem,
  numberLabel,
  orderedProblemGroups,
  pointsPrecision,
  secondsSince,
} from "./base";
import { resolveLegacyIoiConfig, validateLegacyIoiConfig } from "./legacyIoi";

export const IOI16_DEFAULTS = { cumtime: false } as const;

const NO_BATCH = "null";

function batchKey(batch: number | null | undefined): string {
  return batch === null || batch === undefined ? NO_BATCH : String(batch);
}

interface BestBatch {
  points: number;
  /** Earliest submission date that reached `points` on this batch. */
  date: number;
}

/** `MIN(tc.points)` per batch for one submission, as the inner `GROUP BY` does. */
function batchPointsOf(submission: ContestSubmissionRow): Map<string, number> {
  const perBatch = new Map<string, number>();

  for (const testCase of submission.testCases ?? []) {
    const key = batchKey(testCase.batch);
    const current = perBatch.get(key);
    perBatch.set(key, current === undefined ? testCase.points : Math.min(current, testCase.points));
  }

  return perBatch;
}

export function updateParticipationIoi16(input: UpdateParticipationInput): ParticipationUpdate {
  const { participation, submissions, contestProblems, contest } = input;
  const config = resolveLegacyIoiConfig(input.config ?? contest.formatConfig);
  const start = input.start ?? participationStart(participation, contest);

  let cumtime = 0;
  let score = 0;
  const formatData: FormatData = {};

  const groups = groupByProblem(submissions, participation.id);

  for (const [problemId, rows] of orderedProblemGroups(groups, contestProblems)) {
    const best = new Map<string, BestBatch>();

    for (const submission of rows) {
      if (submission.status !== "D") continue;

      for (const [key, points] of batchPointsOf(submission)) {
        const current = best.get(key);

        if (current === undefined || points > current.points) {
          best.set(key, { points, date: submission.date });
        } else if (points === current.points && submission.date < current.date) {
          current.date = submission.date;
        }
      }
    }

    if (best.size === 0) continue;

    let points = 0;
    let time = 0;

    for (const batch of best.values()) {
      const dt = config.cumtime ? secondsSince(start, batch.date) : 0;
      points += batch.points;
      time = Math.max(dt, time);
    }

    formatData[problemId] = { points, time };

    if (config.cumtime && points) cumtime += time;
    score += points;
  }

  return {
    cumtime: cumtimeSeconds(cumtime),
    score: pyRound(score, pointsPrecision(contest)),
    tiebreaker: 0,
    formatData,
  };
}

export const ioi16Format: ContestFormat = {
  name: "ioi16",
  displayName: "IOI",
  configDefaults: IOI16_DEFAULTS,
  defaultLabelScheme: "numbers",

  validate: validateLegacyIoiConfig,
  resolveConfig: (config) => resolveLegacyIoiConfig(config),

  updateParticipation: updateParticipationIoi16,

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
    const lines: ScoringLine[] = [{ key: "maxScoreBatch" }];
    lines.push({ key: resolved.cumtime ? "tiesByScoreAltering" : "tiesNotBroken" });

    return lines;
  },
};
