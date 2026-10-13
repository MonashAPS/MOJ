import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";
import { OrganizationStandings } from "./OrganizationStandings";

type Params = { params: Promise<{ event: string }> };

async function standingsFor(event: string) {
  return await queryAsViewer(api.scoreboard.organizations.standings, { key: event }).catch(() => null);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { event } = await params;
  const t = await getTranslations("contests.organizationStandings");
  const payload = await standingsFor(event);

  return {
    title: payload ? t("metaTitle", { event: payload.event.name }) : t("metaFallback"),
    robots: { index: false, follow: false },
  };
}

/** Public like the hall board it belongs to; an event without standings has no such page. */
export default async function OrganizationStandingsPage({ params }: Params) {
  const { event } = await params;
  const payload = await standingsFor(event);

  if (!payload) notFound();

  return <OrganizationStandings eventKey={event} initial={payload} />;
}
