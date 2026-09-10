import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { SubmissionList } from "@/components/submissions/SubmissionList";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string; user: string }>;
}): Promise<Metadata> {
  const { code, user } = await params;
  const problem = await queryAsViewer(api.problems.get, { code }).catch(() => null);
  return { title: problem ? `${user}'s submissions for ${problem.name}` : "No such problem" };
}

export default async function UserProblemSubmissionsPage({
  params,
}: {
  params: Promise<{ code: string; user: string }>;
}) {
  const { code, user } = await params;
  const [problem, viewerState] = await Promise.all([
    queryAsViewer(api.problems.get, { code }),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);
  if (!problem) notFound();

  const mine = viewerState?.profile?.username === user;

  return (
    <ProblemPage problem={problem} active="submissions" title={`${user}'s submissions for ${problem.name}`}>
      <SubmissionList
        problemCode={problem.code}
        username={user}
        emptyTitle="Nothing submitted"
        emptyDescription={
          mine
            ? `You haven't submitted to ${problem.name} yet.`
            : `${user} hasn't submitted to ${problem.name} yet.`
        }
      />
    </ProblemPage>
  );
}
