import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { SubmitForm } from "@/components/problems/SubmitForm";
import { queryAsViewer } from "@/lib/convex-server";
import { viewerLanguage } from "@/lib/language.server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }).catch(
    () => null,
  );
  return { title: problem ? `Submit to ${problem.statement.name}` : "No such problem" };
}

export default async function SubmitPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code, language: await viewerLanguage() });
  if (!problem) notFound();
  if (!problem.canSubmit) forbidden();

  return (
    <ProblemPage problem={problem} active="submit" title={`Submit to ${problem.statement.name}`}>
      <SubmitForm
        problemCode={problem.code}
        problemName={problem.name}
        defaultLanguageKey={null}
        canPinJudge={problem.canEdit}
        submissionsLeft={problem.contestProblem?.submissionsLeft ?? null}
      />
    </ProblemPage>
  );
}
