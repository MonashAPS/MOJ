"use client";

import { ChevronDown, Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { activeNavKeys, type NavNode } from "@/lib/nav";
import { UserBlock, type ViewerSummary } from "./UserBlock";

const MOBILE_BREAKPOINT = 760;
const MORE_WIDTH = 92;

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

  const listRef = useRef<HTMLUListElement | null>(null);
  const measureRef = useRef<HTMLUListElement | null>(null);

  const recalculate = useCallback(() => {
    const list = listRef.current;
    const measure = measureRef.current;
    if (!list || !measure) return;

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
  }, [nav]);

  useLayoutEffect(() => {
    recalculate();
  }, [recalculate]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => recalculate());
    observer.observe(list);
    window.addEventListener("resize", recalculate);
    // Web fonts change the measured widths once they land.
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => recalculate()).catch(() => undefined);
    }
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recalculate);
    };
  }, [recalculate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const shown = isMobile ? nav : nav.slice(0, visibleCount);
  const overflow = isMobile ? [] : nav.slice(visibleCount);

  return (
    <nav id="navigation" className="unselectable" aria-label="Main">
      <div id="nav-container">
        <button
          type="button"
          id="navicon"
          aria-label="Menu"
          aria-expanded={drawerOpen}
          aria-controls="nav-list"
          onClick={() => setDrawerOpen((value) => !value)}
        >
          <Menu size={20} aria-hidden />
        </button>

        <Link href="/" className="nav-brand" aria-label="MOJ home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="MOJ" />
        </Link>
        <span className="nav-divider" aria-hidden />

        {/* Off-screen copy of the full list, used only to measure item widths. */}
        <ul id="nav-measure" ref={measureRef} aria-hidden>
          {nav.map((node) => (
            <li key={`measure-${node._id}`}>
              <a href={node.path}>{node.label}</a>
            </li>
          ))}
        </ul>

        <ul id="nav-list" ref={listRef} className={drawerOpen ? "show-list" : undefined}>
          {isMobile ? (
            <li className="home-menu-item">
              <Link href="/">Home</Link>
            </li>
          ) : null}
          {shown.map((node) => (
            <NavItem key={node._id} node={node} active={active} />
          ))}
          {overflow.length > 0 ? (
            <li>
              <button type="button" aria-haspopup="menu">
                More
                <ChevronDown size={13} aria-hidden />
              </button>
              <ul className="nav-menu align-right">
                {overflow.map((node) => (
                  <li key={node._id}>
                    <Link href={node.path} className={active.has(node.key) ? "active" : undefined}>
                      {node.label}
                    </Link>
                    {node.children.map((child) => (
                      <Link
                        key={child._id}
                        href={child.path}
                        className={active.has(child.key) ? "active" : undefined}
                        style={{ paddingLeft: "var(--space-5)" }}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </li>
                ))}
              </ul>
            </li>
          ) : null}
        </ul>

        {onOpenSearch ? (
          <button
            type="button"
            className="nav-search"
            onClick={onOpenSearch}
            title="Search"
            aria-label="Search"
            style={{
              flex: "none",
              display: "inline-flex",
              alignItems: "center",
              padding: "0 var(--space-2)",
              background: "none",
              border: 0,
              color: "var(--nav-ink)",
              cursor: "pointer",
            }}
          >
            <Search size={16} aria-hidden />
          </button>
        ) : null}

        <UserBlock viewer={viewer} registrationOpen={registrationOpen} />
      </div>
      <div id="nav-shadow" />
    </nav>
  );
}

function NavItem({ node, active }: { node: NavNode; active: Set<string> }) {
  return (
    <li>
      <Link href={node.path} className={active.has(node.key) ? "active" : undefined}>
        {node.label}
        {node.children.length > 0 ? <ChevronDown size={13} aria-hidden /> : null}
      </Link>
      {node.children.length > 0 ? (
        <ul className="nav-menu">
          {node.children.map((child) => (
            <li key={child._id}>
              <Link href={child.path} className={active.has(child.key) ? "active" : undefined}>
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
