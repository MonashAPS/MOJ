import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { queryAsViewer } from "@/lib/convex-server";
import { ParticipationsClient } from "./ParticipationsClient";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const detail = await queryAsViewer(api.contests.get, { key }).catch(() => null);
  return { title: detail?.contest ? `${detail.contest.name} participation` : "Participation" };
}

export default async function ContestParticipationsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [detail, rows, viewerState] = await Promise.all([
    queryAsViewer(api.contests.get, { key }).catch(() => null),
    queryAsViewer(api.contests.participations, { key }).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (!detail || detail.access.kind === "notFound" || detail.access.kind === "inaccessible") notFound();
  if (!detail.contest) notFound();

  const username = viewerState?.profile?.username ?? null;

  return (
    <ParticipationsClient
      contestKey={key}
      detail={detail}
      initial={rows}
      viewerUsername={username}
      subject={username}
      isOwn
    />
  );
}
