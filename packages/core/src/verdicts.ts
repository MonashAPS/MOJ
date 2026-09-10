/**
 * Result codes, their human names and their colour classes.
 *
 * Source: judge/models/submission.py (`SUBMISSION_RESULT`, `Submission.STATUS`,
 * `USER_DISPLAY_CODES`, `result_class_from_code`) and resources/status.scss.
 */

import type { SubmissionResult, SubmissionStatus } from './types.js';

/** `SUBMISSION_RESULT`, in DMOJ's declaration order. */
export const SUBMISSION_RESULTS: readonly SubmissionResult[] = [
  'AC',
  'WA',
  'TLE',
  'MLE',
  'OLE',
  'IR',
  'RTE',
  'CE',
  'IE',
  'SC',
  'AB',
];

/** `Submission.STATUS`, in DMOJ's declaration order. */
export const SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  'QU',
  'P',
  'G',
  'D',
  'IE',
  'CE',
  'AB',
];

/** `Submission.IN_PROGRESS_GRADING_STATUS`. */
export const IN_PROGRESS_GRADING_STATUS: readonly SubmissionStatus[] = ['QU', 'P', 'G'];

/** `SUBMISSION_RESULT`, as a code to name map. */
export const RESULT_NAMES: Readonly<Record<SubmissionResult, string>> = {
  AC: 'Accepted',
  WA: 'Wrong Answer',
  TLE: 'Time Limit Exceeded',
  MLE: 'Memory Limit Exceeded',
  OLE: 'Output Limit Exceeded',
  IR: 'Invalid Return',
  RTE: 'Runtime Error',
  CE: 'Compile Error',
  IE: 'Internal Error',
  SC: 'Short Circuited',
  AB: 'Aborted',
};

/** `Submission.USER_DISPLAY_CODES`: results plus the in-progress statuses. */
export const USER_DISPLAY_CODES: Readonly<Record<string, string>> = {
  AC: 'Accepted',
  WA: 'Wrong Answer',
  SC: 'Short Circuited',
  TLE: 'Time Limit Exceeded',
  MLE: 'Memory Limit Exceeded',
  OLE: 'Output Limit Exceeded',
  IR: 'Invalid Return',
  RTE: 'Runtime Error',
  CE: 'Compile Error',
  IE: 'Internal Error (judging server error)',
  QU: 'Queued',
  P: 'Processing',
  G: 'Grading',
  D: 'Completed',
  AB: 'Aborted',
};

/** DMOJ's CSS class for a verdict cell. `_AC` is a partial accept. */
export type ResultClass = SubmissionResult | SubmissionStatus | '_AC';

/** `Submission.result_class_from_code(result, case_points, case_total)`. */
export function resultClassFromCode(
  result: SubmissionResult | null | undefined,
  casePoints: number,
  caseTotal: number,
): ResultClass | null {
  if (result === 'AC') return casePoints === caseTotal ? 'AC' : '_AC';
  return result ?? null;
}

/** `Submission.result_class`. */
export function resultClass(submission: {
  readonly status: SubmissionStatus;
  readonly result?: SubmissionResult | null;
  readonly casePoints: number;
  readonly caseTotal: number;
}): ResultClass | null {
  if (submission.status === 'IE' || submission.status === 'CE') return submission.status;
  return resultClassFromCode(submission.result, submission.casePoints, submission.caseTotal);
}

/** `Submission.short_status`: the result if judged, else the status. */
export function shortStatus(submission: {
  readonly status: SubmissionStatus;
  readonly result?: SubmissionResult | null;
}): string {
  return submission.result ?? submission.status;
}

/** `Submission.long_status`. */
export function longStatus(submission: {
  readonly status: SubmissionStatus;
  readonly result?: SubmissionResult | null;
}): string {
  return USER_DISPLAY_CODES[shortStatus(submission)] ?? '';
}

/** `Submission.is_graded`. */
export function isGraded(submission: { readonly status: SubmissionStatus }): boolean {
  return !IN_PROGRESS_GRADING_STATUS.includes(submission.status);
}

/** `Submission.is_locked`. */
export function isLocked(
  submission: { readonly lockedAfter?: number | null },
  now: number = Date.now(),
): boolean {
  return submission.lockedAfter != null && submission.lockedAfter < now;
}

/**
 * Semantic colour tones, mapped to the verdict colours in
 * packages/ui/src/tokens.css (SPEC section 9): AC green, partial AC yellow-green,
 * WA red, TLE/MLE/CE/AB grey, OLE/IR/RTE amber, IE red, queued/grading neutral.
 */
export type VerdictTone =
  | 'accepted'
  | 'partial'
  | 'wrong'
  | 'neutral'
  | 'warning'
  | 'error'
  | 'pending';

const TONES: Readonly<Record<string, VerdictTone>> = {
  AC: 'accepted',
  _AC: 'partial',
  WA: 'wrong',
  TLE: 'neutral',
  MLE: 'neutral',
  CE: 'neutral',
  AB: 'neutral',
  OLE: 'warning',
  IR: 'warning',
  RTE: 'warning',
  SC: 'neutral',
  IE: 'error',
  QU: 'pending',
  P: 'pending',
  G: 'pending',
  D: 'neutral',
};

/** The tone for a verdict or status code (including `_AC`). */
export function verdictTone(code: string | null | undefined): VerdictTone {
  if (!code) return 'pending';
  return TONES[code] ?? 'neutral';
}

/** DMOJ's CSS class name for a verdict, e.g. `AC`, `_AC`, `TLE`. */
export function verdictClassName(code: ResultClass | null | undefined): string {
  return code ?? 'QU';
}

/** Human name for a verdict or status code. */
export function verdictName(code: string | null | undefined): string {
  if (!code) return USER_DISPLAY_CODES.QU as string;
  if (code === '_AC') return USER_DISPLAY_CODES.AC as string;
  return USER_DISPLAY_CODES[code] ?? '';
}
