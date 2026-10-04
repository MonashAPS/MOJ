import { api } from "@convex/_generated/api";
import { Button } from "@moj/ui";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ContestLink } from "@/components/ContestLink";
import { TitleRow } from "@/components/shell/PageTabs";
import { contestHref } from "@/lib/contest-context";
import { requireContestProblem } from "@/lib/contest-resource.server";
import { queryAsViewer } from "@/lib/convex-server";
import { loadProblem } from "@/lib/problem.server";
import { scopeFromParams, ticketQueryArgs } from "../../../tickets/filters";
import { TicketsClient } from "../../../tickets/TicketsClient";

type Props = {
  params: Promise<{ code: string }>;
  browsingKey?: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: Props) {
  const t = await getTranslations("problems.tickets");
  const states = await getTranslations("common.states");
  const { code } = await params;

  const problem = await loadProblem(code).catch(() => null);

  return {
    title: problem
      ? t.markup("listTitle", { name: problem.name, link: (chunks) => chunks })
      : states("notFound"),
  };
}

/** `ProblemTicketListView` (judge/views/ticket.py:284): the same list, narrowed to
 *  one problem, and narrowed again to the viewer's own tickets unless they can
 *  edit it. */
export default async function ProblemTicketsPage({ params, searchParams, browsingKey }: Props) {
  const t = await getTranslations("problems.tickets");
  const detail = await getTranslations("problems.detail");
  const { code } = await params;
  const query = await searchParams;

  const [problem, viewerState] = await Promise.all([
    loadProblem(code).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (browsingKey) await requireContestProblem(browsingKey, code);

  if (!viewerState?.profile) {
    const search = new URLSearchParams();

    for (const [name, value] of Object.entries(query)) {
      for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value])
        search.append(name, entry);
    }

    const suffix = search.size ? `?${search}` : "";
    const next = contestHref(`/problem/${code}/tickets/${suffix}`, browsingKey ?? null);
    redirect(`/accounts/login/?next=${encodeURIComponent(next)}`);
  }

  if (!problem) notFound();

  const scope = scopeFromParams(one(query.scope));
  const onlyOpen = one(query.open) === "1";
  const page = Math.max(1, Number(one(query.page) ?? 1) || 1);
  const args = ticketQueryArgs(scope, onlyOpen, page, problem.code);

  const initial = await queryAsViewer(api.tickets.list, args).catch(() => ({
    page: [],
    isDone: true,
    continueCursor: "0",
    totalCount: 0,
  }));

  return (
    <>
      <TitleRow
        title={t.rich("listTitle", {
          name: problem.name,
          link: (chunks) => (
            <ContestLink href={`/problem/${problem.code}/`} className="text-link">
              {chunks}
            </ContestLink>
          ),
        })}
        action={
          <Button asChild>
            <ContestLink href={`/problem/${problem.code}/tickets/new/`}>{detail("reportIssue")}</ContestLink>
          </Button>
        }
      />
      <div id="content-body">
        <TicketsClient
          initial={initial}
          initialKey={JSON.stringify(args)}
          viewerProfileId={viewerState.profile._id}
          problemCode={problem.code}
        />
      </div>
    </>
  );
}
