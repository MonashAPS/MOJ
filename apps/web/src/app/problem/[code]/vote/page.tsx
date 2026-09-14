import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { VoteView } from "@/components/problems/VoteView";
import { queryAsViewer } from "@/lib/convex-server";
import { viewerLanguage } from "@/lib/language.server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const t = await getTranslations("problems");
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }).catch(
    () => null,
  );
  return {
    title: problem ? t("vote.titleFor", { name: problem.statement.name }) : t("detail.noSuchProblem"),
  };
}

export default async function VotePage({ params }: { params: Promise<{ code: string }> }) {
  const t = await getTranslations("problems.vote");
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code, language: await viewerLanguage() });
  if (!problem) notFound();
  if (!problem.viewer.canViewVotes) forbidden();

  return (
    <ProblemPage problem={problem} active="vote" title={t("titleFor", { name: problem.statement.name })}>
      <VoteView
        code={problem.code}
        canVote={problem.viewer.canVote}
        initialVote={problem.viewer.vote}
        currentPoints={problem.points}
      />
    </ProblemPage>
  );
}
