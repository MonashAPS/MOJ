import { api } from "@convex/_generated/api";
import { renderMarkdown } from "@moj/content";
import {
  Badge,
  Button,
  ContentDescription,
  MicroLabel,
  Panel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TitleRow,
  TwoColumn,
} from "@moj/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "@/auth/session";
import { MembershipActions } from "@/components/organizations/MembershipActions";
import { UserLink } from "@/components/users/UserLink";
import { queryAsViewer } from "@/lib/convex-server";
import { classHref, organizationHref, slugFromHandle } from "@/lib/organizations";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const organization = await queryAsViewer(api.organizations.get, { slug: slugFromHandle(handle) }).catch(
    () => null,
  );
  return { title: organization?.name ?? "Organization" };
}

export default async function OrganizationHomePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const slug = slugFromHandle(handle);

  const [organization, session] = await Promise.all([
    queryAsViewer(api.organizations.get, { slug }),
    getServerSession().catch(() => null),
  ]);
  if (!organization) notFound();

  const about = organization.about.trim()
    ? (await renderMarkdown(organization.about, organization.aboutPreset)).html
    : "";
  const base = organizationHref(organization);

  return (
    <>
      <TitleRow
        title={organization.name}
        breadcrumb={
          <Link href="/organizations/" className="hover:underline">
            Organizations
          </Link>
        }
        action={
          <Button variant="secondary" asChild>
            <a href={`${base}/users/`}>View members</a>
          </Button>
        }
      />
      <div id="content-body">
        <TwoColumn
          side={
            <>
              <Panel title="Membership" bodyClassName="grid gap-3 p-3">
                <MembershipActions
                  slug={organization.slug}
                  name={organization.name}
                  isOpen={organization.isOpen}
                  requiresAccessCode={organization.requiresAccessCode}
                  requestHref={`${base}/request/`}
                  viewer={organization.viewer}
                  signedIn={!!session}
                />
                <dl className="grid gap-1 border-t border-border pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <MicroLabel>Members</MicroLabel>
                    <span className="font-mono text-mono tabular-nums text-foreground">
                      {organization.memberCount}
                      {organization.slots === null ? null : (
                        <span className="text-muted-foreground"> / {organization.slots}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <MicroLabel>Short name</MicroLabel>
                    <span className="font-mono text-mono text-foreground">{organization.shortName}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <MicroLabel>Access</MicroLabel>
                    <Badge variant={organization.isOpen ? "good" : "neutral"}>
                      {organization.isOpen ? "Open" : "Private"}
                    </Badge>
                  </div>
                </dl>
                {organization.viewer.canEdit || organization.viewer.canReviewRequests ? (
                  <div className="grid gap-1 border-t border-border pt-3">
                    {organization.viewer.canEdit ? (
                      <Link href={`${base}/edit/`} className="text-base text-link hover:underline">
                        Edit organization
                      </Link>
                    ) : null}
                    {organization.viewer.canEdit ? (
                      <Link href={`${base}/kick/`} className="text-base text-link hover:underline">
                        Remove a member
                      </Link>
                    ) : null}
                    {organization.viewer.canReviewRequests ? (
                      <Link
                        href={`${base}/requests/pending/`}
                        className="text-base text-link hover:underline"
                      >
                        View requests
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </Panel>

              <Panel title="Administrators" bodyClassName="p-3">
                {organization.admins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">This organization has no administrators.</p>
                ) : (
                  <ul className="grid gap-1">
                    {organization.admins.map((admin) => (
                      <li key={admin._id}>
                        <UserLink
                          username={admin.username}
                          displayName={admin.displayName}
                          displayRank={admin.displayRank}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          }
        >
          <div className="grid min-w-0 gap-8 [&>*]:min-w-0">
            {about ? (
              <ContentDescription html={about} />
            ) : (
              <p className="text-base italic text-muted-foreground">
                This organization has not written anything about itself yet.
              </p>
            )}

            {organization.classes.length > 0 ? (
              <section>
                <h3 className="mb-2 font-display text-h3 font-semibold text-foreground">Classes</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead numeric>Members</TableHead>
                      <TableHead className="w-40" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organization.classes.map((klass) => (
                      <TableRow key={klass._id}>
                        <TableCell>
                          <Link href={classHref(organization, klass)} className="font-medium hover:text-link">
                            {klass.name}
                          </Link>
                          {klass.description ? (
                            <span className="block text-sm text-muted-foreground">{klass.description}</span>
                          ) : null}
                        </TableCell>
                        <TableCell numeric>{klass.memberCount}</TableCell>
                        <TableCell className="text-right">
                          {klass.joined ? (
                            <Badge variant="good">Joined</Badge>
                          ) : (
                            <Button variant="secondary" size="sm" asChild>
                              <a href={classHref(organization, klass, "/join/")}>Join class</a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            ) : null}
          </div>
        </TwoColumn>
      </div>
    </>
  );
}
