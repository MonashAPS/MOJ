import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle } from "@moj/ui";
import { MonitorPlay } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Comments } from "@/components/comments/Comments";
import { queryAsViewer } from "@/lib/convex-server";
import { renderContent } from "@/lib/markdown";
import { ContestDetailClient } from "./ContestDetailClient";
import { PrivateContest } from "./PrivateContest";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const t = await getTranslations("contests.detail");
  const detail = await queryAsViewer(api.contests.get, { key }).catch(() => null);

  if (!detail?.contest) return { title: t("metaFallback") };

  return {
    title: detail.contest.name,
    description: detail.contest.summary ?? undefined,
  };
}

export default async function ContestPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const [detail, defaultLanguage] = await Promise.all([
    queryAsViewer(api.contests.get, { key }).catch(() => null),
    queryAsViewer(api.languages.viewerDefault, {}).catch(() => null),
  ]);

  if (!detail || detail.access.kind === "notFound" || detail.access.kind === "inaccessible") notFound();

  if (detail.access.kind === "privateContest") return <PrivateContest access={detail.access} />;

  if (!detail.contest) notFound();

  const descriptionHtml = await renderContent(detail.contest.description, "contest");
  const t = await getTranslations("contests.supervision");

  return (
    <>
      {/* Said before they join as well as on the gate afterwards, because
          somebody reading the page should know what it will ask of them. */}
      {detail.contest.proctorRequired ? (
        <Alert variant="info" className="mb-4">
          <MonitorPlay size={16} aria-hidden />
          <AlertTitle>{t("title")}</AlertTitle>
          <AlertDescription>{t("noticeProctor")}</AlertDescription>
        </Alert>
      ) : null}
      <ContestDetailClient
        contestKey={key}
        initial={detail}
        descriptionHtml={descriptionHtml}
        defaultLanguageKey={defaultLanguage?.key ?? null}
      />
      <Comments targetType="contest" targetKey={key} />
    </>
  );
}
