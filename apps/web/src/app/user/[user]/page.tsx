import { api } from "@convex/_generated/api";
import { renderMarkdown } from "@moj/content";
import {
  ContentDescription,
  Panel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moj/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RatingChart } from "@/components/users/RatingChart";
import { SubmissionActivity } from "@/components/users/SubmissionActivity";
import { UserShell } from "@/components/users/UserShell";
import { query, queryAsViewer } from "@/lib/convex-server";
import { gravatarUrlForUserId } from "@/lib/gravatar";
import { organizationHref } from "@/lib/organizations";

export const dynamic = "force-dynamic";

/** How many of the user's best-scoring problems the About tab previews before
 *  sending the reader to the Problems tab. */
const BEST_PREVIEW = 10;

export async function generateMetadata({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const t = await getTranslations("users.profile");
  return { title: t("metaTitle", { username: decodeURIComponent(user) }) };
}

export default async function UserAboutPage({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const username = decodeURIComponent(user);
  const t = await getTranslations("users.profile");

  const data = await queryAsViewer(api.profiles.userPage, { username });
  if (!data) notFound();

  const [gravatar, organizations, about] = await Promise.all([
    gravatarUrlForUserId(data.profile.userId, 224),
    query(api.organizations.list, {}).catch(() => []),
    data.about.trim() ? renderMarkdown(data.about, data.aboutPreset).then((result) => result.html) : "",
  ]);

  const organizationLinks: Record<string, string> = {};
  for (const organization of organizations) {
    organizationLinks[organization.slug] = organizationHref(organization);
  }

  const best = data.bestSubmissions
    .flatMap((group) => group.problems.map((problem) => ({ ...problem, group: group.name })))
    .sort((a, b) => (b.points === a.points ? a.code.localeCompare(b.code) : b.points - a.points))
    .slice(0, BEST_PREVIEW);

  return (
    <UserShell
      data={data}
      gravatar={gravatar}
      tab="about"
      isViewer={data.isViewer}
      organizationLinks={organizationLinks}
    >
      <div className="grid min-w-0 gap-8 [&>*]:min-w-0">
        {about ? (
          <ContentDescription html={about} />
        ) : (
          <p className="text-base italic text-muted-foreground">
            {data.isViewer ? t("aboutEmptyViewer") : t("aboutEmptyOther")}
          </p>
        )}

        <SubmissionActivity
          counts={data.submissionActivity.counts}
          minYear={data.submissionActivity.minYear}
        />

        <Panel title={t("rating")} bodyClassName="p-3">
          <RatingChart points={data.ratingHistory} />
        </Panel>

        {best.length > 0 ? (
          <Panel
            title={t("bestSubmissions")}
            bodyClassName="p-0"
            action={
              <Link
                href={`/user/${data.profile.username}/solved/`}
                className="text-sm text-titlebar-ink-2 hover:text-titlebar-ink"
              >
                {t("allSolved")}
              </Link>
            }
          >
            <Table scrollable={false} className="group/table" dense>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("problem")}</TableHead>
                  <TableHead>{t("category")}</TableHead>
                  <TableHead numeric>{t("score")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {best.map((problem) => (
                  <TableRow key={problem.code}>
                    <TableCell>
                      <Link href={`/problem/${problem.code}`} className="font-medium hover:text-link">
                        {problem.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-subtle">{problem.group}</TableCell>
                    <TableCell numeric>
                      {problem.points}
                      <span className="text-muted-foreground"> / {problem.total}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        ) : null}

        {data.authoredProblems.length > 0 ? (
          <Panel title={t("authored", { count: data.authoredProblems.length })} bodyClassName="p-3">
            <ul className="grid gap-1">
              {data.authoredProblems.map((problem) => (
                <li key={problem.code}>
                  <Link href={`/problem/${problem.code}`} className="text-base text-link hover:underline">
                    {problem.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    </UserShell>
  );
}
