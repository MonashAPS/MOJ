import { Alert, AlertDescription, AlertTitle, Button, type TabItem, TitleRow, VerdictPill } from "@moj/ui";
import { Code2, FileText, ListChecks } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SourceWindow } from "@/components/submissions/SourceWindow";
import { titlebarAction } from "@/components/submissions/titlebar";
import { absoluteTime, isGrading, verdictCode } from "@/lib/submissionFormat";
import { loadSourceView } from "@/lib/submissionsData";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadSourceView(id);
  if (!view) return { title: "Submission source" };
  return { title: `Submission of ${view.problem.name} by ${view.user.username}` };
}

export default async function SubmissionSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadSourceView(id);
  if (!view) notFound();

  const tabs: TabItem[] = [
    { key: "status", label: "Status", href: `/submission/${id}/`, icon: <ListChecks aria-hidden /> },
    { key: "source", label: "View source", icon: <Code2 aria-hidden /> },
    { key: "raw", label: "Raw source", href: `/src/${id}/raw/`, icon: <FileText aria-hidden /> },
  ];

  return (
    <>
      <TitleRow
        title={
          <>
            Submission of{" "}
            <Link href={`/problem/${view.problem.code}`} className="text-link hover:text-link-hover">
              {view.problem.name}
            </Link>{" "}
            by{" "}
            <Link href={`/user/${view.user.username}`} className="text-link hover:text-link-hover">
              {view.user.username}
            </Link>
          </>
        }
        tabs={tabs}
        active="source"
        action={
          view.canResubmit ? (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/problem/${view.problem.code}/resubmit/${id}/`}>Resubmit</Link>
            </Button>
          ) : undefined
        }
      />
      <div id="content-body" className="grid gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <VerdictPill verdict={verdictCode(view)} judging={isGrading(view.status)} />
          {isGrading(view.status) ? null : (
            <span className="font-mono tabular-nums">
              {view.casePoints} <span className="text-muted-foreground">/ {view.caseTotal}</span>
            </span>
          )}
          <span className="font-mono">{view.language?.name ?? "Unknown language"}</span>
          <time dateTime={new Date(view.date).toISOString()} className="font-mono tabular-nums">
            {absoluteTime(view.date)}
          </time>
          {view.judge ? <span className="font-mono">on {view.judge}</span> : null}
        </div>

        {view.canSeeSource ? (
          <SourceWindow
            source={view.source}
            shikiLang={view.language?.shikiLang ?? "text"}
            languageName={view.language?.name ?? "Source"}
            lineNumbers
            actions={
              <Button variant="ghost" size="sm" className={titlebarAction} asChild>
                <a href={`/src/${id}/raw/`}>Raw</a>
              </Button>
            }
          />
        ) : (
          <Alert variant="info">
            <AlertTitle>You cannot read this source</AlertTitle>
            <AlertDescription>
              {view.solveToView
                ? `Solve ${view.problem.name} to see other people's solutions to it.`
                : "The author of this problem has kept its solutions private."}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </>
  );
}
