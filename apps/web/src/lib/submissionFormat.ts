// `@moj/core`'s barrel re-exports with `export *` across `.js` specifiers, which
// Turbopack does not follow; the subpath export map resolves straight to the file.
import { floatformat } from "@moj/core/util/number";

/** A missing value is an em-dash, never `---` (DESIGN.md section 12.2). */
export const DASH = "—";

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

const SIZE_DECIMALS = [0, 2, 2, 2, 2, 2] as const;

/** `kbdetailformat` (judge/jinja2/filesize.py:32): kilobytes to `1.78 MB`. */
export function formatMemory(kb: number | null | undefined): string {
  if (kb === null || kb === undefined) return DASH;
  let bytes = kb * 1024;
  let step = 0;

  while (bytes >= 1024 && step < SIZE_UNITS.length - 1) {
    bytes /= 1024;
    step += 1;
  }

  return `${floatformat(bytes, SIZE_DECIMALS[step])} ${SIZE_UNITS[step]}`;
}

/** `{{ time|floatformat(2) }}s`, the submission row's run time. */
export function formatTime(seconds: number | null | undefined, places = 2): string {
  if (seconds === null || seconds === undefined) return DASH;

  return `${floatformat(seconds, places)}s`;
}

export type FormattedScore = { earned: string; total: string };

/** DMOJ prints a score as `case_points / case_total`, both rounded to whole points. */
export function formatScore(points: number, total: number): FormattedScore {
  return { earned: floatformat(points, 0), total: floatformat(total, 0) };
}

/** `roundfloat(points, 3)` — a contest or problem point value. */
export function formatPoints(points: number | null | undefined): string {
  if (points === null || points === undefined) return DASH;

  return floatformat(points, -3);
}

/**
 * `Submission.result_class` (judge/models/submission.py): the code a verdict pill
 * is drawn from. `_AC` is a partial accept, which is a different colour family
 * from a full one, and `IE`/`CE` come off the status rather than the result.
 */
export function verdictCode(submission: {
  status: string;
  result: string | null;
  casePoints: number;
  caseTotal: number;
}): string {
  if (submission.status === "IE" || submission.status === "CE") return submission.status;

  if (submission.result === "AC") {
    return submission.casePoints >= submission.caseTotal ? "AC" : "_AC";
  }

  return submission.result ?? submission.status;
}

/** `Submission.is_graded`: `QU`, `P` and `G` are still in flight. */
export function isGrading(status: string): boolean {
  return status === "QU" || status === "P" || status === "G";
}
