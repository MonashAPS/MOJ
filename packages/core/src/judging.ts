/**
 * Judging bookkeeping: the test-case status bitmask, the grading-end
 * aggregation, submission priorities and the claim rules.
 *
 * Source: judge/bridge/judge_handler.py (`on_test_case`, `on_grading_end`),
 * judge/bridge/judge_list.py (`_handle_free_judge`, `should_reserve_judge`,
 * `judge`), judge/bridge/judge_handler.py (`can_judge`) and
 * judge/judge_priority.py.
 */

import type { Id, SubmissionResult, SubmissionStatus, SubmissionTestCaseRow } from "./types";
import { pyRound } from "./util/number";

/* -------------------------------------------------------------------------- */
/* Test case status bitmask                                                   */
/* -------------------------------------------------------------------------- */

export const STATUS_BIT = {
  WA: 1,
  RTE: 2,
  TLE: 4,
  MLE: 8,
  IR: 16,
  SC: 32,
  OLE: 64,
} as const;

/**
 * `on_test_case` (judge_handler.py:512): decode the judge's status bitmask.
 *
 * The order is load-bearing: a case that is both TLE and WA reads as TLE.
 */
export function decodeCaseStatus(status: number): SubmissionResult {
  if (status & STATUS_BIT.TLE) return "TLE";

  if (status & STATUS_BIT.MLE) return "MLE";

  if (status & STATUS_BIT.OLE) return "OLE";

  if (status & STATUS_BIT.RTE) return "RTE";

  if (status & STATUS_BIT.IR) return "IR";

  if (status & STATUS_BIT.WA) return "WA";

  if (status & STATUS_BIT.SC) return "SC";

  return "AC";
}

/* -------------------------------------------------------------------------- */
/* Grading end                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The worst-first order `on_grading_end` uses to pick a submission's result.
 * A higher index wins, so `SC` is the mildest and `OLE` the worst.
 */
export const STATUS_CODES: readonly SubmissionResult[] = ["SC", "AC", "WA", "MLE", "TLE", "IR", "RTE", "OLE"];

/** How bad a verdict is: its place in `STATUS_CODES`, and -1 for one not listed. */
function severity(result: SubmissionResult): number {
  return STATUS_CODES.indexOf(result);
}

export interface GradingEndProblem {
  readonly points: number;
  readonly partial: boolean;
}

export interface GradingEndResult {
  readonly status: SubmissionStatus;
  readonly result: SubmissionResult;
  /** Sum of the case times, in seconds. */
  readonly time: number;
  /** Max case memory, in kilobytes. */
  readonly memory: number;
  readonly casePoints: number;
  readonly caseTotal: number;
  /** `Submission.points`, already zeroed for a non-partial near miss. */
  readonly points: number;
}

/**
 * `on_grading_end` (judge_handler.py:351).
 *
 * Unbatched cases add their points and totals directly; a batch contributes
 * `min(points)` and `max(total)` over its cases. Case points and totals are
 * rounded to one decimal, the awarded points to three, and a non-partial
 * problem awards nothing unless the score is exactly the problem's points.
 */
export function computeGradingEnd(
  testCases: readonly SubmissionTestCaseRow[],
  problem: GradingEndProblem,
): GradingEndResult {
  let time = 0;
  let memory = 0;
  let points = 0;
  let total = 0;
  let result: SubmissionResult = "SC";
  const batches = new Map<number, { points: number; total: number }>();

  for (const testCase of testCases) {
    time += testCase.time ?? 0;

    // DMOJ tests `if not case.batch`, so batch 0 counts as unbatched.
    if (!testCase.batch) {
      points += testCase.points;
      total += testCase.total;
    } else {
      const batch = batches.get(testCase.batch);

      if (batch) {
        batch.points = Math.min(batch.points, testCase.points);
        batch.total = Math.max(batch.total, testCase.total);
      } else {
        batches.set(testCase.batch, { points: testCase.points, total: testCase.total });
      }
    }

    memory = Math.max(memory, testCase.memory ?? 0);

    if (severity(testCase.status) > severity(result)) result = testCase.status;
  }

  for (const batch of batches.values()) {
    points += batch.points;
    total += batch.total;
  }

  points = pyRound(points, 1);
  total = pyRound(total, 1);

  let awarded = pyRound(total > 0 ? (points / total) * problem.points : 0, 3);

  if (!problem.partial && awarded !== problem.points) awarded = 0;

  return {
    status: "D",
    result,
    time,
    memory,
    casePoints: points,
    caseTotal: total,
    points: awarded,
  };
}

/**
 * `Submission.update_contest()` (judge/models/submission.py:179): the contest
 * submission's points, from the case points and the contest problem's value.
 */
export function computeContestSubmissionPoints(
  submission: { readonly casePoints: number; readonly caseTotal: number },
  contestProblem: { readonly points: number; readonly partial?: boolean },
): number {
  const points = pyRound(
    submission.caseTotal > 0 ? (submission.casePoints / submission.caseTotal) * contestProblem.points : 0,
    3,
  );

  if (!contestProblem.partial && points !== contestProblem.points) return 0;

  return points;
}

/* -------------------------------------------------------------------------- */
/* Priorities                                                                 */
/* -------------------------------------------------------------------------- */

/** judge/judge_priority.py. */
export const CONTEST_SUBMISSION_PRIORITY = 0;

export const DEFAULT_PRIORITY = 1;

export const REJUDGE_PRIORITY = 2;

export const BATCH_REJUDGE_PRIORITY = 3;

/** `JudgeList.priorities`. */
export const PRIORITY_COUNT = 4;

export interface PriorityInput {
  /** The submission belongs to a contest participation. */
  readonly inContest?: boolean;
  readonly rejudge?: boolean;
  readonly batchRejudge?: boolean;
}

