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

/** A problem's memory limit, stored in kilobytes. DMOJ's `kbsimpleformat`
 *  always prints megabytes, with a decimal only when the value is not exact. */
export function formatMemoryLimit(kilobytes: number): string {
  const megabytes = kilobytes / 1024;

  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

/** A problem's time limit, stored in seconds. */
export function formatSeconds(seconds: number): string {
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(2)}s`;
}

/** Points, trimmed of a trailing `.00` as DMOJ's `floatformat(-2)` is. */
export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** `1 submission` / `2 submissions`, per section 20 of the design. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString("en-AU")} ${count === 1 ? singular : pluralForm}`;
}

/** `#03`, the zero-padded index the design asks for. */
export function padIndex(index: number, width = 2): string {
  return `#${String(index).padStart(width, "0")}`;
}
