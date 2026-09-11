import { api } from "@convex/_generated/api";
import { type SearchParams, SubmissionListPage } from "@/components/submissions/SubmissionListPage";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  return { title: `All submissions by ${decodeURIComponent(user)}` };
}

/** `dmoj/urls.py`: `/user/<user>/submissions/` is `AllUserSubmissions`, the same
 *  view `/submissions/user/<user>/` renders. */
export default async function UserSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ user: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { user } = await params;
  const username = decodeURIComponent(user);
  const viewer = await queryAsViewer(api.viewer.current, {});
  return (
    <SubmissionListPage
      filters={{ username }}
      tab={viewer.profile?.username === username ? "mine" : "user"}
      searchParams={await searchParams}
    />
  );
}
