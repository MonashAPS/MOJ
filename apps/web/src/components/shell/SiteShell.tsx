"use client";

import { api } from "@convex/_generated/api";
import type { ContestBarData } from "@convex/contests";
import { cn, Toaster, TooltipProvider } from "@moj/ui";
import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { ProfileBootstrap } from "@/components/auth/ProfileBootstrap";
import { CommandPalette, useCommandPalette } from "@/components/shell/CommandPalette";
import { contestContainsProblem, contestContextKey } from "@/lib/contest-context";
import { isInsideContest } from "@/lib/contest-lockdown";
import type { NavNode } from "@/lib/nav";
import { usesDomjudgeStructure } from "@/lib/skin";
import { useViewerLive } from "@/lib/useViewerLive";
import { Announcement } from "./Announcement";
import { BackdropDrift } from "./BackdropDrift";
import { ContestBar } from "./ContestBar";
import { ContestFloater } from "./ContestFloater";
import { DomjudgeNav } from "./DomjudgeNav";
import { Footer } from "./Footer";
import { ImpersonationBar } from "./ImpersonationBar";
import { NavBar } from "./NavBar";
import { RouteProgress } from "./RouteProgress";
import { ShortcutLayer } from "./ShortcutLayer";
import { useSkin } from "./SkinProvider";
import type { ViewerSummary } from "./UserBlock";

/** The hall scoreboard is a projector surface, not a page of the site: it draws
 *  its own chrome full-bleed and must not carry the nav, the footer or the
 *  content column (DESIGN.md section 16.2). The index at `/scoreboard/` is an
 *  ordinary page. */
function isHallScoreboard(pathname: string): boolean {
  return /^\/scoreboard\/.+/.test(pathname);
}

/** Proctoring is a thing you set up, not a page of the site: it draws its own
 *  chrome full-bleed over the club's backdrop, and the nav would only offer
 *  somewhere else to go at the moment we are asking for attention. */
function isProctor(pathname: string): boolean {
  return /^\/proctor(\/|$)/.test(pathname);
}

