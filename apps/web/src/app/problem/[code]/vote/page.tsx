import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { VoteView } from "@/components/problems/VoteView";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code }).catch(() => null);
  return { title: problem ? `Points vote for ${problem.name}` : "No such problem" };
}

export default async function VotePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code });
  if (!problem) notFound();
  if (!problem.viewer.canViewVotes) forbidden();

  return (
    <ProblemPage problem={problem} active="vote" title={`Points vote for ${problem.name}`}>
      <VoteView
        code={problem.code}
        canVote={problem.viewer.canVote}
        initialVote={problem.viewer.vote}
        currentPoints={problem.points}
      />
    </ProblemPage>
  );
}
