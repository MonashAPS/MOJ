"use client";

import { api } from "@convex/_generated/api";
import type { SubmissionListRow } from "@convex/submissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  EmptyState,
  TwoColumn,
  toast,
  verdictTone,
} from "@moj/ui";
import { useConvex, useMutation, usePaginatedQuery } from "convex/react";
import { Inbox, PlugZap } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { plural, verdictCode } from "@/lib/submissionFormat";
import type { ListContext } from "@/lib/submissionsData";
import { type ResultData, ResultsChart } from "./ResultsChart";
import { SubmissionFilters } from "./SubmissionFilters";
import { SubmissionListSkeleton } from "./SubmissionListSkeleton";
import { SubmissionRow } from "./SubmissionRow";

/** DMOJ's `paginate_by`. */
const PAGE_SIZE = 50;

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export type SubmissionListFilters = {
  username?: string;
  problemCode?: string;
  contestKey?: string;
};

export type SubmissionListProps = {
  /** The `submissions.list` filter arguments this list is pinned to. */
  filters: SubmissionListFilters;
  /** DMOJ's `show_problem`: off on a problem's own list. */
  showProblem?: boolean;
  /** DMOJ's `dynamic_update`. When false the list renders the server's page and
   *  does not subscribe — used where a list cannot change under the viewer. */
  dynamic?: boolean;
  /** The first page, fetched on the server so the list has content on first paint. */
  initialPage: SubmissionListRow[];
  /** The filters that first page was fetched with, so a filter change does not
   *  briefly show the server's rows again. */
  initialFilters: { status: string[]; language: string[] };
  /** Everything the filter panel and the row affordances need. */
  context: ListContext;
  /** `_get_result_data` for the statistics box. */
  results: ResultData;
  /** The server's clock, so relative times match before hydration. */
  now: number;
  /** Where the "my submissions" quick link points. */
  myHref: string | null;
  /** An empty list says what would fill it. */
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: { label: string; href: string };
};

/**
 * Every submission list DMOJ has, as one component: `/submissions/`,
 * `/submissions/user/<u>/`, `/problem/<c>/submissions/[<u>/]` and the contest
 * variants. The rows come live from `submissions.list` through
 * `usePaginatedQuery`, so a row that is being judged updates in place.
 */
