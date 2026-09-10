import { api } from "@convex/_generated/api";
import { renderMarkdown } from "@moj/content";
import { ContentDescription, Panel, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@moj/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  return { title: `User ${decodeURIComponent(user)}` };
}

export default async function UserAboutPage({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const username = decodeURIComponent(user);

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
      <div className="grid gap-8">
        {about ? (
          <ContentDescription html={about} />
        ) : (
          <p className="text-base italic text-muted-foreground">
            {data.isViewer
              ? "You have not shared any information."
              : "This user has not shared any information."}
          </p>
        )}

        <SubmissionActivity
          counts={data.submissionActivity.counts}
          minYear={data.submissionActivity.minYear}
        />

        {data.ratingHistory.length > 0 ? (
          <section>
            <h3 className="mb-2 font-display text-h3 font-semibold text-foreground">Rating history</h3>
            <div className="rounded-md border border-border bg-card p-3">
              <RatingChart points={data.ratingHistory} />
            </div>
          </section>
        ) : null}

        {best.length > 0 ? (
          <Panel
            title="Best submissions"
            bodyClassName="p-0"
            action={
              <Link
                href={`/user/${data.profile.username}/solved/`}
                className="text-sm text-titlebar-ink-2 hover:text-titlebar-ink"
              >
                All solved problems
              </Link>
            }
          >
            <Table scrollable={false} className="group/table" dense>
              <TableHeader>
                <TableRow>
                  <TableHead>Problem</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead numeric>Score</TableHead>
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
          <Panel title={`Authored problems (${data.authoredProblems.length})`} bodyClassName="p-3">
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
