import { api } from "@convex/_generated/api";
import { Badge, Button, MicroLabel, Panel, TitleRow, TwoColumn } from "@moj/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LeaderboardTable } from "@/components/users/LeaderboardTable";
import { parseUserOrder } from "@/components/users/leaderboard";
import { UserLink } from "@/components/users/UserLink";
import { queryAsViewer } from "@/lib/convex-server";
import { classHref, organizationHref, slugFromHandle } from "@/lib/organizations";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: { params: Promise<{ klass: string }> }) {
  const { klass } = await params;

  return { title: slugFromHandle(klass) };
}

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string; klass: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ handle, klass }, search] = await Promise.all([params, searchParams]);
  const t = await getTranslations("organizations.class");
  const organizationSlug = slugFromHandle(handle);
  const classSlug = slugFromHandle(klass);
  const state = parseUserOrder(first(search.order));

  const [detail, members, viewerState] = await Promise.all([
    queryAsViewer(api.classes.get, { organizationSlug, classSlug }),
    queryAsViewer(api.classes.members, {
      organizationSlug,
      classSlug,
      sort: state.sort,
      descending: state.descending,
    }),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  if (!detail) notFound();

  const base = classHref(detail.organization, detail);
  const params_ = new URLSearchParams();

  if (first(search.order)) params_.set("order", state.order);

  return (
    <>
      <TitleRow
        title={detail.name}
        breadcrumb={
          <Link href={organizationHref(detail.organization)} className="hover:underline">
            {detail.organization.name}
          </Link>
        }
        action={
          detail.viewer.canJoin ? (
            <Button asChild>
              <a href={`${base}/join/`}>{t("join")}</a>
            </Button>
          ) : detail.viewer.isMember ? (
            <Badge variant="good">{t("joined")}</Badge>
          ) : null
        }
      />
      <div id="content-body">
        <TwoColumn
          side={
            <Panel title={t("panel")} bodyClassName="grid gap-3 p-3">
              <dl className="grid gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <MicroLabel>{t("members")}</MicroLabel>
                  <span className="font-mono text-mono tabular-nums text-foreground">
                    {detail.memberCount}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <MicroLabel>{t("status")}</MicroLabel>
                  <Badge variant={detail.isActive ? "good" : "neutral"}>
                    {detail.isActive ? t("active") : t("closed")}
                  </Badge>
                </div>
              </dl>
              {detail.admins.length > 0 ? (
                <div className="border-t border-border pt-3">
                  <MicroLabel>{t("tutors")}</MicroLabel>
                  <ul className="mt-1 grid gap-1">
                    {detail.admins.map((admin) => (
                      <li key={admin._id}>
                        <UserLink username={admin.username} displayName={admin.displayName} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Panel>
          }
        >
          <div className="grid min-w-0 gap-8 [&>*]:min-w-0">
            {detail.description ? <p className="text-md text-subtle">{detail.description}</p> : null}
            <LeaderboardTable
              rows={members}
              state={state}
              basePath={base}
              params={params_.toString()}
              viewerUsername={viewerState?.profile?.username ?? null}
              emptyMessage={t("empty")}
            />
          </div>
        </TwoColumn>
      </div>
    </>
  );
}
