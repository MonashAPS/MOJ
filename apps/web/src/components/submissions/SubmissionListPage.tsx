import { api } from "@convex/_generated/api";
import { RatingName, type TabItem, TitleRow } from "@moj/ui";
import { BarChart3, List, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";
import { queryAsViewer } from "@/lib/convex-server";
import { loadListContext } from "@/lib/submissionsData";
import { SubmissionList, type SubmissionListFilters } from "./SubmissionList";

/** DMOJ's `paginate_by`. */
const PAGE_SIZE = 50;

export type SearchParams = Record<string, string | string[] | undefined>;

function listOf(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Everything the five submission-list routes share: the access checks, the
 * server's first page, the tab bar from `submission/submission-list-tabs.html`
 * and DMOJ's `content_title`.
 */
export async function SubmissionListPage({
  filters,
  showProblem = true,
  dynamic = true,
  searchParams,
  tab,
  bestSubmissionsHref,
  breadcrumb,
}: {
  filters: SubmissionListFilters;
  showProblem?: boolean;
  dynamic?: boolean;
  searchParams: SearchParams;
  /** Which tab the current view is; DMOJ's `tab`. */
  tab: "all" | "mine" | "user";
  /** `/problem/<code>/rank/`, only on a problem's own lists. */
  bestSubmissionsHref?: string;
  breadcrumb?: ReactNode;
}) {
  const context = await loadListContext(filters);
  if (!context.found) notFound();
  // `authInterrupts` is not enabled, so an access failure renders DMOJ's 403
  // page in place rather than throwing an interrupt.
  if (!context.allowed) {
    return <ErrorScreen code={403} id="AccessDenied" description="Access denied" />;
  }

  const status = listOf(searchParams.status);
  const language = listOf(searchParams.language);

  // DMOJ's statistics box counts the list's own queryset. The deployed query
  // counts globally or for one problem, so it is only asked for the lists it can
  // answer honestly.
  const wantsResults = !filters.username && !filters.contestKey;
  const [page, results] = await Promise.all([
    queryAsViewer(api.submissions.list, {
      paginationOpts: { numItems: PAGE_SIZE, cursor: null },
      ...filters,
      ...(status.length > 0 ? { results: status } : {}),
      ...(language.length > 0 ? { languageKeys: language } : {}),
    }),
    wantsResults
      ? queryAsViewer(
          api.submissions.resultsForProblem,
          filters.problemCode ? { problemCode: filters.problemCode } : {},
        )
      : null,
  ]);

  const me = context.viewer?.username ?? null;
  const isOwn = context.user?.isSelf ?? false;

  const allHref = filters.problemCode ? `/problem/${filters.problemCode}/submissions/` : "/submissions/";
  const myHref = me
    ? filters.problemCode
      ? `/problem/${filters.problemCode}/submissions/${me}/`
      : `/submissions/user/${me}/`
    : null;
  const tabs: TabItem[] = [
    { key: "all", label: "All", href: allHref, icon: <List aria-hidden /> },
    ...(myHref ? [{ key: "mine", label: "Mine", href: myHref, icon: <User aria-hidden /> }] : []),
    ...(bestSubmissionsHref
      ? [
          {
            key: "best",
            label: "Best",
            href: bestSubmissionsHref,
            icon: <BarChart3 aria-hidden />,
          },
        ]
      : []),
    ...(tab === "user" && context.user
      ? [
          {
            key: "user",
            label: `${context.user.username}'s`,
            icon: <User aria-hidden />,
          },
        ]
      : []),
  ];

  return (
    <>
      <TitleRow
        title={contentTitle(context, filters, isOwn)}
        breadcrumb={breadcrumb}
        tabs={tabs}
        active={tab === "user" ? "user" : tab === "mine" ? "mine" : "all"}
      />
      <div id="content-body">
        <SubmissionList
          filters={filters}
          showProblem={showProblem}
          dynamic={dynamic}
          initialPage={page.page}
          initialFilters={{ status, language }}
          context={context}
          results={results}
          now={Date.now()}
          myHref={myHref}
          {...emptyCopy(context, isOwn)}
        />
      </div>
    </>
  );
}

/** DMOJ's `get_content_title`, with the same links inside it. */
function contentTitle(
  context: Awaited<ReturnType<typeof loadListContext>>,
  filters: SubmissionListFilters,
  isOwn: boolean,
): ReactNode {
  const user = context.user ? (
    <RatingName
      username={context.user.username}
      rating={context.user.rating}
      href={`/user/${context.user.username}`}
      isAdmin={context.user.displayRank === "admin"}
      className="text-h1"
    />
  ) : null;
  const problem = context.problem ? (
    <Link href={`/problem/${context.problem.code}`} className="text-link hover:text-link-hover">
      {context.problem.name}
    </Link>
  ) : null;
  const contest = context.contest ? (
    <Link href={`/contest/${context.contest.key}`} className="text-link hover:text-link-hover">
      {context.contest.name}
    </Link>
  ) : null;

  if (contest && problem && user) {
    return (
      <>
        {user}'s submissions for {problem} in {contest}
      </>
    );
  }
  if (contest && user) {
    return isOwn ? (
      <>My submissions in {contest}</>
    ) : (
      <>
        {user}'s submissions in {contest}
      </>
    );
  }
  if (problem && user) {
    return isOwn ? (
      <>My submissions for {problem}</>
    ) : (
      <>
        {user}'s submissions for {problem}
      </>
    );
  }
  if (problem) return <>All submissions for {problem}</>;
  if (user) {
    return isOwn ? <>All my submissions</> : <>All submissions by {user}</>;
  }
  if (filters.contestKey) return <>Contest submissions</>;
  return <>All submissions</>;
}

/** Section 20.1: an empty state says what would fill this space. */
function emptyCopy(
  context: Awaited<ReturnType<typeof loadListContext>>,
  isOwn: boolean,
): { emptyTitle: string; emptyDescription: string; emptyAction?: { label: string; href: string } } {
  if (isOwn) {
    return {
      emptyTitle: "No submissions yet",
      emptyDescription: "You haven't submitted anything yet.",
      emptyAction: { label: "Browse problems", href: "/problems/" },
    };
  }
  if (context.user) {
    return {
      emptyTitle: "No submissions yet",
      emptyDescription: `${context.user.username} hasn't submitted anything yet.`,
    };
  }
  if (context.problem) {
    return {
      emptyTitle: "No submissions yet",
      emptyDescription: `Nobody has submitted a solution to ${context.problem.name} yet.`,
    };
  }
  return {
    emptyTitle: "No submissions yet",
    emptyDescription: "Nothing has been submitted to the judge yet.",
    emptyAction: { label: "Browse problems", href: "/problems/" },
  };
}
