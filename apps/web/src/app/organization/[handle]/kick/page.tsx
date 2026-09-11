import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorScreen } from "@/components/ErrorScreen";
import { queryAsViewer } from "@/lib/convex-server";
import { organizationHref, slugFromHandle } from "@/lib/organizations";
import { KickMemberForm } from "./KickMemberForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return { title: `Remove a member from ${slugFromHandle(handle)}` };
}

export default async function KickMemberPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const slug = slugFromHandle(handle);

  const organization = await queryAsViewer(api.organizations.get, { slug });
  if (!organization) notFound();
  if (!organization.viewer.canEdit) {
    return <ErrorScreen code={403} id="AccessDenied" description="Access denied" />;
  }

  const members = await queryAsViewer(api.organizations.members, { slug, page: 1 }).catch(() => null);
  const base = organizationHref(organization);

  return (
    <>
      <TitleRow
        title={`Remove a member from ${organization.name}`}
        breadcrumb={
          <Link href={base} className="hover:underline">
            {organization.name}
          </Link>
        }
      />
      <div id="content-body">
        <KickMemberForm
          slug={slug}
          name={organization.name}
          backHref={base}
          members={(members?.members ?? []).map((member) => ({
            value: member.username,
            label: member.displayName,
          }))}
        />
      </div>
    </>
  );
}
