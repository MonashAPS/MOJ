import { api } from "@convex/_generated/api";
import { renderMarkdown } from "@moj/content";
import { Alert, AlertDescription, AlertTitle, RatingName } from "@moj/ui";
import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Comments } from "@/components/comments/Comments";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { Statement } from "@/components/problems/Statement";
import { queryAsViewer } from "@/lib/convex-server";
import { viewerLanguage } from "@/lib/language.server";
import { decorateStatement } from "@/lib/statement";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const editorial = await queryAsViewer(api.problems.editorial, { code }).catch(() => null);
  return { title: editorial ? `Editorial for ${editorial.problemName}` : "No such editorial" };
}

export default async function EditorialPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [problem, editorial] = await Promise.all([
    queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }),
    queryAsViewer(api.problems.editorial, { code }),
  ]);
  if (!problem || !editorial) notFound();

  const { html } = await renderMarkdown(editorial.content, editorial.preset);

  return (
    <ProblemPage problem={problem} active="editorial" title={`Editorial for ${editorial.problemName}`}>
      {editorial.hasSolvedProblem ? null : (
        <Alert variant="warning" className="mb-5">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>Use this editorial only when stuck, and do not copy-paste code from it.</AlertTitle>
          <AlertDescription>
            Please be respectful to the problem author and editorialist. Submitting an official solution
            before solving the problem yourself is a bannable offence.
          </AlertDescription>
        </Alert>
      )}

      {editorial.authors.length > 0 ? (
        <p className="mb-4 flex flex-wrap items-center gap-x-2 text-base text-subtle">
          <span>{editorial.authors.length === 1 ? "Author:" : "Authors:"}</span>
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
