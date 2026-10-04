import { api } from "@convex/_generated/api";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ContestLink } from "@/components/ContestLink";
import { TitleRow } from "@/components/shell/PageTabs";
import { NewTicketForm } from "@/components/tickets/NewTicketForm";
import { contestHref } from "@/lib/contest-context";
import { requireContestProblem } from "@/lib/contest-resource.server";
import { queryAsViewer } from "@/lib/convex-server";
import { loadProblem } from "@/lib/problem.server";

type Props = { params: Promise<{ code: string }>; browsingKey?: string };

export async function generateMetadata({ params }: Props) {
  const t = await getTranslations("problems.tickets");
  const states = await getTranslations("common.states");
  const { code } = await params;

  const problem = await loadProblem(code).catch(() => null);

  return {
    title: problem
      ? t.markup("newTitle", { name: problem.name, link: (chunks) => chunks })
      : states("notFound"),
  };
}

/** `NewProblemTicketView` (judge/views/ticket.py:80), the "Report an issue" target
 *  on a problem page. */
export default async function NewProblemTicketPage({ params, browsingKey }: Props) {
  const t = await getTranslations("problems.tickets");
  const { code } = await params;

  const [problem, viewerState] = await Promise.all([
    loadProblem(code).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (browsingKey) await requireContestProblem(browsingKey, code);

  if (!viewerState?.profile) {
    redirect(
      `/accounts/login/?next=${encodeURIComponent(contestHref(`/problem/${code}/tickets/new/`, browsingKey ?? null))}`,
    );
  }

  if (!problem) notFound();

  return (
    <>
      <TitleRow
        title={t.rich("newTitle", {
          name: problem.name,
          link: (chunks) => (
            <ContestLink href={`/problem/${problem.code}/`} className="text-link">
              {chunks}
            </ContestLink>
          ),
        })}
      />
      <div id="content-body" className="max-w-[760px]">
        <NewTicketForm problemCode={problem.code} showGuideline={!viewerState.inContest} />
      </div>
    </>
  );
}
