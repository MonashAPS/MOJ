import { api } from "@convex/_generated/api";
import { renderMarkdown } from "@moj/content";
import { Button, TitleRow, TwoColumn } from "@moj/ui";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleDashed, CircleSlash2, FileDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Comments } from "@/components/comments/Comments";
import { ProblemInfoBox } from "@/components/problems/ProblemInfoBox";
import { Statement } from "@/components/problems/Statement";
import { problemTabs } from "@/components/problems/tabs";
import { queryAsViewer } from "@/lib/convex-server";
import { formatRelative } from "@/lib/format";
import { decorateStatement } from "@/lib/statement";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code }).catch(() => null);
  if (!problem) return { title: "No such problem" };
  return {
    title: problem.name,
    description: problem.summary ?? undefined,
    openGraph: problem.ogImage ? { images: [problem.ogImage] } : undefined,
  };
}

const STATE_ICON = {
  solved: { Icon: CheckCircle2, tone: "var(--state-solved)", label: "Solved" },
  partial: { Icon: CircleSlash2, tone: "var(--state-partial)", label: "Partially solved" },
  attempted: { Icon: CircleDashed, tone: "var(--state-attempted)", label: "Attempted" },
} as const;

export default async function ProblemPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code });
  if (!problem) notFound();

  const [{ html }, bar] = await Promise.all([
    renderMarkdown(problem.statement.source, problem.statement.preset),
    problem.contestProblem ? queryAsViewer(api.contests.navBar, {}).catch(() => null) : Promise.resolve(null),
  ]);
  const statement = decorateStatement(html);

  const siblings = bar?.problems ?? [];
  const here = siblings.findIndex((row) => row.code === problem.code);
  const previous = here > 0 ? siblings[here - 1] : undefined;
  const next = here >= 0 && here < siblings.length - 1 ? siblings[here + 1] : undefined;

  const state = STATE_ICON[problem.viewer.state as keyof typeof STATE_ICON];

  return (
    <>
      <TitleRow
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
        title={
          <span className="flex items-center gap-2">
            {state ? <state.Icon size={20} aria-label={state.label} style={{ color: state.tone }} /> : null}
            <span>{problem.name}</span>
          </span>
        }
        tabs={problemTabs(problem)}
        active="statement"
        action={
          <Button asChild variant="ghost" icon={<FileDown size={14} />}>
            <a href={`/problem/${problem.code}/pdf`}>View as PDF</a>
          </Button>
        }
      />

      <div id="content-body">
        <TwoColumn side={<ProblemInfoBox problem={problem} />}>
          {problem.statement.translated ? null : null}
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
              aria-label="Contest problems"
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
                {problem.contestProblem ? "Request clarification" : "Report an issue"}
              </Link>
            </Button>
          </div>

          {problem.contestProblem ? (
            <section className="mt-8">
              <h2 className="mb-3 font-display text-h2 font-bold tracking-tight text-foreground">
                Clarifications
              </h2>
              {problem.clarifications.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  No clarifications have been made at this time.
                </p>
              ) : (
                <ul className="grid gap-3">
                  {problem.clarifications.map((clarification) => (
                    <li key={clarification.id} className="rounded-md border border-border bg-card p-3">
                      <p className="mb-1 font-mono text-sm tabular-nums text-muted-foreground">
                        {formatRelative(clarification.date)}
                      </p>
                      <p className="whitespace-pre-wrap text-base text-foreground">
                        {clarification.description}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <Comments targetType="problem" targetKey={problem.code} />
          )}
        </TwoColumn>
      </div>
    </>
  );
}
