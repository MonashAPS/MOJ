import { api } from "@convex/_generated/api";
import { MicroLabel, type TabItem, TitleRow } from "@moj/ui";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/auth/session";
import { ErrorScreen } from "@/components/ErrorScreen";
import { queryAsViewer } from "@/lib/convex-server";
import { organizationHref, slugFromHandle } from "@/lib/organizations";
import { RequestsTable } from "./RequestsTable";

export const dynamic = "force-dynamic";

const TABS = ["pending", "log", "approved", "rejected"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ handle: string; tab: string }> }) {
  const { handle, tab } = await params;
  return { title: `${tab} requests for ${slugFromHandle(handle)}` };
}

export default async function OrganizationRequestsPage({
  params,
}: {
  params: Promise<{ handle: string; tab: string }>;
}) {
  const { handle, tab } = await params;
  if (!TABS.includes(tab as Tab)) notFound();
  const slug = slugFromHandle(handle);

  const session = await getServerSession();
  if (!session) redirect(`/accounts/login/?next=/organization/${handle}/requests/${tab}/`);

  const data = await queryAsViewer(api.organizations.reviewRequests, { slug, tab: tab as Tab }).catch(
    () => null,
  );
  // The query throws for someone with no review rights and returns a null
  // organisation when there is no such organisation.
  if (!data) return <ErrorScreen code={403} id="AccessDenied" description="Access denied" />;
  if (!data.organization) notFound();

  const base = `/organization/${handle}/requests`;
  const tabs: TabItem[] = TABS.map((key) => ({
    key,
    label: key === "log" ? "Log" : key.charAt(0).toUpperCase() + key.slice(1),
    href: `${base}/${key}/`,
  }));

  return (
    <>
      <TitleRow
        title={`Requests for ${data.organization.name}`}
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
            <MicroLabel>
              {data.slotsRemaining === 1 ? "1 place left" : `${data.slotsRemaining} places left`}
            </MicroLabel>
          </p>
        )}
        <RequestsTable rows={data.requests} showActions={tab === "pending"} />
      </div>
    </>
  );
}
