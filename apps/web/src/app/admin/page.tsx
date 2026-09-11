import { Panel } from "@moj/ui";
import Link from "next/link";
import { ADMIN_SECTIONS, AdminShell } from "@/components/admin";
import { RecentJobs } from "./(part1)/jobs/RecentJobs";

export const metadata = { title: "Overview" };

const BLURBS: Record<string, string> = {
  problems: "Statements, limits, languages, test data and rejudges.",
  contests: "Scheduling, problems, people, rating and locks.",
  submissions: "Find a submission, rejudge it, or rejudge a batch.",
  scoreboards: "The hall boards and what each one shows.",
  jobs: "Rejudges, rescores and ratings, with their progress.",
  users: "Accounts, permissions and points.",
  organizations: "Organisations, their admins and their members.",
  classes: "Classes inside an organisation.",
  tickets: "Problem reports from members.",
  apikeys: "Keys for the problems API and API v2.",
  judges: "Judge machines, their keys and their runtimes.",
  languages: "Executors, templates and per-language limits.",
  navigation: "The bar across the top of every page.",
  config: "Site settings and the miscellaneous config keys.",
  flatpages: "About, rules and the other written pages.",
  blog: "Posts on the front page and the blog.",
  licenses: "The licences a problem statement can carry.",
  tags: "Contest tags and their colours.",
};

export default function AdminOverviewPage() {
  return (
    <AdminShell title="Staff console" description="Everything this judge runs, in one place.">
      <div className="grid gap-4">
        {ADMIN_SECTIONS.map((group) => (
          <Panel key={group.label} title={group.label} bodyClassName="p-3">
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="flex h-full items-start gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:bg-row-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/45"
                    >
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-subtle">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="grid gap-0.5">
                        <span className="text-base font-medium text-foreground">{item.label}</span>
                        <span className="text-sm text-muted-foreground">{BLURBS[item.key]}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))}

        <RecentJobs limit={5} />
      </div>
    </AdminShell>
  );
}
