import { api } from "@convex/_generated/api";
import { Alert, AlertTitle, TitleRow } from "@moj/ui";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/auth/session";
import { queryAsViewer } from "@/lib/convex-server";
import { organizationHref, slugFromHandle } from "@/lib/organizations";
import { RequestJoinForm } from "./RequestJoinForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return { title: `Request to join ${slugFromHandle(handle)}` };
}

export default async function RequestJoinPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const slug = slugFromHandle(handle);

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
        title={`Request to join ${organization.name}`}
        breadcrumb={
          <Link href={base} className="hover:underline">
            {organization.name}
          </Link>
        }
      />
      <div id="content-body">
        {organization.viewer.isMember ? (
          <Alert variant="info">
            <AlertTitle>You are already in {organization.name}.</AlertTitle>
          </Alert>
        ) : organization.viewer.hasPendingRequest ? (
          <Alert variant="info">
            <AlertTitle>You already have a request waiting for review.</AlertTitle>
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
