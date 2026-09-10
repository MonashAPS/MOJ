import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { SubmissionList } from "@/components/submissions/SubmissionList";
import { queryAsViewer } from "@/lib/convex-server";
import { viewerLanguage } from "@/lib/language.server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }).catch(
    () => null,
  );
  return { title: problem ? `All submissions for ${problem.statement.name}` : "No such problem" };
}

export default async function ProblemSubmissionsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code, language: await viewerLanguage() });
  if (!problem) notFound();

  return (
    <ProblemPage
      problem={problem}
      active="submissions"
      title={`All submissions for ${problem.statement.name}`}
    >
      <SubmissionList
        problemCode={problem.code}
        emptyTitle="Nothing submitted"
        emptyDescription={`Nobody has submitted to ${problem.statement.name} yet.`}
      />
    </ProblemPage>
  );
}
