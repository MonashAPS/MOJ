import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { TestDataEditor } from "@/components/problems/TestDataEditor";
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
    title: problem ? t("testData.titleFor", { name: problem.statement.name }) : t("detail.noSuchProblem"),
  };
}

export default async function TestDataPage({ params }: { params: Promise<{ code: string }> }) {
  const t = await getTranslations("problems.testData");
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code, language: await viewerLanguage() });

  if (!problem) notFound();

  if (!problem.canEdit) forbidden();

  const data = await queryAsViewer(api.problems.data.get, { code }).catch(() => null);

  if (!data) forbidden();

  return (
    <ProblemPage problem={problem} active="test_data" title={t("titleFor", { name: problem.statement.name })}>
      <TestDataEditor code={problem.code} initial={data} />
    </ProblemPage>
  );
}
