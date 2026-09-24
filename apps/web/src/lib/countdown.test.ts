import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CountdownProvider } from "./CountdownProvider";
import { useCountdown } from "./countdown";

function Remaining({ endsAt }: { endsAt: number }) {
  const remaining = useCountdown(endsAt);

  return createElement("span", null, remaining ?? "empty");
}

describe("useCountdown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the serialized request time without reading the rendering clock", () => {
    const clock = vi.spyOn(Date, "now");

    const markup = renderToStaticMarkup(
      createElement(CountdownProvider, { initialNow: 2_000 }, createElement(Remaining, { endsAt: 5_000 })),
    );

    expect(markup).toBe("<span>3000</span>");
    expect(clock).not.toHaveBeenCalled();
  });

  it("renders a deterministic empty state outside the provider", () => {
    expect(renderToStaticMarkup(createElement(Remaining, { endsAt: 5_000 }))).toBe("<span>empty</span>");
  });
});
