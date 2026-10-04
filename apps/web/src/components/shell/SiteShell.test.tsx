/* oxlint-disable anti-slop/no-module-mocking -- Render the real component against controlled Next/Convex hooks without running their servers; child chrome is stubbed to expose the selected contest. */
import type { ContestBarData } from "@convex/contests";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerSummary } from "./UserBlock";

type ShellState = {
  pathname: string;
  query: string;
  joined: ContestBarData;
  routed: ContestBarData;
  domjudge: boolean;
};

const state = vi.hoisted(
  (): ShellState => ({
    pathname: "/contest/browsing/problem/alpha/",
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
  ContestBar: ({ data, account }: { data: NonNullable<ContestBarData>; account?: ViewerSummary | null }) =>
    `bar:${data.contest.key}${account ? ` account:${account.username}` : ""}`,
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

vi.mock("./NavBar", () => ({ NavBar: () => "global-nav" }));

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

function render(viewer: ViewerSummary | null = null) {
  return renderToStaticMarkup(
    <SiteShell nav={[]} misc={{}} viewer={viewer} registrationOpen={false} language="en">
      problem
    </SiteShell>,
  );
}

beforeEach(() => {
  state.pathname = "/contest/browsing/problem/alpha/";
  state.query = "contest=browsing";
  state.joined = contest("joined");
  state.routed = contest("browsing");
});

describe("account pages during standard-shell lockdown", () => {
  const viewer: ViewerSummary = {
    username: "player",
    displayName: "Player",
    isStaff: false,
    ratingClass: "",
    siteTheme: "auto",
    gravatarUrl: "",
  };

  beforeEach(() => {
    state.domjudge = false;
    state.joined = contest("joined", true);
  });

  it.each(["/accounts/", "/accounts/password/change/", "/accounts/2fa/"])(
    "keeps the joined bar and account menu on %s",
    (pathname) => {
      state.pathname = pathname;
      const markup = render(viewer);
      expect(markup).toContain("bar:joined account:player");
      expect(markup).not.toContain("global-nav");
      expect(markup).not.toContain("floater");
      expect(markup).toContain("calc(3px + var(--contest-bar-height))");
    },
  );

  it.each(["/accounts-other/password/change/", "/problem/alpha/"])(
    "keeps standalone routes outside account context on %s",
    (pathname) => {
      state.pathname = pathname;
      const markup = render(viewer);
      expect(markup).not.toContain("bar:joined");
      expect(markup).not.toContain("global-nav");
      expect(markup).toContain("floater:joined");
    },
  );

  it("uses the normal navigation on account pages when lockdown is disabled", () => {
    state.pathname = "/accounts/password/change/";
    state.joined = contest("joined");
    const markup = render(viewer);
    expect(markup).toContain("global-nav");
    expect(markup).not.toContain("bar:joined");
    expect(markup).toContain("floater:joined");
  });
});

describe("account pages during DOMjudge lockdown", () => {
  beforeEach(() => {
    state.domjudge = true;
    state.joined = contest("joined", true);
  });

  it.each(["/accounts/", "/accounts/password/change/", "/accounts/2fa/"])(
    "keeps joined contest navigation on %s",
    (pathname) => {
      state.pathname = pathname;
      const markup = render();
      expect(markup).toContain("domjudge:joined");
      expect(markup).not.toContain("domjudge:global");
      expect(markup).not.toContain("floater");
    },
  );

  it("keeps account lookalikes outside the joined contest context", () => {
    state.pathname = "/accounts-other/password/change/";
    const markup = render();
    expect(markup).toContain("domjudge:global");
    expect(markup).toContain("floater:joined");
  });

  it("uses global navigation on account pages when lockdown is disabled", () => {
    state.pathname = "/accounts/password/change/";
    state.joined = contest("joined");
    const markup = render();
    expect(markup).toContain("domjudge:global");
    expect(markup).toContain("floater:joined");
  });
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
      state.pathname = "/problem/alpha/";
      state.query = "contest=browsing";
      expect(render()).not.toContain(`${prefix}:joined`);
      expect(render()).toContain("floater");
    });

    it("uses participation data when it matches the explicit URL", () => {
      state.pathname = "/contest/joined/problem/alpha/";
      state.routed = null;
      expect(render()).toContain(`${prefix}:joined`);
      expect(render()).not.toContain("floater");
    });

    it("keeps the joined floater when the problem fails contest validation", () => {
      state.pathname = "/contest/joined/problem/unrelated/";
      const markup = render();
      expect(markup).not.toContain(`${prefix}:joined`);
      expect(markup).toContain("floater:joined");
    });

    it.each(["/contest/browsing/", "/contest/browsing/problem/alpha/"])(
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
      state.pathname = "/contest/browsing/problem/unrelated/";
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
