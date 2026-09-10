"use client";

import { api } from "@convex/_generated/api";
import { Button, cn, EmptyState, RatingName, Skeleton, VerdictPill, verdictTone } from "@moj/ui";
import { usePaginatedQuery } from "convex/react";
import { ListChecks } from "lucide-react";
import Link from "next/link";
import { formatRelative } from "@/lib/format";
import { formatMemory, formatPoints, formatTime } from "@/lib/units";

export type SubmissionListProps = {
  username?: string;
  problemCode?: string;
  contestKey?: string;
  languageKeys?: string[];
  results?: string[];
  /** Shown inside the empty state when the list comes back empty. */
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
};

/**
 * Placeholder. The submissions agent owns the real component; this one keeps the
 * same props and draws DMOJ's two-line row so the problem pages are usable.
 */
export function SubmissionList({
  username,
  problemCode,
  contestKey,
  languageKeys,
  results,
  emptyTitle = "No submissions yet",
  emptyDescription = "No submissions yet.",
  pageSize = 20,
}: SubmissionListProps) {
  const {
    results: rows,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.submissions.list,
    { username, problemCode, contestKey, languageKeys, results },
    { initialNumItems: pageSize },
  );

  if (status === "LoadingFirstPage") {
    return (
      <div className="overflow-hidden rounded-md border border-border bg-card">
        {Array.from({ length: 8 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no identity
          <Skeleton key={index} className="h-[52px] rounded-none border-b border-border last:border-b-0" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState icon={<ListChecks size={20} />} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div>
      <ol className="overflow-hidden rounded-md border border-border bg-card">
        {rows.map((row) => (
          <li
            key={row._id}
            className="relative flex items-center gap-3 border-b border-border py-2 pl-4 pr-3 last:border-b-0 hover:bg-row-hover"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[3px]"
              style={{ background: `var(--v-${verdictTone(row.result ?? "QU")})` }}
            />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                  {formatPoints(row.contestPoints ?? row.points ?? 0)}
                  <span className="text-muted-foreground"> / {formatPoints(row.problem?.points ?? 0)}</span>
                </span>
                <Link
                  href={`/submission/${row.id}`}
                  className="truncate font-medium text-foreground hover:text-link"
                >
                  {row.problem?.name ?? "Unknown problem"}
                </Link>
                {row.result ? <VerdictPill verdict={row.result} /> : null}
                {row.language ? (
                  <span className="font-mono text-xs uppercase text-muted-foreground">
                    {row.language.shortName || row.language.name}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                {row.user ? (
                  <RatingName
                    username={row.user.username}
                    rating={row.user.rating}
                    href={`/user/${row.user.username}`}
                    isAdmin={row.user.displayRank === "admin"}
                  />
                ) : null}
                <span aria-hidden>·</span>
                <time dateTime={new Date(row.date).toISOString()} title={new Date(row.date).toISOString()}>
                  {formatRelative(row.date)}
                </time>
              </p>
            </div>
            <div className={cn("shrink-0 text-right font-mono text-sm tabular-nums")}>
              <div className="text-foreground">{formatTime(row.time)}</div>
              <div className="text-muted-foreground">{formatMemory(row.memory)}</div>
            </div>
          </li>
        ))}
      </ol>
      {status === "CanLoadMore" ? (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" onClick={() => loadMore(pageSize)}>
            Show more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default SubmissionList;
