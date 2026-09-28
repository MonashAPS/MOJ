/** Represent wall-clock fields as UTC fields, so calendar arithmetic never uses
 * the server or browser's host timezone. This value is not an actual instant. */
export function zonedDate(ms: number, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(ms);

  const field = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);

  return new Date(
    Date.UTC(
      field("year"),
      field("month") - 1,
      field("day"),
      field("hour"),
      field("minute"),
      field("second"),
    ),
  );
}

/** Like a native Date constructor: choose the earlier repeated time at a DST
 * overlap, and advance through a nonexistent time at a DST gap. */
export function zonedTimestamp(wall: Date, timeZone: string): number {
  const target = wall.getTime();
  const day = 86400_000;

  const offsets = new Set(
    [-day, 0, day].map((delta) => {
      const probe = target + delta;

      return zonedDate(probe, timeZone).getTime() - probe;
    }),
  );

  const candidates = [...offsets].map((offset) => target - offset);
  const matches = candidates.filter((ms) => zonedDate(ms, timeZone).getTime() === target);

  return matches.length ? Math.min(...matches) : Math.max(...candidates);
}

/** Offset at the selected instant, including daylight-saving changes. */
export function utcOffset(ms: number, timeZone: string): string {
  const offset = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(ms)
    .find((part) => part.type === "timeZoneName")?.value;

  return offset === "GMT" ? "UTC+00:00" : (offset ?? "GMT").replace("GMT", "UTC");
}
