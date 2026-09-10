import { api } from "@convex/_generated/api";
import { notFound } from "next/navigation";
import { SubmissionList } from "@/components/submissions/SubmissionList";
import { UserShell } from "@/components/users/UserShell";
import { query, queryAsViewer } from "@/lib/convex-server";
import { gravatarUrlForUserId } from "@/lib/gravatar";
import { organizationHref } from "@/lib/organizations";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  return { title: `Submissions by ${decodeURIComponent(user)}` };
}

export default async function UserSubmissionsPage({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const username = decodeURIComponent(user);

  const data = await queryAsViewer(api.profiles.userPage, { username });
  if (!data) notFound();

  const [gravatar, organizations] = await Promise.all([
    gravatarUrlForUserId(data.profile.userId, 224),
    query(api.organizations.list, {}).catch(() => []),
  ]);
  const organizationLinks: Record<string, string> = {};
  for (const organization of organizations) {
    organizationLinks[organization.slug] = organizationHref(organization);
  }

  return (
    <UserShell
      data={data}
      gravatar={gravatar}
      tab="submissions"
      isViewer={data.isViewer}
      organizationLinks={organizationLinks}
    >
      <SubmissionList
        username={username}
        emptyTitle="No submissions"
        emptyDescription={
          data.isViewer ? "You haven't submitted anything yet." : `${username} hasn't submitted anything yet.`
        }
      />
    </UserShell>
  );
}
