import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";
import { RankingClient } from "./RankingClient";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const t = await getTranslations("contests.ranking");
  const detail = await queryAsViewer(api.contests.get, { key }).catch(() => null);

  return { title: detail?.contest ? t("metaTitle", { name: detail.contest.name }) : t("metaFallback") };
}

export default async function ContestRankingPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const [detail, ranking] = await Promise.all([
    queryAsViewer(api.contests.get, { key }).catch(() => null),
    queryAsViewer(api.contests.rankings.ranking, { key }).catch(() => null),
  ]);

  if (!detail || detail.access.kind === "notFound" || detail.access.kind === "inaccessible") notFound();

  if (!detail.contest) notFound();

  // The class filter's options: the classes of the organisations the contest is
  // restricted to. `classes.listForOrganization` is the only list there is, so
  // the page walks the contest's organisations here rather than in the browser.
  const classGroups = await Promise.all(
    detail.contest.organizations.map((organization) =>
      queryAsViewer(api.classes.listForOrganization, { organizationSlug: organization.slug })
        .then((rows) => rows.map((row) => ({ _id: row._id, name: row.name })))
        .catch((): { _id: Id<"classes">; name: string }[] => []),
    ),
  );

  // SPEC section 7's pending marks, fetched here so a frozen board shows its
  // question marks on the first paint rather than after the subscription warms.
  const frozenCells = await queryAsViewer(api.pages.contests.frozenCells, { key });

  return (
    <RankingClient
      contestKey={key}
      detail={detail}
      initial={ranking}
      classOptions={classGroups.flat()}
      initialFrozenCells={frozenCells}
    />
  );
}
