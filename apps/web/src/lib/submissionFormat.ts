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

/** DMOJ prints a score as `case_points / case_total`, both rounded to whole points. */
export function formatScore(points: number, total: number): { earned: string; total: string } {
  return { earned: floatformat(points, 0), total: floatformat(total, 0) };
}

/** `roundfloat(points, 3)` — a contest or problem point value. */
export function formatPoints(points: number | null | undefined): string {
  if (points === null || points === undefined) return DASH;
  return floatformat(points, -3);
}

/** `1 submission` / `2 submissions`: every count is pluralised. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-AU")} ${count === 1 ? one : many}`;
}

const ABSOLUTE = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

/** The `title` behind every relative time, and the status page's date line. */
export function absoluteTime(ms: number): string {
  return ABSOLUTE.format(new Date(ms));
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600_000],
  ["month", 30 * 24 * 3600_000],
  ["week", 7 * 24 * 3600_000],
  ["day", 24 * 3600_000],
  ["hour", 3600_000],
  ["minute", 60_000],
];

/** DMOJ's `relative_time`, with an absolute `title` alongside it. */
export function relativeTime(ms: number, now: number): string {
  const delta = ms - now;
  for (const [unit, size] of STEPS) {
    if (Math.abs(delta) >= size) return RELATIVE.format(Math.round(delta / size), unit);
  }
  return RELATIVE.format(Math.round(delta / 1000), "second");
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

/** `Submission.short_status`: the text inside the pill. */
export function verdictLabel(code: string): string {
  return code === "_AC" ? "AC" : code;
}

/** `Submission.is_graded`: `QU`, `P` and `G` are still in flight. */
export function isGrading(status: string): boolean {
  return status === "QU" || status === "P" || status === "G";
}
