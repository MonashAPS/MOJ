import { api } from "@convex/_generated/api";
import { Button, type TabItem, TitleRow } from "@moj/ui";
import { Code2, FileText, ListChecks } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SourceWindow } from "@/components/submissions/SourceWindow";
import { StatusView } from "@/components/submissions/StatusView";
import { SubmissionActions } from "@/components/submissions/SubmissionActions";
import { titlebarAction } from "@/components/submissions/titlebar";
import { queryAsViewer } from "@/lib/convex-server";
import { loadSourceView, loadStatusExtras } from "@/lib/submissionsData";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [extras, t] = await Promise.all([loadStatusExtras(id), getTranslations("submissions.meta")]);

  if (!extras) return { title: t("detail") };

  return { title: t("detailOf", { problem: extras.problem.name, username: extras.user.username }) };
}

export default async function SubmissionStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("submissions.detail");

  const [detail, extras] = await Promise.all([
    queryAsViewer(api.submissions.detail, { submissionId: id }),
    loadStatusExtras(id),
  ]);

  if (!detail || !extras) notFound();

  const source = detail.canSeeDetail ? await loadSourceView(id) : null;

  const tabs: TabItem[] = [
    { key: "status", label: t("tabStatus"), icon: <ListChecks aria-hidden /> },
    ...(detail.canSeeDetail
      ? [
          { key: "source", label: t("tabSource"), href: `/src/${id}/`, icon: <Code2 aria-hidden /> },
          { key: "raw", label: t("tabRaw"), href: `/src/${id}/raw/`, icon: <FileText aria-hidden /> },
        ]
      : []),
  ];

  return (
    <>
      <TitleRow
        title={t.rich("title", {
          problem: () => (
            <Link href={`/problem/${extras.problem.code}`} className="text-link hover:text-link-hover">
              {extras.problem.name}
            </Link>
          ),
          user: () => (
            <Link href={`/user/${extras.user.username}`} className="text-link hover:text-link-hover">
              {extras.user.username}
            </Link>
          ),
        })}
        tabs={tabs}
        active="status"
        action={
          <>
            {extras.canResubmit ? (
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/problem/${extras.problem.code}/resubmit/${id}/`}>{t("resubmit")}</Link>
              </Button>
            ) : null}
            <SubmissionActions
              submissionId={id}
              initialStatus={detail.submission.status}
              canAbort={extras.canAbort}
              canRejudge={extras.canRejudge}
              isLocked={extras.isLocked}
            />
          </>
        }
      />
      <div id="content-body" className="grid gap-4">
        <StatusView initial={detail} extras={extras} serverNow={Date.now()} />

        {source?.canSeeSource && source.source ? (
          <SourceWindow
            source={source.source}
            shikiLang={source.language?.shikiLang ?? "text"}
            languageName={source.language?.name ?? t("sourceFallback")}
            actions={
              <>
                <Button variant="ghost" size="sm" className={titlebarAction} asChild>
                  <a href={`/src/${id}/raw/`}>{t("raw")}</a>
                </Button>
                {extras.canResubmit ? (
                  <Button variant="ghost" size="sm" className={titlebarAction} asChild>
                    <Link href={`/problem/${extras.problem.code}/resubmit/${id}/`}>{t("resubmit")}</Link>
                  </Button>
                ) : null}
              </>
            }
          />
        ) : null}
      </div>
    </>
  );
}
