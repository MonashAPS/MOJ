import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ErrorScreen } from "@/components/shell/ErrorScreen";
import { queryAsViewer } from "@/lib/convex-server";
import { organizationHref, slugFromHandle } from "@/lib/organizations";
import { KickMemberForm } from "./KickMemberForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const t = await getTranslations("organizations.kick");

  return { title: t("title", { organization: slugFromHandle(handle) }) };
}

export default async function KickMemberPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const slug = slugFromHandle(handle);

  const [t, shared] = await Promise.all([
    getTranslations("organizations.kick"),
    getTranslations("organizations.common"),
  ]);

  const organization = await queryAsViewer(api.organizations.get, { slug });

  if (!organization) notFound();

  if (!organization.viewer.canEdit) {
    return <ErrorScreen code={403} id="AccessDenied" description={shared("accessDenied")} />;
  }

  const members = await queryAsViewer(api.organizations.members, { slug, page: 1 }).catch(() => null);
  const base = organizationHref(organization);

  return (
    <>
      <TitleRow
        title={t("title", { organization: organization.name })}
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
