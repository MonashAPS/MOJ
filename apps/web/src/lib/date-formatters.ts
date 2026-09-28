import { formatRelative } from "./format";

export const TIMEZONE_COOKIE = "moj-timezone";

export function validTimeZone(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat("en-AU", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** Never let the host machine choose the zone for rendered dates. */
export function createDateFormatters(timeZone: string | null, now: number) {
  const dateOptions: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  const date = timeZone ? new Intl.DateTimeFormat("en-AU", { ...dateOptions, timeZone }) : null;

  const dateTime = timeZone
    ? new Intl.DateTimeFormat("en-AU", { ...dateOptions, timeZone, hour: "2-digit", minute: "2-digit" })
    : null;

  const absolute = timeZone
    ? new Intl.DateTimeFormat("en-AU", {
        ...dateOptions,
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return {
    formatDate: (ms: number) => date?.format(ms) ?? "—",
    formatDateTime: (ms: number) => dateTime?.format(ms) ?? "—",
    absoluteTime: (ms: number) => absolute?.format(ms) ?? "—",
    formatRelative: (ms: number) => formatRelative(ms, now),
  };
}
