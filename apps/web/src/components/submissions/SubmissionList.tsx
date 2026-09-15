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
import { type PaginatedQueryArgs, useConvex, useMutation, usePaginatedQuery } from "convex/react";
import { Inbox, PlugZap } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { verdictCode } from "@/lib/submissionFormat";
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

type SubmissionsQuery = PaginatedQueryArgs<typeof api.submissions.list>;

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
  /** `_get_result_data` for the statistics box, or `null` where the deployed
   *  query cannot answer for this list's queryset (see the note below). */
  results: ResultData | null;
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
  const t = useTranslations("submissions.list");
  const tAction = useTranslations("submissions.actions");
  const common = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedStatuses = useMemo(() => searchParams.getAll("status"), [searchParams]);
  const selectedLanguages = useMemo(() => searchParams.getAll("language"), [searchParams]);

  const queryArgs = useMemo(() => {
    // An unset filter is left out rather than sent as undefined, so the query
    // subscribes under the same key it would without the filter panel.
    const args: SubmissionsQuery = { ...filters };

    if (selectedStatuses.length > 0) args.results = selectedStatuses;

    if (selectedLanguages.length > 0) args.languageKeys = selectedLanguages;

    return args;
  }, [filters, selectedStatuses, selectedLanguages]);

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
        toast.success(tAction("rejudgeQueued", { id }));
      } else {
        const outcome = await abort({ submissionId: id });
        toast.success(outcome.pending ? tAction("abortAsked", { id }) : tAction("abortDone", { id }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tAction("failed"));
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
            {/* `submissions.resultsForProblem` counts globally or for one problem;
                it cannot count a user's or a contest's queryset the way DMOJ's
                `_get_result_data` does, so the box is left off rather than
                showing a total that is not this list's. */}
            {results ? <ResultsChart problemCode={filters.problemCode} initial={results} /> : null}
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
              title={t("noMatchTitle")}
              description={t("noMatchDescription")}
              action={
                <Button variant="secondary" onClick={() => setFilters({ status: [], language: [] })}>
                  {t("clearFilters")}
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

        {dynamic && rows.length > 0 && (live.status === "CanLoadMore" || live.status === "LoadingMore") ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              onClick={() => live.loadMore(PAGE_SIZE)}
              busy={live.status === "LoadingMore"}
              disabled={live.status === "LoadingMore"}
            >
              {live.status === "LoadingMore" ? common("states.loading") : t("showMore")}
            </Button>
          </div>
        ) : rows.length > 0 ? (
          <p className={cn("mt-4 text-center text-sm text-muted-foreground")}>
            {t("shown", { count: rows.length })}
          </p>
        ) : null}
      </TwoColumn>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "abort"
                ? tAction("abortTitle", { id: confirm?.id ?? "" })
                : tAction("rejudgeTitle", { id: confirm?.id ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "abort" ? tAction("abortDescription") : tAction("rejudgeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirmed}>
              {confirm?.kind === "abort" ? tAction("abort") : tAction("rejudge")}
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
  const t = useTranslations("submissions.list");
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
      <span className="min-w-0 flex-1">{t("disconnected")}</span>
      <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
        {t("reconnect")}
      </Button>
    </div>
  );
}
