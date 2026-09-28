import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalTime, RelativeTime } from "@/components/time/LocalTime";
import { DateFormatProvider, useDateFormatters, useRelativeTimeFormatter } from "./date-format";

function DateLabel() {
  const f = useDateFormatters();
  const formatRelative = useRelativeTimeFormatter();

  return createElement("time", { title: f.absoluteTime(0) }, `${f.formatDate(0)} / ${formatRelative(0)}`);
}

function render(timeZone: string | null, child: ReactNode = createElement(DateLabel), now = 60_000) {
  return renderToStaticMarkup(
    createElement(DateFormatProvider, { initialTimeZone: timeZone, initialNow: now }, child),
  );
}

describe("date hydration snapshot", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the serialized browser timezone and request clock", () => {
    const clock = vi.spyOn(Date, "now");
    expect(render("America/Los_Angeles")).toContain("31 Dec 1969 / 1 minute ago");
    expect(clock).not.toHaveBeenCalled();
  });

  it("keeps both first-visit labels and titles deterministic before effects run", () => {
    expect(render(null)).toBe('<time title="—">— / 1 minute ago</time>');
  });
});

describe("timestamp components", () => {
  it("renders a machine-readable timestamp with the cookie timezone", () => {
    const html = render("America/Los_Angeles", createElement(LocalTime, { value: 0, format: "date" }));
    expect(html).toContain('dateTime="1970-01-01T00:00:00.000Z"');
    expect(html).toContain(">31 Dec 1969</time>");
    expect(html).toContain('title="31 Dec 1969, 04:00 pm"');
  });

  it("uses a placeholder without a known timezone", () => {
    expect(render(null, createElement(LocalTime, { value: 0 }))).toContain('title="—">—</time>');
  });

  it("uses the initial reference time to choose relative labels or dates at the cutoff", () => {
    const label = createElement(RelativeTime, { value: 0, relativeWithin: 86_400_000 });
    expect(render("UTC", label)).toContain(">1 minute ago</time>");
    expect(render("UTC", label, 86_400_000)).toContain(">1 Jan 1970</time>");
  });
});
