import { cn, focusRing, Panel, TitleRow } from "@moj/ui";
import Link from "next/link";
import { ADMIN_SECTIONS } from "@/components/admin/sections";

export const metadata = { title: "Console" };

/** What each section is for, in the console's own voice. */
const BLURB: Record<string, string> = {
  "/admin/problems": "Statements, limits, test data and who may edit them.",
  "/admin/contests": "Windows, formats, ratings and the problems in each contest.",
  "/admin/submissions": "Find a submission, rejudge it, or read its source.",
  "/admin/scoreboards": "The hall boards and what they show.",
  "/admin/jobs": "Rejudges, rescores and ratings that are still running.",
  "/admin/users": "Profiles, staff flags, permissions and account standing.",
  "/admin/organizations": "Membership, access codes and join requests.",
  "/admin/classes": "Groups inside an organisation, with their own admins.",
  "/admin/tickets": "What members have reported, and who is on it.",
  "/admin/judges": "The machines that grade, their keys and their runtimes.",
  "/admin/languages": "What members may submit in, and how it is highlighted.",
  "/admin/api-keys": "Keys for the problem repositories that upload here.",
  "/admin/navigation": "The bar at the top of every page.",
  "/admin/config": "Site settings and the HTML fragments DMOJ calls misc config.",
  "/admin/flatpages": "Static pages served by URL, like /about/.",
  "/admin/blog": "Announcements and editorials.",
  "/admin/licenses": "What a problem page credits when the statement is not ours.",
  "/admin/tags": "The tags that group contests on the contest list.",
};

export default function AdminIndexPage() {
  return (
    <>
      <TitleRow title="Console" />
      <div className="grid gap-4">
        {ADMIN_SECTIONS.map((group) => (
          <Panel key={group.label} title={group.label} bodyClassName="grid gap-2 p-3 sm:grid-cols-2">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-start gap-3 rounded-md border border-border p-3",
                    "hover:bg-row-hover",
                    focusRing,
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
                  <span className="grid gap-0.5">
                    <span className="font-medium text-foreground">{item.label}</span>
                    <span className="text-sm text-muted-foreground">{BLURB[item.href]}</span>
                  </span>
                </Link>
              );
            })}
          </Panel>
        ))}
      </div>
    </>
  );
}
