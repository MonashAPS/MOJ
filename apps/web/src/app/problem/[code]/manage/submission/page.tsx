import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { ManageSubmissions } from "@/components/problems/ManageSubmissions";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { query, queryAsViewer } from "@/lib/convex-server";
import { viewerLanguage } from "@/lib/language.server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }).catch(
    () => null,
  );
  return { title: problem ? `Managing submissions for ${problem.statement.name}` : "No such problem" };
}

export default async function ManageSubmissionsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [problem, languages] = await Promise.all([
    queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }),
    query(api.languages.list, {}).catch(() => []),
  ]);
  if (!problem) notFound();
  if (!problem.canManageSubmissions) forbidden();

  return (
    <ProblemPage
      problem={problem}
      active="manage"
      title={`Managing submissions for ${problem.statement.name}`}
    >
      <ManageSubmissions
        problemCode={problem.code}
        problemName={problem.name}
        languages={languages.map((language) => ({ key: language.key, name: language.name }))}
        canRejudge={problem.canManageSubmissions}
      />
    </ProblemPage>
  );
}
