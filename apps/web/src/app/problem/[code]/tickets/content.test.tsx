/* oxlint-disable anti-slop/no-module-mocking -- Exercise both route wrappers and their real access/redirect logic with controlled server responses. */
import { type FunctionReference, getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ contestAccessible: true }));

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`REDIRECT:${href}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

vi.mock("@/lib/language.server", () => ({ viewerLanguage: async () => "en" }));

vi.mock("@/lib/convex-server", () => ({
  queryAsViewer: async (query: FunctionReference<"query">) => {
    switch (getFunctionName(query)) {
      case "problems:get":
        return { code: "alpha", name: "Alpha" };
      case "viewer:current":
        return { profile: null };
      case "contests:navBar":
        return state.contestAccessible ? { problems: [{ code: "alpha" }] } : null;
      default:
        throw new Error(`Unexpected query: ${getFunctionName(query)}`);
    }
  },
}));

import ContestPage from "@/app/contest/[key]/problem/[code]/tickets/page";
import ProblemTicketsPage from "./content";
import StandalonePage from "./page";

beforeEach(() => {
  state.contestAccessible = true;
});

describe("ticket-list login return path", () => {
  it.each([false, true])("keeps the route and filters after login (contest=%s)", async (contextual) => {
    const props = {
      params: Promise.resolve({ key: "round1", code: "alpha" }),
      searchParams: Promise.resolve({ scope: "mine", open: "1", tag: ["a&b", "c"] }),
    };

    const page = contextual ? await ContestPage(props) : StandalonePage(props);
    expect(page.type).toBe(ProblemTicketsPage);
    const next = `${contextual ? "/contest/round1" : ""}/problem/alpha/tickets/?scope=mine&open=1&tag=a%26b&tag=c`;
    await expect(ProblemTicketsPage(page.props)).rejects.toThrow(
      `REDIRECT:/accounts/login/?next=${encodeURIComponent(next)}`,
    );
  });

  it("still rejects an inaccessible contest before the login redirect", async () => {
    state.contestAccessible = false;

    const page = await ContestPage({
      params: Promise.resolve({ key: "round1", code: "alpha" }),
      searchParams: Promise.resolve({}),
    });

    await expect(ProblemTicketsPage(page.props)).rejects.toThrow("NOT_FOUND");
  });
});
