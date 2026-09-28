import { describe, expect, it } from "vitest";
import { utcOffset, zonedDate, zonedTimestamp } from "./zoned-date";

describe("date picker UTC offset", () => {
  it.each([
    ["2026-09-28T00:00:00Z", "Australia/Melbourne", "UTC+10:00"],
    ["2026-12-28T00:00:00Z", "Australia/Melbourne", "UTC+11:00"],
    ["2026-10-03T15:59:00Z", "Australia/Melbourne", "UTC+10:00"],
    ["2026-10-03T16:00:00Z", "Australia/Melbourne", "UTC+11:00"],
    ["2026-01-01T00:00:00Z", "Asia/Kathmandu", "UTC+05:45"],
    ["2026-01-01T00:00:00Z", "America/New_York", "UTC-05:00"],
    ["2026-01-01T00:00:00Z", "UTC", "UTC+00:00"],
  ])("formats %s in %s as %s", (instant, timeZone, expected) => {
    expect(utcOffset(Date.parse(instant), timeZone)).toBe(expected);
  });
});

describe("date picker wall-clock conversion", () => {
  it("displays and saves in the browser timezone", () => {
    const instant = Date.parse("2026-01-01T00:00:00Z");
    const wall = zonedDate(instant, "Australia/Melbourne");
    expect(wall.toISOString()).toBe("2026-01-01T11:00:00.000Z");
    expect(zonedTimestamp(wall, "Australia/Melbourne")).toBe(instant);
  });

  it("handles fractional hour offsets and date boundaries", () => {
    const instant = Date.parse("2026-01-01T23:45:00Z");
    const wall = zonedDate(instant, "Asia/Kathmandu");
    expect(wall.toISOString()).toBe("2026-01-02T05:30:00.000Z");
    expect(zonedTimestamp(wall, "Asia/Kathmandu")).toBe(instant);
  });

  it("advances through a daylight-saving gap", () => {
    const instant = zonedTimestamp(new Date("2026-10-04T02:30:00Z"), "Australia/Melbourne");
    expect(new Date(instant).toISOString()).toBe("2026-10-03T16:30:00.000Z");
    expect(zonedDate(instant, "Australia/Melbourne").getUTCHours()).toBe(3);
  });

  it("chooses the earlier instant when the clocks repeat a time", () => {
    const instant = zonedTimestamp(new Date("2026-04-05T02:30:00Z"), "Australia/Melbourne");
    expect(new Date(instant).toISOString()).toBe("2026-04-04T15:30:00.000Z");
  });
});