export function SubmissionList({
  filters,
  showProblem = true,
  dynamic = true,
  initialPage,
  initialFilters,
  context,
  results,
  now,
  myHref,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: SubmissionListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedStatuses = useMemo(() => searchParams.getAll("status"), [searchParams]);
  const selectedLanguages = useMemo(() => searchParams.getAll("language"), [searchParams]);

  const queryArgs = useMemo(
    () => ({
      ...filters,
      ...(selectedStatuses.length > 0 ? { results: selectedStatuses } : {}),
      ...(selectedLanguages.length > 0 ? { languageKeys: selectedLanguages } : {}),
    }),
    [filters, selectedStatuses, selectedLanguages],
  );

  const live = usePaginatedQuery(api.submissions.list, dynamic ? queryArgs : "skip", {
    initialNumItems: PAGE_SIZE,
  });

  const filtered = selectedStatuses.length > 0 || selectedLanguages.length > 0;
  const asServerFetched =
    same(selectedStatuses, initialFilters.status) && same(selectedLanguages, initialFilters.language);
  const loadingFirst = dynamic && live.status === "LoadingFirstPage";
  const usingServerPage = !dynamic || (loadingFirst && asServerFetched);
  const rows = usingServerPage ? initialPage : live.results;
  const showSkeleton = loadingFirst && !usingServerPage;

  /** New rows fade in once; a row that was already on screen never re-animates. */
  const seen = useRef<Set<string>>(new Set());
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current && rows.length > 0) {
      for (const row of rows) seen.current.add(String(row._id));
      settled.current = true;
    }
  }, [rows]);

  const rejudge = useMutation(api.submissions.rejudge);
  const abort = useMutation(api.submissions.abort);
  const [confirm, setConfirm] = useState<{ kind: "rejudge" | "abort"; id: number | string } | null>(null);

  const setFilters = useCallback(
    (next: { status?: string[]; language?: string[] }) => {
      const params = new URLSearchParams();
      for (const value of next.status ?? selectedStatuses) params.append("status", value);
      for (const value of next.language ?? selectedLanguages) params.append("language", value);
      const query = params.toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
    },
    [router, selectedStatuses, selectedLanguages],
  );

  const permissions = useMemo(
    () => ({
      username: context.viewer?.username ?? null,
      canRejudge: context.viewer?.canRejudge ?? false,
      canAbortAny: context.viewer?.canAbortAny ?? false,
      canEditAllProblems: context.viewer?.canEditAllProblems ?? false,
      problemEditable: context.problem?.editable ?? false,
    }),
    [context],
  );

  async function runConfirmed() {
    if (!confirm) return;
    const { kind, id } = confirm;
    setConfirm(null);
    try {
      if (kind === "rejudge") {
        await rejudge({ submissionId: id });
        toast.success(`Submission ${id} queued for rejudging.`);
      } else {
        const outcome = await abort({ submissionId: id });
        toast.success(
          outcome.pending ? `Asked the judge to stop submission ${id}.` : `Submission ${id} aborted.`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    }
  }

  return (
    <>
      <TwoColumn
        side={
          <>
            <SubmissionFilters
              statuses={context.statuses.map((status) => ({ value: status.code, label: status.name }))}
              languages={context.languages.map((language) => ({
                value: language.key,
                label: language.name,
              }))}
              selectedStatuses={selectedStatuses}
              selectedLanguages={selectedLanguages}
              onChange={setFilters}
              onReset={() => setFilters({ status: [], language: [] })}
              myUsername={context.viewer?.username ?? null}
              myHref={myHref}
              userSearchHref={(username) =>
                filters.problemCode
                  ? `/problem/${filters.problemCode}/submissions/${username}/`
                  : `/submissions/user/${username}/`
              }
            />
            <ResultsChart problemCode={filters.problemCode} initial={results} />
          </>
        }
      >
        <Disconnected />

        {showSkeleton ? (
          <SubmissionListSkeleton />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<Inbox aria-hidden />}
              title="Nothing matches"
              description="No submissions match these filters."
              action={
                <Button variant="secondary" onClick={() => setFilters({ status: [], language: [] })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Inbox aria-hidden />}
              title={emptyTitle}
              description={emptyDescription}
              action={
                emptyAction ? (
                  <Button variant="secondary" asChild>
                    <a href={emptyAction.href}>{emptyAction.label}</a>
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <ul className="overflow-hidden rounded-md border border-border bg-card">
            {rows.map((row) => (
              <SubmissionRow
                key={String(row._id)}
                row={row}
                tone={verdictTone(verdictCode(row))}
                showProblem={showProblem}
                permissions={permissions}
                now={now}
                isNew={settled.current && !seen.current.has(String(row._id))}
                onRejudge={(id) => setConfirm({ kind: "rejudge", id })}
                onAbort={(id) => setConfirm({ kind: "abort", id })}
              />
            ))}
          </ul>
        )}

        {dynamic && (live.status === "CanLoadMore" || live.status === "LoadingMore") ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              onClick={() => live.loadMore(PAGE_SIZE)}
              busy={live.status === "LoadingMore"}
              disabled={live.status === "LoadingMore"}
            >
              {live.status === "LoadingMore" ? "Loading…" : "Show more submissions"}
            </Button>
          </div>
        ) : rows.length > 0 ? (
          <p className={cn("mt-4 text-center text-sm text-muted-foreground")}>
            {plural(rows.length, "submission")} shown.
          </p>
        ) : null}
      </TwoColumn>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "abort"
                ? `Abort submission ${confirm?.id}?`
                : `Rejudge submission ${confirm?.id}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "abort"
                ? "Judging stops where it is and the submission is marked aborted. It keeps no score."
                : "The submission goes back into the queue and its verdict, points and case results are replaced."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirmed}>
              {confirm?.kind === "abort" ? "Abort" : "Rejudge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * DMOJ's full-width red "You were disconnected" band becomes a warning strip
 * with a Reconnect action, and it does not push the list down.
 */
function Disconnected() {
  const convex = useConvex();
  const [down, setDown] = useState(false);

  useEffect(() => {
    const apply = (connected: boolean) =>
      setDown((previous) => (previous === !connected ? previous : !connected));
    apply(convex.connectionState().isWebSocketConnected);
    return convex.subscribeToConnectionState((state) => apply(state.isWebSocketConnected));
  }, [convex]);

  if (!down) return null;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-md border border-warning-line bg-warning-bg px-3 py-2 text-sm text-warning-ink">
      <PlugZap aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">You were disconnected, so this list has stopped updating.</span>
      <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
        Reconnect
      </Button>
    </div>
  );
}
