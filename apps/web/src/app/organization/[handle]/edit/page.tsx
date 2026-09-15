import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ErrorScreen } from "@/components/shell/ErrorScreen";
import { queryAsViewer } from "@/lib/convex-server";
import { organizationHref, slugFromHandle } from "@/lib/organizations";
import { EditOrganizationForm } from "./EditOrganizationForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const t = await getTranslations("organizations.edit");
  return { title: t("title", { organization: slugFromHandle(handle) }) };
}

export default async function EditOrganizationPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const slug = slugFromHandle(handle);
  const [t, shared] = await Promise.all([
    getTranslations("organizations.edit"),
    getTranslations("organizations.common"),
  ]);

  const organization = await queryAsViewer(api.organizations.get, { slug });
  if (!organization) notFound();
  // `forbidden()` needs `experimental.authInterrupts`, which the shell does not
  // turn on, so the 403 screen is rendered in place instead.
  if (!organization.viewer.canEdit) {
    return <ErrorScreen code={403} id="AccessDenied" description={shared("accessDenied")} />;
  }

  const members = await queryAsViewer(api.organizations.members, { slug, page: 1 }).catch(() => null);
  const options = new Map<string, string>();
  for (const admin of organization.admins) options.set(admin.username, admin.displayName);
  for (const member of members?.members ?? []) options.set(member.username, member.displayName);

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
        <EditOrganizationForm
          slug={slug}
          backHref={base}
          initialAbout={organization.about}
          initialLogo={organization.logoOverrideImage ?? ""}
          initialAdmins={organization.admins.map((admin) => admin.username)}
          adminOptions={[...options].map(([value, label]) => ({ value, label }))}
        />
      </div>
    </>
  );
}
