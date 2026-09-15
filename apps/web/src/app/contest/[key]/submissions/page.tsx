import { api } from "@convex/_generated/api";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type SearchParams, SubmissionListPage } from "@/components/submissions/SubmissionListPage";
import { queryAsViewer } from "@/lib/convex-server";
import { ContestSubmissionsHeader } from "./ContestSubmissionsHeader";

export const dynamic = "force-dynamic";

/**
 * The contest's submissions, everyone's or the viewer's.
 *
 * The site's own list is the site's, whoever is in a contest, so this is where
 * a contest-scoped view lives. What each viewer may see is still the contest's
 * business — the query withholds other people's rows until it says otherwise.
 */

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const t = await getTranslations("contests.submissions");

  return { title: t("metaTitle", { key }) };
}

export default async function ContestSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<SearchParams & { mine?: string }>;
}) {
  const { key } = await params;
  const query = await searchParams;

  const [detail, viewerState] = await Promise.all([
    queryAsViewer(api.contests.get, { key }).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (!detail || detail.access.kind === "notFound" || detail.access.kind === "inaccessible") notFound();

  const username = viewerState?.profile?.username ?? null;
  const mine = query.mine === "1" && !!username;

  return (
    <SubmissionListPage
      filters={mine && username ? { contestKey: key, username } : { contestKey: key }}
      tab={mine ? "mine" : "all"}
      searchParams={query}
      header={
        <ContestSubmissionsHeader
          contestKey={key}
          detail={detail}
          viewerUsername={username}
          scope={mine ? "mine" : "all"}
        />
      }
    />
  );
}
