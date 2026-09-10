import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { RankTable } from "@/components/problems/RankTable";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code }).catch(() => null);
  return { title: problem ? `Best solutions for ${problem.name}` : "No such problem" };
}

export default async function RankPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [problem, ranks] = await Promise.all([
    queryAsViewer(api.problems.get, { code }),
    queryAsViewer(api.problems.ranks, { code }),
  ]);
  if (!problem || !ranks) notFound();

  return (
    <ProblemPage problem={problem} active="rank" title={`Best solutions for ${problem.name}`}>
      <RankTable code={problem.code} initial={ranks} />
    </ProblemPage>
  );
}
