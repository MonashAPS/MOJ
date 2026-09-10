import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProblemHeader } from "@/components/problems/ProblemHeader";
import { SubmissionList } from "@/components/submissions/SubmissionList";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code }).catch(() => null);
  return { title: problem ? `All submissions for ${problem.name}` : "No such problem" };
}

export default async function ProblemSubmissionsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code });
  if (!problem) notFound();

  return (
    <>
      <ProblemHeader problem={problem} active="submissions" title={`All submissions for ${problem.name}`} />
      <div id="content-body">
        <SubmissionList
          problemCode={problem.code}
          emptyTitle="Nothing submitted"
          emptyDescription={`Nobody has submitted to ${problem.name} yet.`}
        />
      </div>
    </>
  );
}
