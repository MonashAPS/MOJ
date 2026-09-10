import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NewTicketForm } from "@/components/tickets/NewTicketForm";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props) {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code }).catch(() => null);
  return { title: problem ? `New ticket for ${problem.name}` : "Page not found" };
}

/** `NewProblemTicketView` (judge/views/ticket.py:80), the "Report an issue" target
 *  on a problem page. */
export default async function NewProblemTicketPage({ params }: Props) {
  const { code } = await params;
  const [problem, viewerState] = await Promise.all([
    queryAsViewer(api.problems.get, { code }).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (!viewerState?.profile) {
    redirect(`/accounts/login/?next=/problem/${encodeURIComponent(code)}/tickets/new/`);
  }
  if (!problem) notFound();

  return (
    <>
      <TitleRow
        title={
          <>
            New ticket for{" "}
            <Link href={`/problem/${problem.code}/`} className="text-link">
              {problem.name}
            </Link>
          </>
        }
      />
      <div id="content-body" className="max-w-[760px]">
        <NewTicketForm problemCode={problem.code} showGuideline={!viewerState.inContest} />
      </div>
    </>
  );
}
