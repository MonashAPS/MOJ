import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { ProblemHeader } from "@/components/problems/ProblemHeader";
import { TestDataEditor } from "@/components/problems/TestDataEditor";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code }).catch(() => null);
  return { title: problem ? `Editing data for ${problem.name}` : "No such problem" };
}

export default async function TestDataPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code });
  if (!problem) notFound();
  if (!problem.canEdit) forbidden();

  const data = await queryAsViewer(api.problemData.get, { code }).catch(() => null);
  if (!data) forbidden();

  return (
    <>
      <ProblemHeader problem={problem} active="test_data" title={`Editing data for ${problem.name}`} />
      <div id="content-body">
        <TestDataEditor code={problem.code} initial={data} />
      </div>
    </>
  );
}
