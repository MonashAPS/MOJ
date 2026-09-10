import { redirect } from "next/navigation";
import { api } from "@convex/_generated/api";
import { SubmissionListPage, type SearchParams } from "@/components/submissions/SubmissionListPage";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string; user: string; problem: string }>;
}) {
  const { key, user, problem } = await params;
  return { title: `${user}'s submissions for ${problem} in ${key}` };
}

export default async function ContestUserProblemSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; user: string; problem: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { key, user, problem } = await params;
  const viewer = await queryAsViewer(api.viewer.current, {});
  if (user === "me") {
    if (!viewer.profile) redirect(`/accounts/login/?next=/contest/${key}/`);
    redirect(`/contest/${key}/submissions/${viewer.profile.username}/${problem}/`);
  }
  return (
    <SubmissionListPage
      filters={{ contestKey: key, username: user, problemCode: problem }}
      showProblem={false}
      tab={viewer.profile?.username === user ? "mine" : "user"}
      bestSubmissionsHref={`/contest/${key}/rank/${problem}/`}
      searchParams={await searchParams}
    />
  );
}
