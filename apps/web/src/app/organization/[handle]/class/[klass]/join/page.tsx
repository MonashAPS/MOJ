import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle, TitleRow } from "@moj/ui";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/auth/session";
import { queryAsViewer } from "@/lib/convex-server";
import { classHref, organizationHref, slugFromHandle } from "@/lib/organizations";
import { JoinClassForm } from "./JoinClassForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ klass: string }> }) {
  const { klass } = await params;
  return { title: `Join ${slugFromHandle(klass)}` };
}

export default async function JoinClassPage({
  params,
}: {
  params: Promise<{ handle: string; klass: string }>;
}) {
  const { handle, klass } = await params;
  const organizationSlug = slugFromHandle(handle);
  const classSlug = slugFromHandle(klass);

  const session = await getServerSession();
  if (!session) redirect(`/accounts/login/?next=/organization/${handle}/class/${klass}/join/`);

  const detail = await queryAsViewer(api.classes.get, { organizationSlug, classSlug });
  if (!detail) notFound();

  const base = classHref(detail.organization, detail);

  return (
    <>
      <TitleRow
        title={`Join ${detail.name}`}
        breadcrumb={
          <Link href={base} className="hover:underline">
            {detail.name}
          </Link>
        }
      />
      <div id="content-body">
        {detail.viewer.isMember ? (
          <Alert variant="info">
            <AlertTitle>You are already in {detail.name}.</AlertTitle>
          </Alert>
        ) : !detail.isActive ? (
          <Alert variant="warning">
            <AlertTitle>{detail.name} is not accepting members.</AlertTitle>
          </Alert>
        ) : !detail.viewer.isOrganizationMember ? (
          <Alert variant="warning">
            <AlertTitle>Join {detail.organization.name} first.</AlertTitle>
            <AlertDescription>
              <Link href={organizationHref(detail.organization)}>Go to {detail.organization.name}</Link>
            </AlertDescription>
          </Alert>
        ) : (
          <JoinClassForm
            organizationSlug={organizationSlug}
            classSlug={classSlug}
            name={detail.name}
            backHref={base}
            requiresAccessCode={detail.requiresAccessCode}
          />
        )}
      </div>
    </>
  );
}
