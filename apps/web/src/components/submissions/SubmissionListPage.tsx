import { api } from "@convex/_generated/api";
import { RatingName, type TabItem, TitleRow } from "@moj/ui";
import type { FunctionArgs } from "convex/server";
import { BarChart3, List, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ErrorScreen } from "@/components/shell/ErrorScreen";
import { queryAsViewer } from "@/lib/convex-server";
import { loadListContext } from "@/lib/submissionsData";
import { SubmissionList, type SubmissionListFilters } from "./SubmissionList";

/** DMOJ's `paginate_by`. */
const PAGE_SIZE = 50;

type SubmissionsQuery = FunctionArgs<typeof api.submissions.list>;

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
  header,
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
  /** Chrome to draw instead of this page's own title and tabs. A contest's
   *  submissions belong to the contest and wear its heading, not the site's. */
  header?: ReactNode;
  /** `/problem/<code>/rank/`, only on a problem's own lists. */
  bestSubmissionsHref?: string;
  breadcrumb?: ReactNode;
}) {
  const t = await getTranslations("submissions.list");
  const context = await loadListContext(filters);

  if (!context.found) notFound();

  // `authInterrupts` is not enabled, so an access failure renders DMOJ's 403
  // page in place rather than throwing an interrupt.
  if (!context.allowed) {
    return <ErrorScreen code={403} id="AccessDenied" description={t("accessDenied")} />;
  }

  const status = listOf(searchParams.status);
  const language = listOf(searchParams.language);

  // DMOJ's statistics box counts the list's own queryset. The deployed query
  // counts globally or for one problem, so it is only asked for the lists it can
  // answer honestly.
  const wantsResults = !filters.username && !filters.contestKey;

  // An unset filter is left out rather than sent as undefined.
  const listArgs: SubmissionsQuery = {
    paginationOpts: { numItems: PAGE_SIZE, cursor: null },
    ...filters,
  };

  if (status.length > 0) listArgs.results = status;

  if (language.length > 0) listArgs.languageKeys = language;

  const [page, results] = await Promise.all([
    queryAsViewer(api.submissions.list, listArgs),
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
    { key: "all", label: t("tabAll"), href: allHref, icon: <List aria-hidden /> },
    ...(myHref ? [{ key: "mine", label: t("tabMine"), href: myHref, icon: <User aria-hidden /> }] : []),
    ...(bestSubmissionsHref
      ? [
          {
            key: "best",
            label: t("tabBest"),
            href: bestSubmissionsHref,
            icon: <BarChart3 aria-hidden />,
          },
        ]
      : []),
    ...(tab === "user" && context.user
      ? [
          {
            key: "user",
            label: t("tabUser", { username: context.user.username }),
            icon: <User aria-hidden />,
          },
        ]
      : []),
  ];

  return (
    <>
      {header ?? (
        <TitleRow
          title={await contentTitle(context, filters, isOwn)}
          breadcrumb={breadcrumb}
          tabs={tabs}
          active={tab === "user" ? "user" : tab === "mine" ? "mine" : "all"}
        />
      )}
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
          {...(await emptyCopy(context, isOwn))}
        />
      </div>
    </>
  );
}

/** DMOJ's `get_content_title`, with the same links inside it. */
async function contentTitle(
  context: Awaited<ReturnType<typeof loadListContext>>,
  filters: SubmissionListFilters,
  isOwn: boolean,
): Promise<ReactNode> {
  const t = await getTranslations("submissions.list");
  const viewedUser = context.user;
  const viewedProblem = context.problem;
  const viewedContest = context.contest;

  const user = viewedUser
    ? () => (
        <RatingName
          username={viewedUser.username}
          rating={viewedUser.rating}
          href={`/user/${viewedUser.username}`}
          isAdmin={viewedUser.displayRank === "admin"}
          className="text-h1"
        />
      )
    : null;

  const problem = viewedProblem
    ? () => (
        <Link href={`/problem/${viewedProblem.code}`} className="text-link hover:text-link-hover">
          {viewedProblem.name}
        </Link>
      )
    : null;

  const contest = viewedContest
    ? () => (
        <Link href={`/contest/${viewedContest.key}`} className="text-link hover:text-link-hover">
          {viewedContest.name}
        </Link>
      )
    : null;

  if (contest && problem && user) {
    return t.rich("titleUserProblemContest", { user, problem, contest });
  }

  if (contest && user) {
    return isOwn ? t.rich("titleMineContest", { contest }) : t.rich("titleUserContest", { user, contest });
  }

  if (problem && user) {
    return isOwn ? t.rich("titleMineProblem", { problem }) : t.rich("titleUserProblem", { user, problem });
  }

  if (problem) return t.rich("titleProblem", { problem });

  if (user) {
    return isOwn ? t("titleMine") : t.rich("titleUser", { user });
  }

  if (filters.contestKey) return t("titleContest");

  return t("titleAll");
}

/** Section 20.1: an empty state says what would fill this space. */
async function emptyCopy(
  context: Awaited<ReturnType<typeof loadListContext>>,
  isOwn: boolean,
): Promise<{ emptyTitle: string; emptyDescription: string; emptyAction?: { label: string; href: string } }> {
  const t = await getTranslations("submissions.list");
  const browse = { label: t("browseProblems"), href: "/problems/" };

  if (isOwn) {
    return {
      emptyTitle: t("emptyTitle"),
      emptyDescription: t("emptyMine"),
      emptyAction: browse,
    };
  }

  if (context.user) {
    return {
      emptyTitle: t("emptyTitle"),
      emptyDescription: t("emptyUser", { username: context.user.username }),
    };
  }

  if (context.problem) {
    return {
      emptyTitle: t("emptyTitle"),
      emptyDescription: t("emptyProblem", { problem: context.problem.name }),
    };
  }

  return {
    emptyTitle: t("emptyTitle"),
    emptyDescription: t("emptyAny"),
    emptyAction: browse,
  };
}
