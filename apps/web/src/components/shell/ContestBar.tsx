"use client";

import type { ContestBarData } from "@convex/contests";
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@moj/ui";
import { Clock, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { COUNTDOWN_HORIZON, formatDuration, useCountdown } from "@/lib/countdown";

function moveBetweenChips(ref: { current: HTMLDivElement | null }) {
  return (event: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const chips = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-chip]") ?? []);
    const index = chips.indexOf(event.currentTarget);

    if (index === -1) return;
    event.preventDefault();
    const next = event.key === "ArrowRight" ? index + 1 : index - 1;
    chips[Math.max(0, Math.min(next, chips.length - 1))]?.focus();
  };
}

/** The bar carries `data-chrome="dark"`, so `--v-*` here are the dark values
 *  whatever the page theme is. */
const CHIP_STATE: Record<string, string> = {
  solved: "border-transparent bg-good text-primary-foreground",
  partial: "border-transparent bg-warn text-primary-foreground",
  attempted: "border-bad bg-transparent text-bad",
  untouched: "border-transparent bg-white/8 text-contest-bar-ink",
};

/** SPEC section 20. Sticky directly under the nav on any page that belongs to
 *  the contest; the DMOJ floater covers everywhere else, and never both. */
export function ContestBar({
  data,
  currentCode,
  viewerUsername,
}: {
  data: NonNullable<ContestBarData>;
  currentCode?: string;
  viewerUsername?: string | null;
}) {
  const t = useTranslations("common.contestBar");
  const remaining = useCountdown(data.isSpectating ? null : data.endsAt);
  const chipsRef = useRef<HTMLDivElement | null>(null);
  const base = `/contest/${data.contest.key}`;

  const links = [
    ...(data.links.standings ? [{ href: `${base}/ranking/`, label: t("standings") }] : []),
    ...(data.links.submissions && viewerUsername
      ? [{ href: `${base}/submissions/${viewerUsername}/`, label: t("mySubmissions") }]
      : []),
    ...(data.links.clarifications ? [{ href: `${base}/#clarifications`, label: t("clarifications") }] : []),
  ];

  // A contest whose window has closed has no countdown left to run; DMOJ stops
  // showing one rather than pinning it at zero.
  const ended = data.timeRemaining === null || remaining === null || remaining <= 0;
  // DMOJ's open-ended tutorial contests run to the year 9999; "2911824d" is not
  // a deadline, so the bar stops counting.
  const openEnded = !ended && remaining !== null && remaining > COUNTDOWN_HORIZON;

  const urgency =
    ended || openEnded
      ? "text-contest-bar-ink"
      : remaining < 60_000
        ? "text-bad"
        : remaining < 300_000
          ? "text-canary"
          : "text-nav-ink";

  return (
    <nav
      aria-label={t("label")}
      data-chrome="dark"
      className="flex h-(--contest-bar-height) items-center gap-3 border-b border-white/10 bg-contest-bar px-4 text-contest-bar-ink"
    >
      <Link
        href={base}
        className="max-w-[24ch] shrink-0 truncate text-sm font-semibold text-nav-ink hover:text-white max-[700px]:max-w-[12ch]"
      >
        {data.contest.name}
      </Link>

      {data.problems.length > 0 ? (
        <div
          ref={chipsRef}
          className="scroll-quiet flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scroll-snap-type:x_proximity]"
        >
          {data.problems.map((problem) => {
            const isCurrent = currentCode === problem.code;

            return (
              <Link
                key={problem.contestProblemId}
                data-chip
                href={`/problem/${problem.code}`}
                aria-current={isCurrent ? "page" : undefined}
                title={t("problem", { label: problem.label, name: problem.name, state: problem.state })}
                // Arrow keys move a roving cursor along the chips.
                onKeyDown={moveBetweenChips(chipsRef)}
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-xs border font-mono text-sm font-medium",
                  "transition-colors [scroll-snap-align:center]",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/60",
                  CHIP_STATE[problem.state],
                  isCurrent && "shadow-[inset_0_-2px_0_var(--brand-canary)]",
                )}
              >
                {problem.label}
              </Link>
            );
          })}
        </div>
      ) : (
        <span className="flex-1" />
      )}

      <div className="hidden shrink-0 items-center gap-3 min-[700px]:flex">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm text-contest-bar-ink hover:text-nav-ink">
            {link.label}
          </Link>
        ))}
      </div>

      <div className="shrink-0 min-[700px]:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("links")}
            className="flex size-6 items-center justify-center rounded-xs text-contest-bar-ink hover:bg-white/10 hover:text-nav-ink"
          >
            <MoreHorizontal size={16} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {links.map((link) => (
              <DropdownMenuItem key={link.href} asChild>
                <Link href={link.href}>{link.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <span
        className={cn(
          "flex shrink-0 items-center gap-1.5 font-mono text-sm font-semibold tabular-nums",
          urgency,
        )}
      >
        <Clock size={14} aria-hidden />
        {data.isSpectating
          ? t("spectating")
          : ended
            ? t("ended")
            : openEnded
              ? t("openEnded")
              : formatDuration(remaining)}
      </span>
    </nav>
  );
}
