import { redirect } from "next/navigation";
import { api } from "@convex/_generated/api";
import { SubmissionListPage, type SearchParams } from "@/components/submissions/SubmissionListPage";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string; user: string }> }) {
  const { code, user } = await params;
  return { title: `${user}'s submissions for ${code}` };
}

export default async function UserProblemSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string; user: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { code, user } = await params;
  const viewer = await queryAsViewer(api.viewer.current, {});
  if (user === "me") {
    if (!viewer.profile) redirect(`/accounts/login/?next=/problem/${code}/submissions/`);
    redirect(`/problem/${code}/submissions/${viewer.profile.username}/`);
  }
  return (
    <SubmissionListPage
      filters={{ problemCode: code, username: user }}
      showProblem={false}
      tab={viewer.profile?.username === user ? "mine" : "user"}
      bestSubmissionsHref={`/problem/${code}/rank/`}
      searchParams={await searchParams}
    />
  );
}