export function SiteShell({
  nav,
  misc,
  viewer,
  registrationOpen,
  language,
  logoUrl = null,
  siteName = "MAPS Online Judge",
  initialContest = null,
  children,
}: {
  nav: NavNode[];
  misc: Record<string, string>;
  viewer: ViewerSummary | null;
  registrationOpen: boolean;
  /** SPEC section 24: the operator's wordmark, when one is uploaded. */
  logoUrl?: string | null;
  siteName?: string;
  /** The contest the viewer is in, as the server knew it when it rendered. */
  initialContest?: ContestBarData;
  /** The viewer's `LANGUAGE_CODE`, read from the cookie by the layout. */
  language: string;
  children: ReactNode;
}) {
  const t = useTranslations("common.nav");
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const isHome = pathname === "/";
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const headerRef = useRef<HTMLElement | null>(null);

  /**
   * Two subscriptions, because they answer different questions.
   *
   * `joined` asks which contest the viewer is inside. Its arguments never change,
   * so it survives a navigation and the chrome does not blink: keying the only
   * query on the route meant every page change re-subscribed, and for the moment
   * that took, a locked-down contestant got the nav back.
   *
   * `routed` supplies browsing data when the URL names a different contest.
   * Browsing follows the URL; participation independently governs lockdown.
   */
  const routeKey = /^\/contest\/([a-z0-9._-]+)(?:\/|$)/i.exec(pathname)?.[1];
  const liveJoined = useQuery(api.contests.navBar, {});
  // The server already knew the answer when it rendered this page. Waiting for
  // the socket instead meant the markup went out with a nav on it, and a
  // locked-down contestant watched it be taken away again after hydration.
  //
  // And the first answer off the socket is not the member's: until Convex has
  // the identity it answers as nobody, which for this query is null — the nav
  // coming back for a beat in the middle of a contest.
  const joined = useViewerLive(liveJoined, initialContest, !!viewer);

  const searchParams = useSearchParams();
  const contextKey = contestContextKey(pathname, searchParams.get("contest"));
  const joinedMatches = !!joined && joined.contest.key === contextKey;

  const liveRouted = useQuery(
    api.contests.navBar,
    contextKey && !joinedMatches ? { key: contextKey, browsing: true } : "skip",
  );

  const routed = useViewerLive(liveRouted, undefined, !!viewer);
  const candidate = contextKey ? (joinedMatches ? joined : routed) : null;

  // navBar checks contest access; a query parameter cannot associate an
  // unrelated problem with that contest's navigation.
  const contest =
    candidate &&
    !contestContainsProblem(
      pathname,
      candidate.problems.map((p) => p.code),
    )
      ? null
      : candidate;

  const problemCode = /^\/problem\/([a-z0-9._-]+)(?:\/|$)/i.exec(pathname)?.[1];
  const onContestPage = !!contest && !!contextKey;

  /**
   * A locked-down contest takes the nav's place for as long as the viewer is
   * competing. Every nav destination is the site's own — the problems list, the
   * submissions list, the user list are never the contest's — so while the
   * contest is the point, the contest is the chrome, and its own pages are one
   * click away in the bar rather than two through a nav that led elsewhere.
   */
  const lockedDown = !!joined && joined.contest.isLockedDown;

  /**
   * The DOMjudge skin's structure depth replaces the nav rather than repainting
   * it: DOMjudge's bar is the contest's, and the site's own sections are not on
   * it while you are in one.
   */
  const asDomjudge = usesDomjudgeStructure(useSkin());
  const showContestPlaceholder = !asDomjudge && !!contextKey && contest === undefined;
  const showContestBar = !asDomjudge && (onContestPage || showContestPlaceholder);

  const headerHeight = asDomjudge
    ? "var(--nav-height)"
    : lockedDown
      ? showContestBar
        ? "calc(3px + var(--contest-bar-height))"
        : "3px"
      : showContestBar
        ? "calc(var(--nav-height) + 3px + var(--contest-bar-height))"
        : "calc(var(--nav-height) + 3px)";

  /**
   * DOMjudge can show the contest title while its full browsing bar loads.
   */
  const chrome = useQuery(
    api.contests.chrome,
    asDomjudge && routeKey && !contest ? { key: routeKey } : "skip",
  );

  const displayedContest = contest;

  const navContest = displayedContest
    ? {
        key: displayedContest.contest.key,
        name: displayedContest.contest.name,
        startTime: displayedContest.contest.startTime,
        endTime: displayedContest.contest.endTime,
        useClarifications: displayedContest.contest.useClarifications,
        endsAt: displayedContest.endsAt,
        ownSubmissions: displayedContest.links.submissions && !!viewer,
        problems: displayedContest.problems.map((problem) => ({
          code: problem.code,
          name: problem.name,
          label: problem.label,
        })),
      }
    : chrome
      ? { ...chrome, endsAt: null, ownSubmissions: false, problems: [] }
      : null;

  const strayFromContest =
    lockedDown &&
    !!joined &&
    !isInsideContest(
      pathname,
      joined.contest.key,
      joined.problems.map((problem) => problem.code),
    );

  useEffect(() => {
    if (strayFromContest && joined) router.replace(`/contest/${joined.contest.key}/`);
  }, [strayFromContest, joined, router]);

  /** The chrome publishes its own height so a sticky table header never has to
   *  guess. One ResizeObserver, writing a custom property, no React state. */
  useLayoutEffect(() => {
    const header = headerRef.current;

    if (!header) return;

    const publish = () => {
      document.documentElement.style.setProperty("--header-height", `${header.offsetHeight}px`);
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sticky-top",
      `calc(var(--header-height, var(--nav-height)) + var(--space-5))`,
    );
  }, []);

  if (isProctor(pathname)) {
    return (
      <TooltipProvider>
        <ProfileBootstrap />
        {/* The club's own backdrop, which is what stops a bare page reading as
            an error page. */}
        <div aria-hidden className="page-constellations" />
        <BackdropDrift />
        {children}
        <Toaster />
      </TooltipProvider>
    );
  }

  if (isHallScoreboard(pathname)) {
    return (
      <TooltipProvider>
        <ProfileBootstrap />
        {children}
        <Toaster />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <a className="skip-link" href="#content">
        {t("skipToContent")}
      </a>

      <header ref={headerRef} className="fixed inset-x-0 top-0 z-(--z-nav)">
        {/* DOMjudge has one bar, and it is the contest's: at the structure depth
            it stands in for the contest bar too, lockdown included. */}
        {asDomjudge ? (
          <DomjudgeNav
            nav={nav}
            viewer={viewer}
            contest={navContest}
            registrationOpen={registrationOpen}
            onOpenSearch={() => setPaletteOpen(true)}
            siteName={siteName}
          />
        ) : lockedDown ? null : (
          <NavBar
            nav={nav}
            viewer={viewer}
            registrationOpen={registrationOpen}
            onOpenSearch={() => setPaletteOpen(true)}
            logoUrl={logoUrl}
            siteName={siteName}
          />
        )}
        {/* The royal, carried across the top of every page — and one of the
            things DOMjudge's chrome does not have. */}
        {asDomjudge ? null : <div aria-hidden className="h-[3px] bg-royal" />}
        {asDomjudge ? null : onContestPage && contest ? (
          <ContestBar
            data={contest}
            currentCode={problemCode}
            viewerUsername={viewer?.username ?? null}
            account={lockedDown ? viewer : null}
          />
        ) : showContestPlaceholder ? (
          // Claim the bar's height on the first render and keep it while its
          // contents load, so the page stays put when the answer arrives.
          <div aria-hidden className="h-(--contest-bar-height) border-b border-white/10 bg-contest-bar" />
        ) : null}
        {viewer?.isImpersonating ? <ImpersonationBar username={viewer.displayName} /> : null}
      </header>

      <ProfileBootstrap />
      {isHome ? (
        <>
          <div aria-hidden className="page-constellations" />
          <BackdropDrift />
        </>
      ) : null}

      {/* Until the header is measured, reserve only the chrome being rendered. */}
      <div
        className="flex min-h-dvh flex-col"
        style={{
          paddingTop: `var(--header-height, ${headerHeight})`,
        }}
      >
        {/* `overflow-x: clip` (not hidden, which would make this a scroll
            container and break every sticky header inside it): a dense table
            already scrolls inside its own wrapper, but a wide console page
            still widened the document on a phone. */}
        {/* The home page keeps the club's ground; everywhere else the reading
            column washes the grid almost out, because behind a statement or a
            dense table it competes with the content. */}
        <main
          id="content"
          className={cn(
            "relative mx-auto w-full max-w-(--content-max) flex-1 overflow-x-clip px-(--gutter) py-6 min-[760px]:px-(--gutter-lg)",
            !isHome && "page-canvas",
          )}
        >
          <RouteProgress />
          {/* Page enter is the content column only; the chrome must feel nailed
              down, so it never animates on navigation. */}
          <div key={pathname} className="enter-rise">
            {children}
          </div>
        </main>
        <Footer footerHtml={misc.footer} language={language} />
      </div>

      {joined && displayedContest?.contest.key !== joined.contest.key ? (
        <ContestFloater
          contestKey={joined.contest.key}
          contestName={joined.contest.name}
          endsAt={joined.isSpectating ? null : joined.endsAt}
          mode={joined.isSpectating ? "spectating" : joined.isVirtual ? "virtual" : "live"}
          problems={joined.problems}
        />
      ) : null}

      <Announcement html={misc.announcement} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutLayer />
      <Toaster />
    </TooltipProvider>
  );
}
