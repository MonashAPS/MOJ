import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { queryAsViewer } from "@/lib/convex-server";
import { ParticipationsClient } from "../ParticipationsClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string; user: string }>;
}): Promise<Metadata> {
  const { key, user } = await params;
  const detail = await queryAsViewer(api.contests.get, { key }).catch(() => null);
  return { title: detail?.contest ? `${user} in ${detail.contest.name}` : "Participation" };
}

export default async function ContestUserParticipationsPage({
  params,
}: {
  params: Promise<{ key: string; user: string }>;
}) {
  const { key, user } = await params;
  const [detail, rows, viewerState] = await Promise.all([
    queryAsViewer(api.contests.get, { key }).catch(() => null),
    queryAsViewer(api.contests.participationsOfUser, { key, username: user }).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (!detail || detail.access.kind === "notFound" || detail.access.kind === "inaccessible") notFound();
  if (!detail.contest) notFound();

  const viewerUsername = viewerState?.profile?.username ?? null;

  return (
    <ParticipationsClient
      contestKey={key}
      detail={detail}
      initial={rows}
      viewerUsername={viewerUsername}
      subject={user}
      isOwn={viewerUsername === user}
    />
  );
}
