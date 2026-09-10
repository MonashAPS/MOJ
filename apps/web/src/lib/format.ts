const DATE_FORMAT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATETIME_FORMAT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(ms: number): string {
  return DATE_FORMAT.format(new Date(ms));
}

export function formatDateTime(ms: number): string {
  return DATETIME_FORMAT.format(new Date(ms));
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600_000],
  ["month", 30 * 24 * 3600_000],
  ["week", 7 * 24 * 3600_000],
  ["day", 24 * 3600_000],
  ["hour", 3600_000],
  ["minute", 60_000],
  ["second", 1000],
];

export function formatRelative(ms: number, now = Date.now()): string {
  const delta = ms - now;
  for (const [unit, size] of UNITS) {
    if (Math.abs(delta) >= size || unit === "second") {
      return RELATIVE.format(Math.round(delta / size), unit);
    }
  }
  return "just now";
}
