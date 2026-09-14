import { api } from "@convex/_generated/api";
import { renderMarkdown } from "@moj/content";
import { Button, TitleRow } from "@moj/ui";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Comments } from "@/components/comments/Comments";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { ProctorRequired } from "@/components/problems/ProctorRequired";
import { Statement } from "@/components/problems/Statement";
import { queryAsViewer } from "@/lib/convex-server";
import { formatRelative } from "@/lib/format";
import { viewerLanguage } from "@/lib/language.server";
import { decorateStatement } from "@/lib/statement";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const t = await getTranslations("problems.detail");
  const { code } = await params;
  const language = await viewerLanguage();
  const problem = await queryAsViewer(api.problems.get, { code, language }).catch(() => null);
  if (!problem) return { title: t("noSuchProblem") };
  return {
    // DMOJ titles the page with the translation when there is one.
    title: problem.statement.name,
    description: problem.summary ?? undefined,
    openGraph: problem.ogImage ? { images: [problem.ogImage] } : undefined,
  };
}

export default async function ProblemStatementPage({ params }: { params: Promise<{ code: string }> }) {
  const t = await getTranslations("problems.detail");
  const { code } = await params;
  const language = await viewerLanguage();
  const problem = await queryAsViewer(api.problems.get, { code, language });
  if (!problem) {
    // A proctored contest withholds its problems rather than hiding them. Say
    // so here, where somebody is looking at the problem, instead of replacing
    // the whole site with a notice they did not ask for.
    const gate = await queryAsViewer(api.proctor.gate, {}).catch(() => null);
    if (gate?.blocked) {
      return (
        <>
          <TitleRow title={gate.contestName ?? t("noSuchProblem")} />
          <ProctorRequired contestName={gate.contestName} />
        </>
      );
    }
    notFound();
  }

  const [{ html }, bar] = await Promise.all([
    renderMarkdown(problem.statement.source, problem.statement.preset),
    problem.contestProblem ? queryAsViewer(api.contests.navBar, {}).catch(() => null) : Promise.resolve(null),
  ]);
  const statement = decorateStatement(html);

  const siblings = bar?.problems ?? [];
  const here = siblings.findIndex((row) => row.code === problem.code);
  const showClarifications = !!problem.contestProblem && bar?.contest.useClarifications === true;
  const previous = here > 0 ? siblings[here - 1] : undefined;
  const next = here >= 0 && here < siblings.length - 1 ? siblings[here + 1] : undefined;

  return (
    <ProblemPage
      problem={problem}
      active="statement"
      breadcrumb={
        bar && problem.contestProblem ? (
          <span className="flex items-center gap-1.5">
            <Link href={`/contest/${bar.contest.key}`} className="hover:text-link">
              {bar.contest.name}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-foreground">
              {problem.contestProblem.label}. {problem.name}
            </span>
          </span>
        ) : undefined
      }
    >
      {/* DMOJ puts clarifications above the statement, newest first, and only
          while the viewer is in a contest that asked for them. */}
      {showClarifications ? (
        <section className="mb-6">
          <h2 className="mb-3 font-display text-h2 font-bold tracking-tight text-foreground">
            {t("clarifications")}
          </h2>
          {problem.clarifications.length === 0 ? (
            <p className="text-base text-muted-foreground">{t("noClarifications")}</p>
          ) : (
            <ul className="grid gap-3">
              {problem.clarifications.map((clarification) => (
                <li key={clarification.id} className="rounded-md border border-border bg-card p-3">
                  <p className="mb-1 font-mono text-sm tabular-nums text-muted-foreground">
                    {formatRelative(clarification.date)}
                  </p>
                  <p className="whitespace-pre-wrap text-base text-foreground">{clarification.description}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <Statement html={statement} />

      {problem.license ? (
        <p className="mt-4 text-sm text-muted-foreground">
          <a href={`/license/${problem.license.key}`} className="hover:text-link">
            {problem.license.display || problem.license.name}
          </a>
        </p>
      ) : null}

      {previous || next ? (
        <nav
          aria-label={t("contestProblemsNav")}
          className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4"
        >
          {previous ? (
            <Button asChild variant="secondary" icon={<ArrowLeft size={14} />}>
              <Link href={`/problem/${previous.code}`}>
                {previous.label}. {previous.name}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {next ? (
            <Button asChild variant="secondary">
              <Link href={`/problem/${next.code}`}>
                {next.label}. {next.name}
                <ArrowRight size={14} aria-hidden />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      <div className="mt-6 flex justify-end border-t border-border pt-4">
        <Button asChild variant="secondary">
          <Link href={`/problem/${problem.code}/tickets/new`}>
            {problem.contestProblem ? t("requestClarification") : t("reportIssue")}
          </Link>
        </Button>
      </div>

      <Comments targetType="problem" targetKey={problem.code} />
    </ProblemPage>
  );
}
