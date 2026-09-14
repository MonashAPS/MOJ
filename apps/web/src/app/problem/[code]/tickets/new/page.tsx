import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NewTicketForm } from "@/components/tickets/NewTicketForm";
import { queryAsViewer } from "@/lib/convex-server";
import { viewerLanguage } from "@/lib/language.server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props) {
  const t = await getTranslations("problems.tickets");
  const states = await getTranslations("common.states");
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }).catch(
    () => null,
  );
  return {
    title: problem
      ? t.markup("newTitle", { name: problem.name, link: (chunks) => chunks })
      : states("notFound"),
  };
}

/** `NewProblemTicketView` (judge/views/ticket.py:80), the "Report an issue" target
 *  on a problem page. */
export default async function NewProblemTicketPage({ params }: Props) {
  const t = await getTranslations("problems.tickets");
  const { code } = await params;
  const [problem, viewerState] = await Promise.all([
    queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (!viewerState?.profile) {
    redirect(`/accounts/login/?next=/problem/${encodeURIComponent(code)}/tickets/new/`);
  }
  if (!problem) notFound();

  return (
    <>
      <TitleRow
        title={t.rich("newTitle", {
          name: problem.name,
          link: (chunks) => (
            <Link href={`/problem/${problem.code}/`} className="text-link">
              {chunks}
            </Link>
          ),
        })}
      />
      <div id="content-body" className="max-w-[760px]">
        <NewTicketForm problemCode={problem.code} showGuideline={!viewerState.inContest} />
      </div>
    </>
  );
}
