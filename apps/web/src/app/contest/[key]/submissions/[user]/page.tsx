import { api } from "@convex/_generated/api";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type SearchParams, SubmissionListPage } from "@/components/submissions/SubmissionListPage";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string; user: string }> }) {
  const { key, user } = await params;
  const t = await getTranslations("contests.participations");
  return { title: t("metaSubmissions", { user, key }) };
}

export default async function ContestUserSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; user: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { key, user } = await params;
  const viewer = await queryAsViewer(api.viewer.current, {});
  if (user === "me") {
    if (!viewer.profile) redirect(`/accounts/login/?next=/contest/${key}/`);
    redirect(`/contest/${key}/submissions/${viewer.profile.username}/`);
  }
  return (
    <SubmissionListPage
      filters={{ contestKey: key, username: user }}
      tab={viewer.profile?.username === user ? "mine" : "user"}
      searchParams={await searchParams}
    />
  );
}
