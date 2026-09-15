import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";
import { CloneForm } from "./CloneForm";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const t = await getTranslations("contests.clone");
  const detail = await queryAsViewer(api.contests.get, { key }).catch(() => null);

  return {
    title: detail?.contest ? t("metaTitle", { name: detail.contest.name }) : t("metaFallback"),
  };
}

export default async function ContestClonePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const [detail, viewerState] = await Promise.all([
    queryAsViewer(api.contests.get, { key }).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (!detail || detail.access.kind === "notFound" || detail.access.kind === "inaccessible") notFound();

  if (!detail.contest || !detail.viewer.canClone) notFound();

  return (
    <CloneForm contestKey={key} detail={detail} viewerUsername={viewerState?.profile?.username ?? null} />
  );
}
