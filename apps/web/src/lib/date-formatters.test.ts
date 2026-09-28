import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createDateFormatters, validTimeZone } from "./date-formatters";

const now = Date.parse("2026-01-01T00:00:00Z");

describe("viewer date formatting", () => {
  it("uses the viewer's calendar date, including across year boundaries", () => {
    expect(createDateFormatters("Australia/Melbourne", now).formatDate(now)).toBe("1 Jan 2026");
    expect(createDateFormatters("America/Los_Angeles", now).formatDate(now)).toBe("31 Dec 2025");
  });

  it("follows daylight saving changes in the selected timezone", () => {
    const f = createDateFormatters("Australia/Melbourne", now);
    expect(f.formatDateTime(Date.parse("2026-10-03T15:59:00Z"))).toContain("01:59");
    expect(f.formatDateTime(Date.parse("2026-10-03T16:00:00Z"))).toContain("03:00");
  });

  it("renders placeholders until the browser's timezone is known", () => {
    const f = createDateFormatters(null, now);
    expect([f.formatDate(now), f.formatDateTime(now), f.absoluteTime(now)]).toEqual(["—", "—", "—"]);
    expect(f.formatRelative(now - 60_000)).toBe("1 minute ago");
  });

  it("rejects invalid cookie timezones", () => {
    expect(validTimeZone("not/a-zone")).toBeNull();
    expect(validTimeZone("")).toBeNull();
    expect(validTimeZone(undefined)).toBeNull();
    expect(validTimeZone("Australia/Melbourne")).toBe("Australia/Melbourne");
  });

  it("produces identical text in server and browser host timezones", () => {
    const moduleUrl = new URL("./date-formatters.ts", import.meta.url).href;

    const script = `
      import { createDateFormatters } from ${JSON.stringify(moduleUrl)};
      const now = ${now};
      const f = createDateFormatters("Australia/Melbourne", now);
      console.log(JSON.stringify([f.formatDate(now), f.formatDateTime(now), f.absoluteTime(now), f.formatRelative(now - 60000)]));
    `;

    const render = (TZ: string) =>
      execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
        env: { ...process.env, TZ },
        encoding: "utf8",
      });

    expect(render("America/Los_Angeles")).toBe(render("UTC"));
    expect(render("Australia/Melbourne")).toBe(render("UTC"));
  });
});
