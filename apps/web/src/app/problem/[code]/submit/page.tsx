import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { SubmitForm } from "@/components/problems/SubmitForm";
import { query, queryAsViewer } from "@/lib/convex-server";
import { viewerLanguage } from "@/lib/language.server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const t = await getTranslations("problems");
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }).catch(
    () => null,
  );
  return {
    title: problem ? t("submit.titleFor", { name: problem.statement.name }) : t("detail.noSuchProblem"),
  };
}

export default async function SubmitPage({ params }: { params: Promise<{ code: string }> }) {
  const t = await getTranslations("problems.submit");
  const { code } = await params;
  const [problem, viewerState, languages] = await Promise.all([
    queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
    query(api.languages.list, {}).catch(() => []),
  ]);
  if (!problem) notFound();
  if (!problem.canSubmit) forbidden();

  // DMOJ opens the form on the member's own default language.
  const preferredId = viewerState?.profile?.languageId;
  const preferred = preferredId ? languages.find((row) => row._id === preferredId) : undefined;

  return (
    <ProblemPage problem={problem} active="submit" title={t("titleFor", { name: problem.statement.name })}>
      <SubmitForm
        problemCode={problem.code}
        problemName={problem.name}
        defaultLanguageKey={preferred?.key ?? null}
        canPinJudge={problem.canEdit}
        submissionsLeft={problem.contestProblem?.submissionsLeft ?? null}
      />
    </ProblemPage>
  );
}
