import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { queryAsViewer } from "@/lib/convex-server";
import { RankingClient } from "./RankingClient";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const detail = await queryAsViewer(api.contests.get, { key }).catch(() => null);
  return { title: detail?.contest ? `${detail.contest.name} rankings` : "Rankings" };
}

export default async function ContestRankingPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const [detail, ranking, viewerState] = await Promise.all([
    queryAsViewer(api.contests.get, { key }).catch(() => null),
    queryAsViewer(api.contestRankings.ranking, { key }).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (!detail || detail.access.kind === "notFound" || detail.access.kind === "inaccessible") notFound();
  if (!detail.contest) notFound();

  // The class filter's options: the classes of the organisations the contest is
  // restricted to. `classes.listForOrganization` is the only list there is, so
  // the page walks the contest's organisations here rather than in the browser.
  const classGroups = await Promise.all(
    detail.contest.organizations.map((organization) =>
      queryAsViewer(api.classes.listForOrganization, { organizationSlug: organization.slug })
        .then((rows) => rows.map((row) => ({ _id: row._id as string, name: row.name })))
        .catch(() => [] as { _id: string; name: string }[]),
    ),
  );

  // SPEC section 7's pending marks. `pages.contests.frozenCells` is new, so a
  // deployment that has not taken it yet must not have the browser subscribe to
  // it: a missing function is a thrown error, not an empty result. The server
  // call is the probe.
  let frozenCellsAvailable = true;
  try {
    await queryAsViewer(api.pages.contests.frozenCells, { key });
  } catch {
    frozenCellsAvailable = false;
  }

  return (
    <RankingClient
      contestKey={key}
      detail={detail}
      initial={ranking}
      viewerUsername={viewerState?.profile?.username ?? null}
      classOptions={classGroups.flat()}
      frozenCellsAvailable={frozenCellsAvailable}
    />
  );
}
