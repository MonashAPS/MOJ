"use client";

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Kbd,
  Sheet,
  SheetContent,
  SheetTitle,
  Tooltip,
} from "@moj/ui";
import { ChevronDown, Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { activeNavKeys, type NavNode } from "@/lib/nav";
import { UserBlock, type ViewerSummary } from "./UserBlock";

const MOBILE_BREAKPOINT = 760;
const WIDE_SEARCH_BREAKPOINT = 1100;
/** Reserved for the More trigger while measuring, so the last item never lands
 *  on top of it. */
const MORE_WIDTH = 84;

const itemBase =
  "inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap px-3 text-base font-medium tracking-[.01em] transition-colors";

export function NavBar({
  nav,
  viewer,
  registrationOpen = true,
  onOpenSearch,
}: {
  nav: NavNode[];
  viewer: ViewerSummary | null;
  registrationOpen?: boolean;
  onOpenSearch?: () => void;
}) {
  const pathname = usePathname() ?? "/";
  const active = activeNavKeys(nav, pathname);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(nav.length);
  const [isMobile, setIsMobile] = useState(false);
  const [wideSearch, setWideSearch] = useState(false);

  const listRef = useRef<HTMLUListElement | null>(null);
  const measureRef = useRef<HTMLUListElement | null>(null);
  const frame = useRef(0);

  /** Measured once per resize against a hidden full-width copy, inside a frame,
   *  so items never visibly reflow or pop as the window changes size. */
  const recalculate = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const list = listRef.current;
      const measure = measureRef.current;
      if (!list || !measure) return;

      setWideSearch(window.innerWidth >= WIDE_SEARCH_BREAKPOINT);

      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        setIsMobile(true);
        setVisibleCount(nav.length);
        return;
      }
      setIsMobile(false);

      const widths = Array.from(measure.children).map((child) => (child as HTMLElement).offsetWidth);
      const available = list.clientWidth;

      let used = 0;
      let fits = 0;
      for (let index = 0; index < widths.length; index++) {
        used += widths[index] ?? 0;
        const needsMore = index < widths.length - 1;
        if (used + (needsMore ? MORE_WIDTH : 0) > available) break;
        fits++;
      }
      setVisibleCount(Math.max(0, Math.min(fits, widths.length)));
    });
  }, [nav]);

  useLayoutEffect(() => {
    recalculate();
  }, [recalculate]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(recalculate);
    observer.observe(list);
    window.addEventListener("resize", recalculate, { passive: true });
    // Web fonts change the measured widths once they land.
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(recalculate).catch(() => undefined);
    }
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recalculate);
      cancelAnimationFrame(frame.current);
    };
  }, [recalculate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const shown = isMobile ? [] : nav.slice(0, visibleCount);
  const overflow = isMobile ? [] : nav.slice(visibleCount);

  return (
    <nav aria-label="Main" className="flex h-(--nav-height) select-none items-stretch bg-nav text-nav-ink">
      {isMobile ? (
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className={cn(itemBase, "text-nav-ink/90 hover:bg-nav-hover hover:text-nav-ink")}
        >
          <Menu size={20} aria-hidden />
        </button>
      ) : null}

      <Link
        href="/"
        aria-label="MOJ home"
        className="flex shrink-0 items-center px-4 transition-opacity hover:opacity-90"
      >
        <img src="/logo.svg" alt="MOJ" className="h-[22px] w-auto" />
      </Link>
      <span aria-hidden className="my-2 w-px shrink-0 bg-white/20" />

      {/* Off-screen copy of the full list, used only to measure item widths. */}
      <ul
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex h-11"
      >
        {nav.map((node) => (
          <li key={`measure-${node._id}`} className={itemBase}>
            {node.label}
            {node.children.length > 0 ? <ChevronDown size={14} aria-hidden /> : null}
          </li>
        ))}
      </ul>

      <ul ref={listRef} className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        {shown.map((node) => (
          <NavItem key={node._id} node={node} active={active} />
        ))}
        {overflow.length > 0 ? (
          <li className="flex items-stretch">
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  itemBase,
                  "relative text-nav-ink/90 hover:bg-nav-hover hover:text-nav-ink data-[state=open]:bg-nav-hover",
                  overflow.some((node) => active.has(node.key)) &&
                    "bg-nav-active text-nav-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-royal",
                )}
              >
                More
                <ChevronDown size={14} aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {overflow.map((node) => (
                  <div key={node._id}>
                    <DropdownMenuItem asChild>
                      <Link href={node.path} className={active.has(node.key) ? "bg-row-selected" : undefined}>
                        {node.label}
                      </Link>
                    </DropdownMenuItem>
                    {node.children.map((child) => (
                      <DropdownMenuItem key={child._id} asChild>
                        <Link href={child.path} className="pl-6 text-subtle">
                          {child.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ) : null}
      </ul>

      {onOpenSearch ? (
        wideSearch ? (
          <button
            type="button"
            onClick={onOpenSearch}
            className={cn(
              "my-2 mr-2 flex w-[220px] shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3",
              "text-left text-sm text-nav-ink-2 transition-colors hover:border-white/25 hover:bg-white/12",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/60",
            )}
          >
            <Search size={16} aria-hidden />
            <span className="flex-1 truncate">Search</span>
            <Kbd className="border-white/20 bg-white/10 text-nav-ink-2 shadow-none">Ctrl K</Kbd>
          </button>
        ) : (
          <Tooltip content="Search (Ctrl K)">
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="Search"
              className={cn(itemBase, "px-3 text-nav-ink/90 hover:bg-nav-hover hover:text-nav-ink")}
            >
              <Search size={20} aria-hidden />
            </button>
          </Tooltip>
        )
      ) : null}

      <UserBlock viewer={viewer} registrationOpen={registrationOpen} />

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="top"
          showCloseButton
          className="max-h-dvh overflow-y-auto border-b-white/15 bg-nav p-0 text-nav-ink"
        >
          <SheetTitle className="px-4 pt-4 font-sans text-xs font-semibold uppercase tracking-label text-nav-ink-2">
            Menu
          </SheetTitle>
          <ul className="flex flex-col pb-2">
            <li>
              <Link href="/" className="flex h-11 items-center px-4 text-md text-nav-ink hover:bg-nav-hover">
                Home
              </Link>
            </li>
            {nav.map((node) => (
              <li key={node._id}>
                <Link
                  href={node.path}
                  className={cn(
                    "flex h-11 items-center px-4 text-md text-nav-ink hover:bg-nav-hover",
                    active.has(node.key) && "bg-nav-active",
                  )}
                >
                  {node.label}
                </Link>
                {node.children.map((child) => (
                  <Link
                    key={child._id}
                    href={child.path}
                    className="flex h-11 items-center pl-8 pr-4 text-base text-nav-ink-2 hover:bg-nav-hover hover:text-nav-ink"
                  >
                    {child.label}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
          <div className="border-t border-white/15 px-4 py-3">
            {viewer ? (
              <ul className="flex flex-col">
                <li>
                  <Link
                    href={`/user/${viewer.username}`}
                    className="flex h-11 items-center text-md text-nav-ink"
                  >
                    {viewer.displayName}
                  </Link>
                </li>
                <li>
                  <Link href="/edit/profile/" className="flex h-11 items-center text-md text-nav-ink">
                    Edit profile
                  </Link>
                </li>
                <li>
                  <a href="/accounts/logout/" className="flex h-11 items-center text-md text-nav-ink">
                    Log out
                  </a>
                </li>
              </ul>
            ) : (
              <div className="flex items-center gap-3 py-1">
                <Button asChild variant="ghost" className="text-nav-ink hover:bg-nav-hover">
                  <Link href="/accounts/login/">Log in</Link>
                </Button>
                {registrationOpen ? (
                  <Button asChild variant="canary" size="pill">
                    <Link href="/accounts/register/">Sign up</Link>
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

function NavItem({ node, active }: { node: NavNode; active: Set<string> }) {
  const isActive = active.has(node.key);
  const classes = cn(
    itemBase,
    "relative text-nav-ink/90 hover:bg-nav-hover hover:text-nav-ink",
    // Never a different text colour alone: a tint and a 2px royal underline.
    isActive &&
      "bg-nav-active text-nav-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-royal",
  );

  if (node.children.length === 0) {
    return (
      <li className="flex items-stretch">
        <Link href={node.path} className={classes} aria-current={isActive ? "page" : undefined}>
          {node.label}
        </Link>
      </li>
    );
  }

  return (
    <li className="flex items-stretch">
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(classes, "data-[state=open]:bg-nav-hover")}>
          {node.label}
          <ChevronDown size={14} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem asChild>
            <Link href={node.path}>{node.label}</Link>
          </DropdownMenuItem>
          {node.children.map((child) => (
            <DropdownMenuItem key={child._id} asChild>
              <Link href={child.path} className={active.has(child.key) ? "bg-row-selected" : undefined}>
                {child.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
