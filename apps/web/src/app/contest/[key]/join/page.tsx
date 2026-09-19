import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";
import { JoinPanel } from "./JoinPanel";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const t = await getTranslations("contests.join");
  const detail = await queryAsViewer(api.contests.get, { key }).catch(() => null);

  if (!detail?.contest) return { title: t("metaFallback") };

  return {
    title: detail.viewer.requiresAccessCode
      ? t("accessCodeTitle", { name: detail.contest.name })
      : t("joinTitle", { name: detail.contest.name }),
  };
}

/**
 * `ContestJoin.get` (contests.py:384) renders the access-code form; the POST
 * that joins is the server action `joinContest`, which is where every Join
 * button on the site ends up.
 */
export default async function ContestJoinPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const detail = await queryAsViewer(api.contests.get, { key }).catch(() => null);

  if (!detail || detail.access.kind === "notFound" || detail.access.kind === "inaccessible") notFound();

  if (detail.access.kind === "privateContest") notFound();

  if (!detail.contest) notFound();

  if (!detail.viewer.isAuthenticated) {
    redirect(`/accounts/login/?next=${encodeURIComponent(`/contest/${key}/join/`)}`);
  }

  return (
    <JoinPanel
      contestKey={key}
      contestName={detail.contest.name}
      requiresAccessCode={detail.viewer.requiresAccessCode}
      isVirtual={detail.timing.ended}
      alreadyIn={detail.viewer.inContest}
      schedule={detail.contest.schedule}
    />
  );
}
