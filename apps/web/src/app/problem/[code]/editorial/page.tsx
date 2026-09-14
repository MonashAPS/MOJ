import { api } from "@convex/_generated/api";
import { renderMarkdown } from "@moj/content";
import { Alert, AlertDescription, AlertTitle, RatingName } from "@moj/ui";
import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Comments } from "@/components/comments/Comments";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { Statement } from "@/components/problems/Statement";
import { queryAsViewer } from "@/lib/convex-server";
import { viewerLanguage } from "@/lib/language.server";
import { decorateStatement } from "@/lib/statement";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const t = await getTranslations("problems.editorial");
  const { code } = await params;
  const editorial = await queryAsViewer(api.problems.editorial, { code }).catch(() => null);
  return {
    title: editorial ? t("titleFor", { name: editorial.problemName }) : t("noSuchEditorial"),
  };
}

export default async function EditorialPage({ params }: { params: Promise<{ code: string }> }) {
  const t = await getTranslations("problems.editorial");
  const detail = await getTranslations("problems.detail");
  const { code } = await params;
  const [problem, editorial] = await Promise.all([
    queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }),
    queryAsViewer(api.problems.editorial, { code }),
  ]);
  if (!problem || !editorial) notFound();

  const { html } = await renderMarkdown(editorial.content, editorial.preset);

  return (
    <ProblemPage problem={problem} active="editorial" title={t("titleFor", { name: editorial.problemName })}>
      {editorial.hasSolvedProblem ? null : (
        <Alert variant="warning" className="mb-5">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{t("warningTitle")}</AlertTitle>
          <AlertDescription>{t("warningBody")}</AlertDescription>
        </Alert>
      )}

      {editorial.authors.length > 0 ? (
        <p className="mb-4 flex flex-wrap items-center gap-x-2 text-base text-subtle">
          <span>{detail("authors", { count: editorial.authors.length })}</span>
          {editorial.authors.map((author) => (
            <RatingName
              key={author.username}
              username={author.username}
              rating={author.rating}
              href={`/user/${author.username}`}
              isAdmin={author.displayRank === "admin"}
            />
          ))}
        </p>
      ) : null}

      <Statement html={decorateStatement(html)} />

      <Comments targetType="solution" targetKey={editorial.problemCode} />
    </ProblemPage>
  );
}
