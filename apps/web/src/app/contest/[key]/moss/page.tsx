import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { queryAsViewer } from "@/lib/convex-server";
import { MossClient } from "./MossClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const detail = await queryAsViewer(api.contests.get, { key }).catch(() => null);
  return { title: detail?.contest ? `${detail.contest.name} MOSS` : "MOSS" };
}

export default async function ContestMossPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [detail, moss, viewerState] = await Promise.all([
    queryAsViewer(api.contests.get, { key }).catch(() => null),
    queryAsViewer(api.contests.moss, { key }).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (!detail || detail.access.kind === "notFound" || detail.access.kind === "inaccessible") notFound();
  if (!detail.contest || !detail.viewer.canEdit) notFound();

  return (
    <MossClient
      contestKey={key}
      detail={detail}
      moss={moss}
      viewerUsername={viewerState?.profile?.username ?? null}
    />
  );
}
