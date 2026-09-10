import { api } from "@convex/_generated/api";
import { Pagination, TitleRow } from "@moj/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeaderboardTable } from "@/components/users/LeaderboardTable";
import { pageHref, parseUserOrder } from "@/components/users/leaderboard";
import { queryAsViewer } from "@/lib/convex-server";
import { organizationHref, slugFromHandle } from "@/lib/organizations";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return { title: `Members of ${slugFromHandle(handle)}` };
}

export default async function OrganizationUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ handle }, search] = await Promise.all([params, searchParams]);
  const slug = slugFromHandle(handle);
  const state = parseUserOrder(first(search.order));
  const page = Math.max(1, Number.parseInt(first(search.page) ?? "1", 10) || 1);

  const [data, viewerState] = await Promise.all([
    queryAsViewer(api.organizations.members, {
      slug,
      page,
      sort: state.sort,
      descending: state.descending,
    }),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);
  if (!data.organization) notFound();

  const base = `/organization/${handle}/users/`;
  const params_ = new URLSearchParams();
  if (first(search.order)) params_.set("order", state.order);

  return (
    <>
      <TitleRow
        title={`Members of ${data.organization.name}`}
        breadcrumb={
          <Link href={organizationHref(data.organization)} className="hover:underline">
            {data.organization.name}
          </Link>
        }
      />
      <div id="content-body">
        <LeaderboardTable
          rows={data.members}
          state={state}
          basePath={base}
          params={params_.toString()}
          viewerUsername={viewerState?.profile?.username ?? null}
          kickSlug={data.isAdmin ? slug : undefined}
          emptyMessage="This organization has no listed members yet."
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-sm tabular-nums text-muted-foreground">
            {data.total === 1 ? "1 member" : `${data.total.toLocaleString("en-AU")} members`}
          </p>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            hrefFor={(next) => pageHref(base, params_, next)}
          />
        </div>
      </div>
    </>
  );
}
