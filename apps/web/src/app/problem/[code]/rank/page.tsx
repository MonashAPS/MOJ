import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { RankTable } from "@/components/problems/RankTable";
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
    title: problem ? t("rank.titleFor", { name: problem.statement.name }) : t("detail.noSuchProblem"),
  };
}

export default async function RankPage({ params }: { params: Promise<{ code: string }> }) {
  const t = await getTranslations("problems.rank");
  const { code } = await params;

  const [problem, ranks] = await Promise.all([
    queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }),
    queryAsViewer(api.problems.ranks, { code }),
  ]);

  if (!problem || !ranks) notFound();

  return (
    <ProblemPage problem={problem} active="rank" title={t("titleFor", { name: problem.statement.name })}>
      <RankTable code={problem.code} initial={ranks} />
    </ProblemPage>
  );
}
