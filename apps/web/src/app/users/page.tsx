import { api } from "@convex/_generated/api";
import { Alert, AlertTitle, TitleRow } from "@moj/ui";
import { redirect } from "next/navigation";
import type { OrganizationChip } from "@/components/users/LeaderboardTable";
import { LeaderboardToolbar } from "@/components/users/LeaderboardToolbar";
import { parseUserOrder } from "@/components/users/leaderboard";
import { USER_LIST_TABS } from "@/components/users/tabs";
import { query, queryAsViewer } from "@/lib/convex-server";
import { UsersLive } from "./UsersLive";

export const metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const state = parseUserOrder(first(search.order));
  const page = Math.max(1, Number.parseInt(first(search.page) ?? "1", 10) || 1);
  const organizationSlug = first(search.organization) || undefined;
  const missing = first(search.missing);

  const params = new URLSearchParams();
  if (first(search.order)) params.set("order", state.order);
  if (organizationSlug) params.set("organization", organizationSlug);

  const args = { page, sort: state.sort, descending: state.descending, organizationSlug };
  const [data, organizations, viewerState] = await Promise.all([
    queryAsViewer(api.rankings.users, args),
    query(api.organizations.list, {}).catch(() => []),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  // `users(request)`: in contest mode the leaderboard *is* the contest ranking.
  if (data.contestScoreboard) redirect(`/contest/${data.contestScoreboard.key}/ranking/`);

  const chipRows = await queryAsViewer(api.pages.users.organizationsFor, {
    profileIds: data.users.map((user) => user._id),
  }).catch(() => null);
  const chips: Record<string, OrganizationChip[]> = {};
  for (const row of chipRows ?? []) chips[row.profileId] = row.organizations;

  return (
    <>
      <TitleRow title="Leaderboard" tabs={USER_LIST_TABS} active="list" />
      <div id="content-body">
        {missing ? (
          <Alert variant="warning" className="mb-4">
            <AlertTitle>There is no user called {missing}.</AlertTitle>
          </Alert>
        ) : null}
        <LeaderboardToolbar
          organizations={organizations.map((organization) => ({
            slug: organization.slug,
            name: organization.name,
          }))}
          organizationSlug={organizationSlug ?? null}
          params={params.toString()}
        />
        <UsersLive
          initial={data}
          args={args}
          state={state}
          params={params.toString()}
          viewerUsername={viewerState?.profile?.username ?? null}
          organizations={chips}
        />
      </div>
    </>
  );
}
