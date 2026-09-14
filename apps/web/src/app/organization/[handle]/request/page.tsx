import { api } from "@convex/_generated/api";
import { Alert, AlertTitle, TitleRow } from "@moj/ui";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/auth/session";
import { queryAsViewer } from "@/lib/convex-server";
import { organizationHref, slugFromHandle } from "@/lib/organizations";
import { RequestJoinForm } from "./RequestJoinForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const t = await getTranslations("organizations.request");
  return { title: t("title", { organization: slugFromHandle(handle) }) };
}

export default async function RequestJoinPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const slug = slugFromHandle(handle);
  const t = await getTranslations("organizations.request");

  const session = await getServerSession();
  if (!session) redirect(`/accounts/login/?next=/organization/${handle}/request/`);

  const organization = await queryAsViewer(api.organizations.get, { slug });
  if (!organization) notFound();
  // `RequestJoinOrganization` 404s on an open organisation: there is nothing to
  // request, you simply join.
  if (organization.isOpen) notFound();

  const base = organizationHref(organization);
  const classes = await queryAsViewer(api.classes.listForOrganization, {
    organizationSlug: slug,
    activeOnly: true,
  }).catch(() => []);

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
        {organization.viewer.isMember ? (
          <Alert variant="info">
            <AlertTitle>{t("alreadyMember", { organization: organization.name })}</AlertTitle>
          </Alert>
        ) : organization.viewer.hasPendingRequest ? (
          <Alert variant="info">
            <AlertTitle>{t("alreadyRequested")}</AlertTitle>
          </Alert>
        ) : (
          <RequestJoinForm
            slug={slug}
            name={organization.name}
            backHref={base}
            classes={classes.map((klass) => ({ value: klass.slug, label: klass.name }))}
            classRequired={organization.classRequired}
          />
        )}
      </div>
    </>
  );
}
