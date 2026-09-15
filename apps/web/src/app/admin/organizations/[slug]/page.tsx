import { api } from "@convex/_generated/api";
import { EmptyState, TitleRow } from "@moj/ui";
import { Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Crumbs } from "@/components/admin/Crumbs";
import { queryAsViewer } from "@/lib/convex-server";
import { OrganizationEditor } from "./OrganizationEditor";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: decodeURIComponent(slug) };
}

export default async function AdminOrganizationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);

  const [t, organization] = await Promise.all([
    getTranslations("admin.organizations.detail"),
    queryAsViewer(api.admin.organizations.get, { slug }).catch(() => null),
  ]);
  const crumbs = (
    <Crumbs
      items={[{ label: t("crumb"), href: "/admin/organizations/" }, { label: organization?.name ?? slug }]}
    />
  );

  if (!organization) {
    return (
      <>
        <TitleRow title={slug} breadcrumb={crumbs} />
        <EmptyState
          icon={<Building2 aria-hidden />}
          title={t("notFoundTitle")}
          description={t("notFoundDescription", { slug })}
        />
      </>
    );
  }

  const revisions = await queryAsViewer(api.pages.admin.revisions.byId, {
    entityType: "organizations",
    entityId: organization._id,
  }).catch(() => null);

  return (
    <>
      <TitleRow title={organization.name} breadcrumb={crumbs} />
      <OrganizationEditor organization={organization} revisions={revisions} />
    </>
  );
}
