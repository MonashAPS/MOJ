import { getTranslations } from "next-intl/server";
import { type SearchParams, SubmissionListPage } from "@/components/submissions/SubmissionListPage";

export const dynamic = "force-dynamic";

/**
 * Every submission in the contest.
 *
 * The site's own submissions list is the site's, whoever is in a contest, so a
 * contest-wide view has to live on the contest. What each viewer is allowed to
 * see here is still the contest's business — the query withholds other people's
 * rows until the contest says otherwise.
 */

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const t = await getTranslations("contests.participations");

  return { title: t("metaAllSubmissions", { key }) };
}

export default async function ContestSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { key } = await params;

  return <SubmissionListPage filters={{ contestKey: key }} tab="all" searchParams={await searchParams} />;
}
