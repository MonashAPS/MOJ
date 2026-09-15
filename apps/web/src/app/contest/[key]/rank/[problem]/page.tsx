import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";
import { RankByProblemClient } from "./RankByProblemClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string; problem: string }>;
}): Promise<Metadata> {
  const { key, problem } = await params;
  const t = await getTranslations("contests.rankByProblem");

  const payload = await queryAsViewer(api.contests.rankings.rankByProblem, {
    key,
    problemCode: problem,
  }).catch(() => null);

  return { title: payload ? t("metaTitle", { name: payload.problemName }) : t("metaFallback") };
}

export default async function ContestRankByProblemPage({
  params,
}: {
  params: Promise<{ key: string; problem: string }>;
}) {
  const { key, problem } = await params;

  const [detail, payload, viewerState] = await Promise.all([
    queryAsViewer(api.contests.get, { key }).catch(() => null),
    queryAsViewer(api.contests.rankings.rankByProblem, { key, problemCode: problem }).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (!detail || detail.access.kind === "notFound" || detail.access.kind === "inaccessible") notFound();

  if (!detail.contest) notFound();

  // A problem that is not in this contest has no page here, as DMOJ 404s it.
  if (!detail.problems.some((entry) => entry.code === problem)) notFound();

  return (
    <RankByProblemClient
      contestKey={key}
      problemCode={problem}
      detail={detail}
      initial={payload}
      viewerUsername={viewerState?.profile?.username ?? null}
    />
  );
}
