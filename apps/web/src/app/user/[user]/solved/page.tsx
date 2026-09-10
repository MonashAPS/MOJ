import { api } from "@convex/_generated/api";
import { notFound } from "next/navigation";
import { PPBreakdown } from "@/components/users/PPBreakdown";
import { SolvedProblems } from "@/components/users/SolvedProblems";
import { UserShell } from "@/components/users/UserShell";
import { query, queryAsViewer } from "@/lib/convex-server";
import { gravatarUrlForUserId } from "@/lib/gravatar";
import { organizationHref } from "@/lib/organizations";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  return { title: `Problems solved by ${decodeURIComponent(user)}` };
}

type Search = Record<string, string | string[] | undefined>;

export default async function UserProblemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ user: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ user }, search] = await Promise.all([params, searchParams]);
  const username = decodeURIComponent(user);
  const compare = (Array.isArray(search.compare) ? search.compare[0] : search.compare) === "1";

  const [data, solved, viewerState] = await Promise.all([
    queryAsViewer(api.profiles.userPage, { username }),
    queryAsViewer(api.profiles.solved, { username, compareWithViewer: compare }),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);
  if (!data || !solved) notFound();

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
      tab="problems"
      isViewer={data.isViewer}
      organizationLinks={organizationLinks}
    >
      <div className="grid gap-8">
        <PPBreakdown
          username={username}
          initial={data.ppBreakdown}
          initialHasMore={data.ppHasMore}
        />
        <SolvedProblems
          username={username}
          groups={solved.groups}
          comparedWith={solved.comparedWith}
          canCompare={!!viewerState?.profile && !data.isViewer}
          compare={compare}
        />
      </div>
    </UserShell>
  );
}
