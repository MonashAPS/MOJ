import { redirect } from "next/navigation";
import { api } from "@convex/_generated/api";
import { SubmissionListPage, type SearchParams } from "@/components/submissions/SubmissionListPage";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  return { title: `All submissions by ${user}` };
}

export default async function UserSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ user: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { user } = await params;
  // The ContestBar and the nav both link to "me"; resolve it to a real username
  // so the page is still a shareable link.
  if (user === "me") {
    const viewer = await queryAsViewer(api.viewer.current, {});
    if (!viewer.profile) redirect("/accounts/login/?next=/submissions/");
    redirect(`/submissions/user/${viewer.profile.username}/`);
  }
  const query = await searchParams;
  const viewer = await queryAsViewer(api.viewer.current, {});
  return (
    <SubmissionListPage
      filters={{ username: user }}
      tab={viewer.profile?.username === user ? "mine" : "user"}
      searchParams={query}
    />
  );
}
