"use client";

import type { ContestChrome } from "@convex/contests";
import { Button, cn } from "@moj/ui";
import { BookOpen, Clock, ListOrdered, LogIn, MessagesSquare, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { COUNTDOWN_HORIZON, formatDuration, useCountdown } from "@/lib/countdown";
import { activeNavKeys, type NavNode } from "@/lib/nav";
import { DomjudgeSubmit } from "./DomjudgeSubmit";
import { ThemeDropdown } from "./ThemeMenu";
import { UserBlock, type ViewerSummary } from "./UserBlock";
import { Wordmark } from "./Wordmark";

/**
 * DOMjudge's bar, for the structure depth.
 *
 * It is white with dark text and a rule under it, the product name is written
 * rather than drawn on a plate, the menu is the contest's — Scoreboard,
 * Problemset, Clarifications — and the clock counting the contest down sits at
 * the right-hand end where DOMjudge keeps it. Under it runs the contest's
 * progress as a bar across the whole width, which is the first thing you see on
 * a DOMjudge page and the thing ours never had.
 *
 * The search button and the theme menu stay: functionality DOMjudge does not
 * have, rather than structure it arranges differently.
 */

const ITEM =
  "inline-flex h-full shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-base transition-colors " +
  "text-nav-ink/75 hover:text-nav-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/60";

const ACTIVE = "text-nav-ink font-semibold";

type Item = { key: string; href: string; label: string; icon?: React.ReactNode; anchor?: boolean };

type Contest = NonNullable<ContestChrome> & {
  /** When the viewer's own window closes, if they are in it. */
  endsAt: number | null;
  ownSubmissions: boolean;
  /** Empty unless the viewer is in the contest, which is when they may submit. */
  problems: { code: string; name: string; label: string }[];
};

/** The contest clock DOMjudge writes at the end of its bar. */
function ContestClock({ contest }: { contest: Contest }) {
  const remaining = useCountdown(contest.endsAt ?? contest.endTime);

  if (remaining === null || remaining > COUNTDOWN_HORIZON) return null;

  return (
    <span className="flex shrink-0 items-center gap-1.5 px-3 font-mono text-base font-semibold tabular-nums text-nav-ink">
      <Clock size={15} aria-hidden />
      {remaining > 0 ? formatDuration(remaining) : "00:00:00"}
    </span>
  );
}

/** How far through the contest we are, full width under the bar. */
function ContestProgress({ contest }: { contest: Contest }) {
  const remaining = useCountdown(contest.endTime);
  const total = contest.endTime - contest.startTime;

  if (total <= 0 || total > COUNTDOWN_HORIZON) return null;
  const elapsed = Math.min(Math.max(total - (remaining ?? 0), 0), total);

  return (
    <div className="h-1.5 w-full bg-well">
      <div
        className="h-full bg-primary transition-[width] duration-(--dur)"
        style={{ width: `${((elapsed / total) * 100).toFixed(2)}%` }}
      />
    </div>
  );
}

export function DomjudgeNav({
  nav,
  viewer,
  contest,
  registrationOpen = true,
  onOpenSearch,
  siteName = "MAPS Online Judge",
}: {
  nav: NavNode[];
  viewer: ViewerSummary | null;
  /** The contest the viewer is in, or whose pages they are reading. */
  contest: Contest | null;
  registrationOpen?: boolean;
  onOpenSearch?: () => void;
  siteName?: string;
}) {
  const t = useTranslations("common.nav");
  const actions = useTranslations("common.actions");
  const pathname = usePathname() ?? "/";
  const active = activeNavKeys(nav, pathname);

  const items: Item[] = contest
    ? [
        {
          key: "scoreboard",
          href: `/contest/${contest.key}/ranking/`,
          label: t("domjudgeScoreboard"),
          icon: <ListOrdered size={15} aria-hidden />,
        },
        {
          key: "problemset",
          href: `/contest/${contest.key}/`,
          label: t("domjudgeProblemset"),
          icon: <BookOpen size={15} aria-hidden />,
        },
        ...(contest.ownSubmissions
          ? [
              {
                key: "submissions",
                href: `/contest/${contest.key}/submissions/?mine=1`,
                label: t("domjudgeSubmissions"),
                icon: <Search size={15} aria-hidden />,
              },
            ]
          : []),
        ...(contest.useClarifications
          ? [
              {
                key: "clarifications",
                href: `/contest/${contest.key}/#clarifications`,
                label: t("domjudgeClarifications"),
                icon: <MessagesSquare size={15} aria-hidden />,
                anchor: true,
              },
            ]
          : []),
      ]
    : nav.map((node) => ({ key: node.key, href: node.path, label: node.label }));

  return (
    <div className="bg-nav">
      <nav
        aria-label={t("main")}
        className="flex h-(--nav-height) items-stretch border-b border-(--nav-keyline) px-3 text-nav-ink"
      >
        <Link href="/" className="flex shrink-0 items-center pr-4" aria-label={t("home")}>
          {/* `currentColor`, so the mark reads on a white bar as well as a dark
              one — the uploaded logo is a plate and would not. */}
          <Wordmark className="h-5 w-auto text-nav-ink" title={siteName} />
        </Link>

        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {items.map((item) => {
            const target = item.href.split("?")[0] ?? item.href;

            const here = item.anchor ? false : contest ? pathname === target : active.has(item.key);

            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={here ? "page" : undefined}
                className={cn(ITEM, here && ACTIVE)}
              >
                {item.icon}
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
          {/* DOMjudge submits from the bar rather than from a problem page. */}
          {contest && viewer ? <DomjudgeSubmit problems={contest.problems} /> : null}
          <ThemeDropdown />
          {viewer ? (
            <UserBlock viewer={viewer} registrationOpen={registrationOpen} />
          ) : (
            <Button asChild size="sm" className="bg-cyan text-[color:hsl(0_0%_10%)] hover:brightness-95">
              <Link href="/accounts/login/">
                <LogIn size={14} aria-hidden />
                {t("logIn")}
              </Link>
            </Button>
          )}
          {contest ? <ContestClock contest={contest} /> : null}
        </div>
      </nav>

      {contest ? <ContestProgress contest={contest} /> : null}
    </div>
  );
}
