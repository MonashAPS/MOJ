import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { ProblemHeader } from "@/components/problems/ProblemHeader";
import { SubmitForm } from "@/components/problems/SubmitForm";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code }).catch(() => null);
  return { title: problem ? `Submit to ${problem.name}` : "No such problem" };
}

/** DMOJ's `problem_submit` with a submission id: the same form, prefilled with
 *  that submission's source and language. */
export default async function ResubmitPage({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const numeric = Number(id);
  const [problem, previous] = await Promise.all([
    queryAsViewer(api.problems.get, { code }),
    queryAsViewer(api.submissions.resubmit, {
      submissionId: Number.isFinite(numeric) ? numeric : id,
    }).catch(() => null),
  ]);
  if (!problem || !previous) notFound();
  if (!problem.canSubmit) forbidden();

  return (
    <>
      <ProblemHeader problem={problem} active="submit" title={`Submit to ${problem.name}`} />
      <div id="content-body">
        <SubmitForm
          problemCode={problem.code}
          problemName={problem.name}
          defaultLanguageKey={previous.languageKey}
          initialSource={previous.source}
          canPinJudge={problem.canEdit}
          submissionsLeft={problem.contestProblem?.submissionsLeft ?? null}
        />
      </div>
    </>
  );
}
