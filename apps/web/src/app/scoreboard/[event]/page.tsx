import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";
import { HallScoreboard } from "./HallScoreboard";

type Params = { params: Promise<{ event: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { event } = await params;
  const t = await getTranslations("contests.scoreboards");
  const payload = await queryAsViewer(api.scoreboard.event, { key: event }).catch(() => null);
  return {
    title: payload?.event.name ?? t("metaFallback"),
    // A hall display is for the room it is in, not for search results.
    robots: { index: false, follow: false },
  };
}

/** SPEC section 7: the hall board ignores `scoreboardVisibility`, so treat the
 *  URL as public — a private event is the only one that is staff-only. */
export default async function HallScoreboardPage({ params }: Params) {
  const { event } = await params;
  const payload = await queryAsViewer(api.scoreboard.event, { key: event }).catch(() => null);
  if (!payload) notFound();
  return <HallScoreboard eventKey={event} initial={payload} />;
}
