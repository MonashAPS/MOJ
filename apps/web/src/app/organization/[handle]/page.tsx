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
import { getTranslations } from "next-intl/server";
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

  const t = await getTranslations("organizations.home");

  return { title: organization?.name ?? t("metaTitle") };
}

export default async function OrganizationHomePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const slug = slugFromHandle(handle);
  const t = await getTranslations("organizations.home");

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
            {t("breadcrumb")}
          </Link>
        }
        action={
          <Button variant="secondary" asChild>
            <a href={`${base}/users/`}>{t("viewMembers")}</a>
          </Button>
        }
      />
      <div id="content-body">
        <TwoColumn
          side={
            <>
              <Panel title={t("membership")} bodyClassName="grid gap-3 p-3">
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
                    <MicroLabel>{t("members")}</MicroLabel>
                    <span className="font-mono text-mono tabular-nums text-foreground">
                      {organization.memberCount}
                      {organization.slots === null ? null : (
                        <span className="text-muted-foreground"> / {organization.slots}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <MicroLabel>{t("shortName")}</MicroLabel>
                    <span className="font-mono text-mono text-foreground">{organization.shortName}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <MicroLabel>{t("access")}</MicroLabel>
                    <Badge variant={organization.isOpen ? "good" : "neutral"}>
                      {organization.isOpen ? t("open") : t("private")}
                    </Badge>
                  </div>
                </dl>
                {organization.viewer.canEdit || organization.viewer.canReviewRequests ? (
                  <div className="grid gap-1 border-t border-border pt-3">
                    {organization.viewer.canEdit ? (
                      <Link href={`${base}/edit/`} className="text-base text-link hover:underline">
                        {t("edit")}
                      </Link>
                    ) : null}
                    {organization.viewer.canEdit ? (
                      <Link href={`${base}/kick/`} className="text-base text-link hover:underline">
                        {t("removeMember")}
                      </Link>
                    ) : null}
                    {organization.viewer.canReviewRequests ? (
                      <Link
                        href={`${base}/requests/pending/`}
                        className="text-base text-link hover:underline"
                      >
                        {t("viewRequests")}
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </Panel>

              <Panel title={t("administrators")} bodyClassName="p-3">
                {organization.admins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noAdministrators")}</p>
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
              <p className="text-base italic text-muted-foreground">{t("aboutEmpty")}</p>
            )}

            {organization.classes.length > 0 ? (
              <section>
                <h3 className="mb-2 font-display text-h3 font-semibold text-foreground">{t("classes")}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("class")}</TableHead>
                      <TableHead numeric>{t("classMembers")}</TableHead>
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
                            <Badge variant="good">{t("joined")}</Badge>
                          ) : (
                            <Button variant="secondary" size="sm" asChild>
                              <a href={classHref(organization, klass, "/join/")}>{t("joinClass")}</a>
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
