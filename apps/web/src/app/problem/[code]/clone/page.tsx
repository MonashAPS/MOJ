import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CloneForm } from "@/components/problems/CloneForm";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { queryAsViewer } from "@/lib/convex-server";
import { viewerLanguage } from "@/lib/language.server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("problems.clone");

  return { title: t("metaTitle") };
}

export default async function ClonePage({ params }: { params: Promise<{ code: string }> }) {
  const t = await getTranslations("problems.clone");
  const { code } = await params;

  const [problem, viewerState] = await Promise.all([
    queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (!problem) notFound();
  const username = viewerState?.profile?.username;

  if (!problem.canEdit || !username) forbidden();

  return (
    <ProblemPage problem={problem} active="clone" title={t("titleFor", { name: problem.statement.name })}>
      <CloneForm
        username={username}
        source={{
          code: problem.code,
          name: problem.name,
          description: problem.statement.source,
          summary: problem.summary,
          points: problem.points,
          partial: problem.partial,
          timeLimit: problem.timeLimit,
          memoryLimit: problem.memoryLimit,
          shortCircuit: problem.shortCircuit,
          isFullMarkup: problem.isFullMarkup,
          group: problem.group?.name ?? null,
          types: (problem.types ?? []).map((type) => type.name),
          licenseKey: problem.license?.key ?? null,
          allowedLanguages: problem.allowedLanguages.map((language) => language.key),
        }}
      />
    </ProblemPage>
  );
}
