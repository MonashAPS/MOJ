"use client";

import { api } from "@convex/_generated/api";
import { Button, cn, EmptyState, Skeleton, VerdictPill, verdictTone } from "@moj/ui";
import { usePaginatedQuery } from "convex/react";
import { List } from "lucide-react";
import Link from "next/link";
import { UserLink } from "@/components/users/UserLink";
import { formatDateTime, formatRelative } from "@/lib/format";

/**
 * PLACEHOLDER. The submissions agent owns the real `SubmissionList`; this is the
 * same component name, in the same place, taking the same props, so the pages
 * that mount it are finished and the integrator can drop the real one in.
 *
 * It is DMOJ's `submission/list.html` row at the shape DESIGN.md section 12.2
 * describes: a 3px verdict rail, a score, the problem, then the author line, with
 * time and memory in the right column.
 */
export type SubmissionListProps = {
  /** `/submissions/user/<user>/` and the user page's Submissions tab. */
  username?: string;
  /** `/problem/<code>/submissions/`. */
  problemCode?: string;
  /** The in-contest lists. */
  contestKey?: string;
  /** Rows per request. */
  pageSize?: number;
  /** Shown when the filtered list is empty. */
  emptyTitle?: string;
  emptyDescription?: string;
};

const DASH = "—";

const RAIL: Record<string, string> = {
  good: "var(--v-good)",
  bad: "var(--v-bad)",
  warn: "var(--v-warn)",
  neutral: "var(--v-neutral)",
  run: "var(--v-run)",
  ie: "var(--v-ie)",
};

function memory(kb: number | null) {
  if (kb === null || kb === undefined) return DASH;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
}

export function SubmissionList({
  username,
  problemCode,
  contestKey,
  pageSize = 20,
  emptyTitle = "No submissions",
  emptyDescription = "There is nothing here yet.",
}: SubmissionListProps) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.submissions.list,
    { username, problemCode, contestKey },
    { initialNumItems: pageSize },
  );

  if (status === "LoadingFirstPage") {
    return (
      <div className="overflow-hidden rounded-md border border-border bg-card">
        {Array.from({ length: 6 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no identity
          <div key={index} className="flex h-[52px] items-center gap-3 border-b border-border px-3 last:border-b-0">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return <EmptyState icon={<List aria-hidden />} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border border-border bg-card">
        {results.map((row) => {
          const verdict = row.result ?? row.status;
          const tone = verdictTone(String(verdict));
          return (
            <div
              key={row._id}
              className="relative flex min-h-[52px] items-center gap-3 border-b border-border py-2 pl-4 pr-3 transition-colors duration-(--dur-fast) last:border-b-0 hover:bg-row-hover"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{ background: RAIL[tone] }}
              />
              <span className="w-20 shrink-0 font-mono text-sm tabular-nums">
                {row.points === null ? DASH : row.points}
                <span className="text-muted-foreground"> / {row.problem?.points ?? DASH}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  {row.problem ? (
                    <Link href={`/problem/${row.problem.code}/`} className="font-medium hover:text-link">
                      {row.problem.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-muted-foreground">{DASH}</span>
                  )}
                  <VerdictPill verdict={String(verdict)} judging={tone === "run"} />
                  <span className="font-mono text-xs uppercase text-muted-foreground">
                    {row.language?.shortName || row.language?.key || DASH}
                  </span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                  {row.user ? (
                    <UserLink
                      username={row.user.username}
                      rating={row.user.rating}
                      displayRank={row.user.displayRank}
                    />
                  ) : null}
                  <span aria-hidden>·</span>
                  <Link
                    href={`/submission/${row.id}/`}
                    title={formatDateTime(row.date)}
                    className="hover:text-link"
                  >
                    {formatRelative(row.date)}
                  </Link>
                </span>
              </span>
              <span className={cn("shrink-0 text-right font-mono text-sm tabular-nums")}>
                <span className="block text-foreground">
                  {row.time === null ? DASH : `${row.time.toFixed(2)}s`}
                </span>
                <span className="block text-muted-foreground">{memory(row.memory)}</span>
              </span>
            </div>
          );
        })}
      </div>
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="mt-3 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(pageSize)}
          >
            {status === "LoadingMore" ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
