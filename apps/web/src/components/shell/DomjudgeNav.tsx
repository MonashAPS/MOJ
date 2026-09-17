"use client";

import { cn } from "@moj/ui";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { activeNavKeys, type NavNode } from "@/lib/nav";
import { UserBlock, type ViewerSummary } from "./UserBlock";

/**
 * The navbar DOMjudge's team interface wears, for the structure depth.
 *
 * DOMjudge's menu is the contest rather than the site: inside one it offers the
 * contest's home, its scoreboard, your own submissions in it and its
 * clarifications, and nothing else — no problem archive, no user directory, no
 * site-wide submission feed, because a team in a contest has no business in any
 * of them. Outside a contest it falls back to the site's own nav, flattened:
 * DOMjudge has no dropdowns in its bar.
 *
 * The search button and the theme menu stay. They are functionality DOMjudge
 * does not have, rather than structure it arranges differently.
 */

const ITEM =
  "inline-flex h-full shrink-0 items-center whitespace-nowrap px-3 text-base transition-colors " +
  "text-nav-ink-2 hover:text-nav-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/60";

const ACTIVE = "text-nav-ink font-semibold";

export type NavContest = { key: string; name: string } | null;

type Item = { key: string; href: string; label: string; anchor?: boolean };

export function DomjudgeNav({
  nav,
  viewer,
  contest,
  registrationOpen = true,
  onOpenSearch,
  logoUrl = null,
  siteName = "MAPS Online Judge",
}: {
  nav: NavNode[];
  viewer: ViewerSummary | null;
  /** The contest the viewer is in, or whose page they are on. */
  contest: NavContest;
  registrationOpen?: boolean;
  onOpenSearch?: () => void;
  logoUrl?: string | null;
  siteName?: string;
}) {
  const t = useTranslations("common.nav");
  const actions = useTranslations("common.actions");
  const pathname = usePathname() ?? "/";
  const active = activeNavKeys(nav, pathname);

  const items: Item[] = contest
    ? [
        { key: "home", href: `/contest/${contest.key}/`, label: t("domjudgeHome") },
        { key: "scoreboard", href: `/contest/${contest.key}/ranking/`, label: t("domjudgeScoreboard") },
        {
          key: "submissions",
          // A team's own submissions are most of what DOMjudge's home page is;
          // ours live on the contest's own list, scoped to them.
          href: viewer
            ? `/contest/${contest.key}/submissions/?mine=1`
            : `/contest/${contest.key}/submissions/`,
          label: t("domjudgeSubmissions"),
        },
        {
          key: "clarifications",
          href: `/contest/${contest.key}/#clarifications`,
          label: t("domjudgeClarifications"),
          anchor: true,
        },
      ]
    : nav.map((node) => ({ key: node.key, href: node.path, label: node.label }));

  return (
    <nav aria-label={t("main")} className="flex h-(--nav-height) items-stretch bg-nav px-3 text-nav-ink">
      <Link href="/" className="flex shrink-0 items-center pr-3" aria-label={t("home")}>
        <img src={logoUrl ?? "/logo.svg"} alt={siteName} className="h-7 w-auto" />
      </Link>

      {/* DOMjudge writes the contest's name across the bar rather than leaving it
          to the page: it is the thing you are inside. */}
      {contest ? (
        <span className="flex shrink-0 items-center pr-3 text-base font-semibold text-nav-ink max-[900px]:hidden">
          {contest.name}
        </span>
      ) : null}

      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {items.map((item) => {
          const here = item.anchor
            ? false
            : contest
              ? pathname === item.href || pathname.startsWith(item.href.split("?")[0] ?? item.href)
              : active.has(item.key);

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={here ? "page" : undefined}
              className={cn(ITEM, here && ACTIVE)}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onOpenSearch ? (
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label={actions("search")}
            className={cn(ITEM, "h-9 rounded-md hover:bg-nav-hover")}
          >
            <Search size={16} aria-hidden />
          </button>
        ) : null}
        <UserBlock viewer={viewer} registrationOpen={registrationOpen} />
      </div>
    </nav>
  );
}
