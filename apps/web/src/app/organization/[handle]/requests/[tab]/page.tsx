import { api } from "@convex/_generated/api";
import { MicroLabel, type TabItem, TitleRow } from "@moj/ui";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/auth/session";
import { ErrorScreen } from "@/components/shell/ErrorScreen";
import { queryAsViewer } from "@/lib/convex-server";
import { organizationHref, slugFromHandle } from "@/lib/organizations";
import { RequestsTable } from "./RequestsTable";

export const dynamic = "force-dynamic";

const TABS = ["pending", "log", "approved", "rejected"] as const;

/** The tab is part of the title's sentence, so each tab gets its own message
 *  rather than a translated word dropped into an English frame. */
const META = {
  pending: "metaPending",
  log: "metaLog",
  approved: "metaApproved",
  rejected: "metaRejected",
} as const;

const TAB_LABELS = {
  pending: "tabPending",
  log: "tabLog",
  approved: "tabApproved",
  rejected: "tabRejected",
} as const;

export async function generateMetadata({ params }: { params: Promise<{ handle: string; tab: string }> }) {
  const { handle, tab } = await params;
  const t = await getTranslations("organizations.requests");
  const active = TABS.find((candidate) => candidate === tab) ?? "pending";

  return { title: t(META[active], { organization: slugFromHandle(handle) }) };
}

export default async function OrganizationRequestsPage({
  params,
}: {
  params: Promise<{ handle: string; tab: string }>;
}) {
  const { handle, tab: requested } = await params;
  const tab = TABS.find((candidate) => candidate === requested);

  if (!tab) notFound();
  const slug = slugFromHandle(handle);

  const [t, shared] = await Promise.all([
    getTranslations("organizations.requests"),
    getTranslations("organizations.common"),
  ]);

  const session = await getServerSession();

  if (!session) redirect(`/accounts/login/?next=/organization/${handle}/requests/${tab}/`);

  const data = await queryAsViewer(api.organizations.reviewRequests, { slug, tab }).catch(() => null);

  // The query throws for someone with no review rights and returns a null
  // organisation when there is no such organisation.
  if (!data) return <ErrorScreen code={403} id="AccessDenied" description={shared("accessDenied")} />;

  if (!data.organization) notFound();

  const base = `/organization/${handle}/requests`;

  const tabs: TabItem[] = TABS.map((key) => ({
    key,
    label: t(TAB_LABELS[key]),
    href: `${base}/${key}/`,
  }));

  return (
    <>
      <TitleRow
        title={t("title", { organization: data.organization.name })}
        breadcrumb={
          <Link href={organizationHref(data.organization)} className="hover:underline">
            {data.organization.name}
          </Link>
        }
        tabs={tabs}
        active={tab}
      />
      <div id="content-body">
        {data.slotsRemaining === null ? null : (
          <p className="mb-3">
            <MicroLabel>{t("slotsLeft", { count: data.slotsRemaining })}</MicroLabel>
          </p>
        )}
        <RequestsTable rows={data.requests} showActions={tab === "pending"} />
      </div>
    </>
  );
}
