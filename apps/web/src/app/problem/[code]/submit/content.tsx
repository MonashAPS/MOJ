import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { SubmitForm } from "@/components/problems/SubmitForm";
import { loadSubmitReminder } from "@/lib/contest-resource.server";
import { queryAsViewer } from "@/lib/convex-server";
import { loadProblem } from "@/lib/problem.server";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const t = await getTranslations("problems");
  const { code } = await params;

  const problem = await loadProblem(code).catch(() => null);

  return {
    title: problem ? t("submit.titleFor", { name: problem.statement.name }) : t("detail.noSuchProblem"),
  };
}

export default async function SubmitPage({
  params,
  browsingKey,
}: {
  params: Promise<{ code: string }>;
  browsingKey?: string;
}) {
  const t = await getTranslations("problems.submit");
  const { code } = await params;

  const [problem, defaultLanguage] = await Promise.all([
    loadProblem(code),
    // DMOJ opens the form on the member's own default language.
    queryAsViewer(api.languages.viewerDefault, {}).catch(() => null),
  ]);

  if (!problem) notFound();

  if (!problem.canSubmit) forbidden();

  const reminder = await loadSubmitReminder(browsingKey, code);

  return (
    <ProblemPage problem={problem} active="submit" title={t("titleFor", { name: problem.statement.name })}>
      <SubmitForm
        reminder={reminder}
        problemCode={problem.code}
        problemName={problem.name}
        defaultLanguageKey={defaultLanguage?.key ?? null}
        canPinJudge={problem.canEdit}
        submissionsLeft={problem.contestProblem?.submissionsLeft ?? null}
      />
    </ProblemPage>
  );
}
