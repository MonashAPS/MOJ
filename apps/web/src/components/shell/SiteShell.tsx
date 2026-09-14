"use client";

import { api } from "@convex/_generated/api";
import { Toaster, TooltipProvider } from "@moj/ui";
import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette";
import { ProfileBootstrap } from "@/components/ProfileBootstrap";
import type { NavNode } from "@/lib/nav";
import { Announcement } from "./Announcement";
import { BackdropDrift } from "./BackdropDrift";
import { ContestBar } from "./ContestBar";
import { ContestFloater } from "./ContestFloater";
import { Footer } from "./Footer";
import { ImpersonationBar } from "./ImpersonationBar";
import { NavBar } from "./NavBar";
import { RouteProgress } from "./RouteProgress";
import { ShortcutLayer } from "./ShortcutLayer";
import type { ViewerSummary } from "./UserBlock";

/** The hall scoreboard is a projector surface, not a page of the site: it draws
 *  its own chrome full-bleed and must not carry the nav, the footer or the
 *  content column (DESIGN.md section 16.2). The index at `/scoreboard/` is an
 *  ordinary page. */
function isHallScoreboard(pathname: string): boolean {
  return /^\/scoreboard\/.+/.test(pathname);
}

export function SiteShell({
  nav,
  misc,
  viewer,
  registrationOpen,
  language,
  logoUrl = null,
  siteName = "MAPS Online Judge",
  children,
}: {
  nav: NavNode[];
  misc: Record<string, string>;
  viewer: ViewerSummary | null;
  registrationOpen: boolean;
  /** SPEC section 24: the operator's wordmark, when one is uploaded. */
  logoUrl?: string | null;
  siteName?: string;
  /** The viewer's `LANGUAGE_CODE`, read from the cookie by the layout. */
  language: string;
  children: ReactNode;
}) {
  const t = useTranslations("common.nav");
  const pathname = usePathname() ?? "/";
  const isHome = pathname === "/";
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const headerRef = useRef<HTMLElement | null>(null);

  /** SPEC section 20: on a contest route the bar is the contest in the URL, not
   *  whichever contest the viewer happens to be inside. */
  const routeKey = /^\/contest\/([a-z0-9._-]+)/i.exec(pathname)?.[1];
  const contest = useQuery(api.contests.navBar, routeKey ? { key: routeKey } : {});
  const problemCode = /^\/problem\/([a-z0-9._-]+)/.exec(pathname)?.[1];
  const onContestPage =
    !!contest &&
    (pathname.startsWith(`/contest/${contest.contest.key}`) ||
      (!!problemCode && contest.problems.some((problem) => problem.code === problemCode)));

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
        <NavBar
          nav={nav}
          viewer={viewer}
          registrationOpen={registrationOpen}
          onOpenSearch={() => setPaletteOpen(true)}
          logoUrl={logoUrl}
          siteName={siteName}
        />
        {/* The royal, carried across the top of every page. */}
        <div aria-hidden className="h-[3px] bg-royal" />
        {onContestPage && contest ? (
          <ContestBar data={contest} currentCode={problemCode} viewerUsername={viewer?.username ?? null} />
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

      <div className="flex min-h-dvh flex-col pt-[var(--header-height,calc(var(--nav-height)+3px))]">
        {/* `overflow-x: clip` (not hidden, which would make this a scroll
            container and break every sticky header inside it): a dense table
            already scrolls inside its own wrapper, but a wide console page
            still widened the document on a phone. */}
        <main
          id="content"
          className="relative mx-auto w-full max-w-(--content-max) flex-1 overflow-x-clip px-(--gutter) py-6 min-[760px]:px-(--gutter-lg)"
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

      {contest && !onContestPage ? (
        <ContestFloater
          contestKey={contest.contest.key}
          contestName={contest.contest.name}
          endsAt={contest.isSpectating ? null : contest.endsAt}
          mode={contest.isSpectating ? "spectating" : contest.isVirtual ? "virtual" : "live"}
        />
      ) : null}

      <Announcement html={misc.announcement} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutLayer />
      <Toaster />
    </TooltipProvider>
  );
}
