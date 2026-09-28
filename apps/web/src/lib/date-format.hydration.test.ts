// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalTime, RelativeTime } from "@/components/time/LocalTime";
import { CountdownProvider, useCountdownNow } from "./CountdownProvider";
import { DateFormatProvider, useDateFormatters, useRelativeTimeFormatter } from "./date-format";

function providers(child: ReactNode, timeZone: string | null = "UTC", initialNow = 60_000) {
  return createElement(
    CountdownProvider,
    { initialNow },
    createElement(DateFormatProvider, { initialTimeZone: timeZone, initialNow }, child),
  );
}

let root: Root | undefined;

let container: HTMLDivElement;

let browserTimeZone: string;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(60_000);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  browserTimeZone = "UTC";
  const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (
    this: Intl.DateTimeFormat,
  ) {
    return { ...resolvedOptions.call(this), timeZone: browserTimeZone };
  });
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  // biome-ignore lint/suspicious/noDocumentCookie: clear the cookie under test.
  document.cookie = "moj-timezone=; Path=/; Max-Age=0";
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function hydrate(tree: ReactNode) {
  const onRecoverableError = vi.fn();
  await act(async () => {
    root = hydrateRoot(container, tree, { onRecoverableError });
  });
  expect(onRecoverableError).not.toHaveBeenCalled();
}

describe("timestamp hydration and browser updates", () => {
  it.each([null, "America/Los_Angeles", "UTC"])(
    "hydrates with serialized timezone %s before following the browser",
    async (timeZone) => {
      const tree = providers(
        [
          createElement(LocalTime, { key: "local", value: 0, format: "date" }),
          createElement(RelativeTime, { key: "relative", value: 0 }),
        ],
        timeZone,
      );

      container.innerHTML = renderToString(tree);
      const originalTime = container.querySelector("time");
      expect(originalTime?.textContent).toBe(
        timeZone === null ? "—" : timeZone === "UTC" ? "1 Jan 1970" : "31 Dec 1969",
      );
      // The client clock advances while the server HTML is in transit.
      vi.setSystemTime(180_000);
      const consoleError = vi.spyOn(console, "error");
      await hydrate(tree);
      expect(consoleError).not.toHaveBeenCalled();
      expect(container.querySelector("time")).toBe(originalTime);
      expect(originalTime?.textContent).toBe("1 Jan 1970");
      expect(container.textContent).toContain("3 minutes ago");

      if (timeZone !== "UTC") expect(document.cookie).toContain("moj-timezone=UTC");

      browserTimeZone = "America/Los_Angeles";
      await act(async () => window.dispatchEvent(new Event("focus")));
      expect(originalTime?.textContent).toBe("31 Dec 1969");
      expect(document.cookie).toContain("moj-timezone=America/Los_Angeles");

      browserTimeZone = "UTC";
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      await act(async () => document.dispatchEvent(new Event("visibilitychange")));
      expect(originalTime?.textContent).toBe("1 Jan 1970");
      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  it("ticks relative labels each minute without rerendering absolute timestamps", async () => {
    const localRender = vi.fn();
    const countdownRender = vi.fn();
    const formatterRender = vi.fn();

    function Countdown() {
      const now = useCountdownNow();
      countdownRender();

      return createElement("span", null, now);
    }

    function AbsoluteTimestamp() {
      useDateFormatters();
      localRender();

      return createElement(LocalTime, { value: 0 });
    }

    function RelativeFormatter() {
      const format = useRelativeTimeFormatter();
      formatterRender();

      return createElement("span", null, format(0));
    }

    const tree = providers([
      createElement(RelativeTime, { key: "relative", value: 0 }),
      createElement(AbsoluteTimestamp, { key: "local" }),
      createElement(Countdown, { key: "countdown" }),
      createElement(RelativeFormatter, { key: "formatter" }),
    ]);

    container.innerHTML = renderToString(tree);
    await hydrate(tree);
    vi.clearAllMocks();

    for (let second = 0; second < 59; second++) {
      await act(async () => vi.advanceTimersByTime(1000));
    }

    expect(container.querySelector("time")?.textContent).toBe("1 minute ago");
    expect(countdownRender).toHaveBeenCalledTimes(59);
    expect(formatterRender).not.toHaveBeenCalled();
    expect(localRender).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(1000));
    expect(countdownRender).toHaveBeenCalledTimes(60);
    expect(formatterRender).toHaveBeenCalledTimes(1);
    expect(localRender).not.toHaveBeenCalled();
    expect(container.querySelector("time")?.textContent).toBe("2 minutes ago");

    await act(async () => root?.unmount());
    root = undefined;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("switches to an absolute date when a tick reaches the relative cutoff", async () => {
    const tree = providers(createElement(RelativeTime, { value: 0, relativeWithin: 120_000 }));
    container.innerHTML = renderToString(tree);
    await hydrate(tree);
    expect(container.textContent).toBe("1 minute ago");
    await act(async () => vi.advanceTimersByTime(60_000));
    await act(async () => {
      root?.render(
        providers(createElement(RelativeTime, { value: 0, relativeWithin: 120_000 }), "UTC", 180_000),
      );
    });
    expect(container.textContent).toBe("1 Jan 1970");
  });

  it("gives later mounts the same current reference as existing labels", async () => {
    const tree = providers([createElement(RelativeTime, { key: "existing", value: 0 })]);
    container.innerHTML = renderToString(tree);
    await hydrate(tree);
    const existingTime = container.querySelector("time");
    await act(async () => vi.advanceTimersByTime(600_000));
    await act(async () => {
      root?.render(
        providers([
          createElement(RelativeTime, { key: "existing", value: 0 }),
          createElement(RelativeTime, { key: "new", value: 660_000 }),
          createElement(RelativeTime, { key: "same", value: 0 }),
        ]),
      );
    });
    expect(container.querySelector("time")).toBe(existingTime);
    expect(Array.from(container.querySelectorAll("time"), (time) => time.textContent)).toEqual([
      "11 minutes ago",
      "now",
      "11 minutes ago",
    ]);
  });

  it.each(["focus", "visibilitychange"])("refreshes the shared clock on %s", async (event) => {
    const tree = providers(createElement(RelativeTime, { value: 0 }));
    container.innerHTML = renderToString(tree);
    await hydrate(tree);
    vi.setSystemTime(660_000);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      (event === "focus" ? window : document).dispatchEvent(new Event(event));
    });
    expect(container.textContent).toBe("11 minutes ago");
  });
});
