"use client";

import { api } from "@convex/_generated/api";
import type { AccessibleRankingProblem } from "@convex/contests/rankings";
import type { SubmissionListRow } from "@convex/submissions";
import {
  Button,
  cn,
  focusRing,
  focusRingInset,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Tooltip,
  VerdictPill,
} from "@moj/ui";
import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { formatPoints } from "@/lib/format";
import { absoluteTime, DASH, formatMemory, formatTime, isGrading, verdictCode } from "@/lib/submissionFormat";

/** A cell holds a handful of attempts, not a contest's worth; DMOJ's 50 is a page. */
const PAGE_SIZE = 20;

/** `SubmissionRow`'s `noUsage`: these states carry no score, run time or memory. */
const WITHOUT_NUMBERS = new Set(["QU", "P", "G", "CE", "IE", "AB"]);

/**
 * A ranking cell that opens the attempts behind it.
 *
 * The scoreboard prints one number per participant per problem; the question it
 * always raises is which submissions produced it. The cell becomes the trigger
 * and the answer arrives in place, so reading a row never costs a page load.
 *
 * `submissions.list` is only subscribed to from inside the panel, which Radix
 * mounts when the popover opens and unmounts when it closes. A scoreboard is
 * hundreds of cells wide, and none of them may hold a live query while shut.
 */
export function RankingCellSubmissions({
  contestKey,
  username,
  displayName,
  problem,
  precision,
  tooltip,
  children,
}: {
  contestKey: string;
  username: string;
  displayName: string;
  problem: AccessibleRankingProblem;
  precision: number;
  /** The frozen cell's existing hover copy, kept on the trigger it became. */
  tooltip?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("contests.ranking.cell");
  const [open, setOpen] = useState(false);

  const trigger = (
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={t("open", { user: displayName, problem: problem.name })}
        className={cn(
          "flex h-(--row-h-dense) w-full cursor-pointer flex-col items-center justify-center px-1",
          "transition-shadow duration-(--dur-fast) hover:shadow-[inset_0_0_0_1px_var(--line-strong)]",
          focusRingInset,
        )}
      >
        {children}
      </button>
    </PopoverTrigger>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {tooltip ? <Tooltip content={tooltip}>{trigger}</Tooltip> : trigger}
      <PopoverContent align="center" className="w-[28rem] max-w-[calc(100vw-2rem)] p-0">
        <CellSubmissions
          contestKey={contestKey}
          username={username}
          displayName={displayName}
          problem={problem}
          precision={precision}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The panel: who and what at the top, the attempts in the middle, the full list
 *  at the bottom. Mounted only while the popover is open. */
function CellSubmissions({
  contestKey,
  username,
  displayName,
  problem,
  precision,
}: {
  contestKey: string;
  username: string;
  displayName: string;
  problem: AccessibleRankingProblem;
  precision: number;
}) {
  const t = useTranslations("contests.ranking.cell");
  const common = useTranslations("common");

  // The query decides for itself whose rows this viewer may see, and blinds a
  // frozen contest's verdicts, so nothing here has to ask a second time.
  const live = usePaginatedQuery(
    api.submissions.list,
    { username, problemCode: problem.code, contestKey },
    { initialNumItems: PAGE_SIZE },
  );

  const more = live.status === "CanLoadMore" || live.status === "LoadingMore";
  const total = formatPoints(problem.points, precision);

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-3 py-2">
        <p className="truncate text-sm font-semibold">
          {t("title", { user: displayName, problem: problem.name })}
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {problem.label} · {problem.code}
        </p>
      </div>

      {live.status === "LoadingFirstPage" ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>
      ) : live.results.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ScrollArea className="max-h-96" viewportClassName="max-h-96">
          <ul>
            {live.results.map((row) => (
              <Attempt key={String(row._id)} row={row} total={total} precision={precision} />
            ))}
          </ul>
        </ScrollArea>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <Link
          href={`/contest/${contestKey}/submissions/${username}/`}
          className={cn("truncate rounded-xs text-sm text-link hover:underline", focusRing)}
        >
          {t("viewAll", { user: displayName })}
        </Link>
        {more ? (
          <Button
            variant="secondary"
            size="sm"
            busy={live.status === "LoadingMore"}
            disabled={live.status === "LoadingMore"}
            onClick={() => live.loadMore(PAGE_SIZE)}
          >
            {common("actions.showMore")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** One attempt, as `SubmissionRow` prints it with the columns a 28rem panel has
 *  room for: the verdict, the score, the usage, the language and the date. */
function Attempt({ row, total, precision }: { row: SubmissionListRow; total: string; precision: number }) {
  const t = useTranslations("contests.ranking.cell");
  const grading = isGrading(row.status);
  const numbers = !WITHOUT_NUMBERS.has(row.status);

  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        href={`/submission/${row.id}/`}
        aria-label={t("attempt", { id: row.id })}
        className={cn(
          "flex flex-col gap-0.5 px-3 py-2 transition-colors duration-(--dur-fast) hover:bg-row-hover",
          focusRingInset,
        )}
      >
        <span className="flex items-center gap-2">
          <VerdictPill
            verdict={verdictCode(row)}
            judging={grading}
            label={grading ? row.status : undefined}
          />
          <span className="font-mono text-sm font-medium tabular-nums">
            {numbers ? formatPoints(row.contestPoints ?? row.points ?? 0, precision) : DASH}
            <span className="text-muted-foreground">{` / ${total}`}</span>
          </span>
          <span className="ml-auto shrink-0 font-mono text-xs uppercase text-muted-foreground">
            {row.language?.shortName || row.language?.name || DASH}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 font-mono text-xs tabular-nums text-muted-foreground">
          <span>{numbers && row.result !== "TLE" ? formatTime(row.time) : DASH}</span>
          <span aria-hidden>·</span>
          <span>{numbers ? formatMemory(row.memory) : DASH}</span>
          <span aria-hidden>·</span>
          <time dateTime={new Date(row.date).toISOString()}>{absoluteTime(row.date)}</time>
        </span>
      </Link>
    </li>
  );
}