/** `judge_submission` (judge/judgeapi.py:53) choosing a queue priority. */
export function submissionPriority(input: PriorityInput): number {
  if (input.batchRejudge) return BATCH_REJUDGE_PRIORITY;

  if (input.rejudge) return REJUDGE_PRIORITY;

  return input.inContest ? CONTEST_SUBMISSION_PRIORITY : DEFAULT_PRIORITY;
}

/** `JudgeList.check_priority`. */
export function isValidPriority(priority: number): boolean {
  return priority >= 0 && priority < PRIORITY_COUNT;
}

/* -------------------------------------------------------------------------- */
/* Claiming                                                                   */
/* -------------------------------------------------------------------------- */

export interface JudgeRow {
  readonly id: Id;
  readonly name: string;
  readonly tier: number;
  readonly online: boolean;
  readonly isDisabled?: boolean;
  readonly isBlocked?: boolean;
  /** Problem codes the judge has data for. */
  readonly problemCodes: readonly string[];
  /** Executor keys the judge can run. */
  readonly runtimeKeys: readonly string[];
  /** Set while the judge is grading something. */
  readonly currentSubmissionId?: Id | null;
}

export interface ClaimableSubmission {
  readonly id: Id;
  readonly problemCode: string;
  readonly languageKey: string;
  readonly priority: number;
  readonly date: number;
  readonly status: SubmissionStatus;
  /** Only this judge (by name) may take the submission. */
  readonly judgePin?: string | null;
  /**
   * The site holds a test data archive for this problem, so a judge that never
   * reported the code may grade it anyway: it fetches the archive first.
   */
  readonly siteHasData?: boolean;
}

/** A judge is working when it holds a submission. */
export function judgeIsWorking(judge: JudgeRow): boolean {
  return judge.currentSubmissionId !== null && judge.currentSubmissionId !== undefined;
}

/** Judges eligible to be counted for the tier calculation. */
function judgeIsAvailableForTier(judge: JudgeRow): boolean {
  return judge.online && !judge.isDisabled && !judge.isBlocked;
}

/** `JudgeList._update_min_tier`: the lowest tier among usable online judges. */
export function minimumOnlineTier(judges: readonly JudgeRow[]): number | null {
  let min: number | null = null;

  for (const judge of judges) {
    if (!judgeIsAvailableForTier(judge)) continue;

    if (min === null || judge.tier < min) min = judge.tier;
  }

  return min;
}

/** `JudgeList.current_tier_judges`. */
export function currentTierJudges(judges: readonly JudgeRow[], minTier: number | null): JudgeRow[] {
  if (minTier === null) return [];

  return judges.filter((judge) => judge.tier === minTier && !judge.isDisabled && judge.online);
}

/**
 * `JudgeList.should_reserve_judge`: with more than one judge in the tier and at
 * most one of them free, keep that one free for interactive submissions.
 */
export function shouldReserveJudge(judges: readonly JudgeRow[], minTier: number | null): boolean {
  const tierJudges = currentTierJudges(judges, minTier);

  if (tierJudges.length <= 1) return false;
  const free = tierJudges.filter((judge) => !judgeIsWorking(judge)).length;

  return free <= 1;
}

/**
 * `JudgeHandler.can_judge(problem, executor, judge_id)` (judge_handler.py:181),
 * with one addition: a judge that never reported the problem code still
 * qualifies when the site holds the data, because the claim carries the hash
 * and the judge downloads the archive before grading.
 */
export function judgeCanJudge(
  judge: JudgeRow,
  problemCode: string,
  languageKey: string,
  judgePin?: string | null,
  siteHasData = false,
): boolean {
  if (!siteHasData && !judge.problemCodes.includes(problemCode)) return false;

  if (!judge.runtimeKeys.includes(languageKey)) return false;

  if (judgePin) return judge.name === judgePin;

  return !judge.isDisabled;
}

/** The queue order: priority ascending, then oldest first. */
export function compareQueued(a: ClaimableSubmission, b: ClaimableSubmission): number {
  if (a.priority !== b.priority) return a.priority - b.priority;

  if (a.date !== b.date) return a.date - b.date;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The submission a free judge should claim next, or null.
 *
 * Combines `JudgeList._handle_free_judge` with the reservation rule from
 * `JudgeList.judge`: a judge outside the minimum online tier never claims, a
 * blocked or offline judge never claims, and while a judge must be kept free
 * the scan stops at the first rejudge-priority entry rather than skipping past
 * it (which is what DMOJ's priority-marker walk does).
 */
export function selectClaim(
  judge: JudgeRow,
  queue: readonly ClaimableSubmission[],
  judges: readonly JudgeRow[],
): ClaimableSubmission | null {
  if (!judge.online || judge.isBlocked) return null;

  const minTier = minimumOnlineTier(judges);

  if (minTier === null || judge.tier > minTier) return null;

  const reserve = shouldReserveJudge(judges, minTier);
  const candidates = queue.filter((submission) => submission.status === "QU").sort(compareQueued);

  for (const submission of candidates) {
    if (submission.priority >= REJUDGE_PRIORITY && reserve) return null;

    if (
      !judgeCanJudge(
        judge,
        submission.problemCode,
        submission.languageKey,
        submission.judgePin,
        submission.siteHasData ?? false,
      )
    ) {
      continue;
    }

    return submission;
  }

  return null;
}

/** Whether one specific judge may take one specific submission right now. */
export function canClaim(
  judge: JudgeRow,
  submission: ClaimableSubmission,
  judges: readonly JudgeRow[],
): boolean {
  if (submission.status !== "QU") return false;

  return selectClaim(judge, [submission], judges)?.id === submission.id;
}
