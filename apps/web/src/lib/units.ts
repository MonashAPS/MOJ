/** The judge's units, formatted the way DMOJ prints them. */

/** Seconds to `0.06s`. A missing time is an em-dash, never `---`. */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";

  return `${seconds.toFixed(2)}s`;
}

/** Kilobytes to `1.9 MB`, as DMOJ's `kbdetails` filter does. */
export function formatMemory(kilobytes: number | null | undefined): string {
  if (kilobytes === null || kilobytes === undefined) return "—";

  if (kilobytes < 1024) return `${Math.round(kilobytes)} KB`;
  const megabytes = kilobytes / 1024;

  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

/** Points, trimmed of a trailing `.00` as DMOJ's `floatformat(-2)` is. */
export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
