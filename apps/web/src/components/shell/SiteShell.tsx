"use client";

import { api } from "@convex/_generated/api";
import { cn, Toaster, TooltipProvider } from "@moj/ui";
import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette";
import { ProfileBootstrap } from "@/components/ProfileBootstrap";
import type { NavNode } from "@/lib/nav";
import { Announcement } from "./Announcement";
import { ContestBar } from "./ContestBar";
import { ContestFloater } from "./ContestFloater";
import { Footer } from "./Footer";
import { NavBar } from "./NavBar";
import { RouteProgress } from "./RouteProgress";
import { ShortcutLayer } from "./ShortcutLayer";
import type { ViewerSummary } from "./UserBlock";

/** The club's royal grid belongs on the pages that are mostly words. Behind a
 *  table it is noise (DESIGN.md section 7). */
function wantsGrid(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/accounts/") ||
    pathname.startsWith("/about") ||
    pathname.startsWith("/blog") ||
    pathname.startsWith("/post/")
  );
}

export function SiteShell({
  nav,
  misc,
  viewer,
  registrationOpen,
  language,
  children,
}: {
  nav: NavNode[];
  misc: Record<string, string>;
  viewer: ViewerSummary | null;
  registrationOpen: boolean;
  /** The viewer's `LANGUAGE_CODE`, read from the cookie by the layout. */
  language: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const headerRef = useRef<HTMLElement | null>(null);

  const contest = useQuery(api.contests.navBar, {});
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

  return (
    <TooltipProvider>
      <a className="skip-link" href="#content">
        Skip to content
      </a>

      <header ref={headerRef} className="fixed inset-x-0 top-0 z-(--z-nav)">
        <NavBar
          nav={nav}
          viewer={viewer}
          registrationOpen={registrationOpen}
          onOpenSearch={() => setPaletteOpen(true)}
        />
        {/* The club's royal, carried across the top of every page. */}
        <div aria-hidden className="h-[3px] bg-royal" />
        {onContestPage && contest ? <ContestBar data={contest} currentCode={problemCode} /> : null}
      </header>

      <ProfileBootstrap />

      <div
        className={cn(
          "flex min-h-dvh flex-col pt-[var(--header-height,calc(var(--nav-height)+3px))]",
          wantsGrid(pathname) && "page-grid",
        )}
      >
        <main
          id="content"
          className="relative mx-auto w-full max-w-(--content-max) flex-1 px-(--gutter) py-6 min-[760px]:px-(--gutter-lg)"
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
