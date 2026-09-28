/* oxlint-disable anti-slop/no-module-mocking -- Render the real component against controlled Next/Convex hooks without running their servers; child chrome is stubbed to expose the selected contest. */
import type { ContestBarData } from "@convex/contests";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ShellState = {
  pathname: string;
  query: string;
  joined: ContestBarData;
  routed: ContestBarData;
  domjudge: boolean;
};

const state = vi.hoisted(
  (): ShellState => ({
    pathname: "/problem/alpha/",
    query: "contest=browsing",
    joined: null,
    routed: null,
    domjudge: false,
  }),
);

vi.mock("@convex/_generated/api", () => ({ api: { contests: { navBar: "bar", chrome: "chrome" } } }));

vi.mock("convex/react", () => ({
  useQuery: (query: string, args: "skip" | { key?: string }) =>
    args === "skip" ? undefined : query === "chrome" ? null : args.key ? state.routed : state.joined,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.query),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

vi.mock("@moj/ui", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  Toaster: () => null,
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/useViewerLive", () => ({ useViewerLive: (live: ContestBarData | undefined) => live }));

vi.mock("@/lib/skin", () => ({ usesDomjudgeStructure: () => state.domjudge }));

vi.mock("./SkinProvider", () => ({ useSkin: () => "test" }));

vi.mock("./CommandPalette", () => ({
  CommandPalette: () => null,
  useCommandPalette: () => [false, vi.fn()],
}));

vi.mock("./ContestBar", () => ({
  ContestBar: ({ data }: { data: NonNullable<ContestBarData> }) => `bar:${data.contest.key}`,
}));

vi.mock("./DomjudgeNav", () => ({
  DomjudgeNav: ({ contest }: { contest: { key: string } | null }) => `domjudge:${contest?.key ?? "global"}`,
}));

vi.mock("./ContestFloater", () => ({
  ContestFloater: ({ contestKey }: { contestKey: string }) => `floater:${contestKey}`,
}));

vi.mock("../auth/ProfileBootstrap", () => ({ ProfileBootstrap: () => null }));

vi.mock("./Announcement", () => ({ Announcement: () => null }));

vi.mock("./BackdropDrift", () => ({ BackdropDrift: () => null }));

vi.mock("./Footer", () => ({ Footer: () => null }));

vi.mock("./ImpersonationBar", () => ({ ImpersonationBar: () => null }));

vi.mock("./NavBar", () => ({ NavBar: () => null }));

vi.mock("./RouteProgress", () => ({ RouteProgress: () => null }));

vi.mock("./ShortcutLayer", () => ({ ShortcutLayer: () => null }));

import { SiteShell } from "./SiteShell";

function contest(key: string, lockedDown = false): NonNullable<ContestBarData> {
  // SAFETY: The shell reads only these fields; mocked child chrome does not consume the remaining contest payload.
  return {
    contest: { key, name: key, isLockedDown: lockedDown },
    problems: [{ code: "alpha", name: "Alpha", label: "A" }],
    links: { submissions: true },
  } as NonNullable<ContestBarData>;
}

function render() {
  return renderToStaticMarkup(
    <SiteShell nav={[]} misc={{}} viewer={null} registrationOpen={false} language="en">
      problem
    </SiteShell>,
  );
}

beforeEach(() => {
  state.pathname = "/problem/alpha/";
  state.query = "contest=browsing";
  state.joined = contest("joined");
  state.routed = contest("browsing");
});

for (const domjudge of [false, true]) {
  describe(domjudge ? "DOMjudge shell" : "standard shell", () => {
    beforeEach(() => {
      state.domjudge = domjudge;
    });
    const prefix = domjudge ? "domjudge" : "bar";

    it("restores URL context on a fresh load even when joined elsewhere", () => {
      expect(render()).toContain(`${prefix}:browsing`);
      expect(render()).not.toContain(`${prefix}:joined`);
    });

    it("shows browsing navigation without participation", () => {
      state.joined = null;
      expect(render()).toContain(`${prefix}:browsing`);
      expect(render()).not.toContain("floater");
    });

    it("keeps a bare problem standalone despite participation", () => {
      state.query = "";
      expect(render()).not.toContain(`${prefix}:joined`);
      expect(render()).toContain("floater");
    });

    it("uses participation data when it matches the explicit URL", () => {
      state.query = "contest=joined";
      state.routed = null;
      expect(render()).toContain(`${prefix}:joined`);
      expect(render()).not.toContain("floater");
    });

    it("keeps the joined floater when the problem fails contest validation", () => {
      state.pathname = "/problem/unrelated/";
      state.query = "contest=joined";
      const markup = render();
      expect(markup).not.toContain(`${prefix}:joined`);
      expect(markup).toContain("floater:joined");
    });

    it.each(["/contest/browsing/", "/problem/alpha/"])(
      "shows the joined floater alongside another contest's bar on %s",
      (pathname) => {
        state.pathname = pathname;
        expect(render()).toContain(`${prefix}:browsing`);
        expect(render()).toContain("floater:joined");
      },
    );

    it("hides the floater on the joined contest's own page", () => {
      state.pathname = "/contest/joined/";
      expect(render()).not.toContain("floater");
    });

    it("rejects inaccessible contests and unrelated problems", () => {
      state.routed = null;
      expect(render()).not.toContain(`${prefix}:browsing`);
      state.routed = contest("browsing");
      state.pathname = "/problem/unrelated/";
      expect(render()).not.toContain(`${prefix}:browsing`);
    });

    it("follows URL context even when the joined contest is locked down", () => {
      state.joined = contest("joined", true);
      expect(render()).toContain("floater:joined");
      expect(render()).toContain(`${prefix}:browsing`);
      expect(render()).not.toContain(`${prefix}:joined`);
    });
  });
}
