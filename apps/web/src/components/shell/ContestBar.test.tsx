import type { Id } from "@convex/_generated/dataModel";
import type { ContestBarData } from "@convex/contests";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CountdownProvider } from "@/lib/CountdownProvider";
import common from "../../../messages/en/common.json";
import { ContestBar } from "./ContestBar";

const START = Date.UTC(2026, 9, 3, 12);

const HOUR = 3_600_000;

function contest(overrides: Partial<NonNullable<ContestBarData>> = {}): NonNullable<ContestBarData> {
  return {
    contest: {
      // SAFETY: This opaque fixture ID is never sent to Convex or used in a lookup.
      _id: "contest" as Id<"contests">,
      key: "round1",
      name: "Round 1",
      startTime: START,
      endTime: START + HOUR,
      useClarifications: false,
      freeze: null,
      isLockedDown: false,
    },
    problems: [],
    showJoinWarning: false,
    participationId: null,
    endsAt: START + HOUR,
    isSpectating: false,
    isVirtual: false,
    links: { standings: false, submissions: false, clarifications: false },
    now: START - 15 * 60_000,
    timeRemaining: HOUR + 15 * 60_000,
    ...overrides,
  };
}

function renderAt(now: number, data = contest()) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={{ common }} timeZone="UTC">
      <CountdownProvider initialNow={now}>
        <ContestBar data={data} />
      </CountdownProvider>
    </NextIntlClientProvider>,
  );
}

describe("the contest bar timer", () => {
  it("counts down to the start before the contest begins", () => {
    const markup = renderAt(START - 15 * 60_000);
    expect(markup).toContain("Starts in 00:15:00");
    expect(markup).not.toContain("01:15:00");
  });

  it("switches to remaining contest time at the start using the live clock", () => {
    // The query snapshot still describes an upcoming contest at this boundary.
    expect(renderAt(START - 1_000)).toContain("Starts in 00:00:01");
    const markup = renderAt(START);
    expect(markup).not.toContain("Starts in");
    expect(markup).toContain("01:00:00");
    expect(renderAt(START + 15 * 60_000)).toContain("00:45:00");
  });

  it("shows ended when the contest clock runs out", () => {
    expect(renderAt(START + HOUR)).toContain(">ended</span>");
  });

  it("keeps the participant's personal deadline for a virtual run", () => {
    const markup = renderAt(START + 2 * HOUR, contest({ isVirtual: true, endsAt: START + 3 * HOUR }));
    expect(markup).toContain("01:00:00");
    expect(markup).not.toContain(">ended</span>");
  });

  it("shows a start countdown even if the eventual end is open-ended", () => {
    const data = contest({ endsAt: START + 200 * 24 * HOUR });
    expect(renderAt(START - 15 * 60_000, data)).toContain("Starts in 00:15:00");
    expect(renderAt(START, data)).toContain(">open</span>");
  });

  it("keeps spectators on their spectating status without a countdown", () => {
    const markup = renderAt(START - 15 * 60_000, contest({ isSpectating: true }));
    expect(markup).toContain(">spectating</span>");
    expect(markup).not.toContain("Starts in");
    expect(markup).not.toContain("01:15:00");
  });
});
