import { Panel } from "@moj/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ADMIN_SECTIONS, AdminShell } from "@/components/admin";
import { RecentJobs } from "./(part1)/jobs/RecentJobs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.shell.overview");
  return { title: t("metaTitle") };
}

export default async function AdminOverviewPage() {
  const t = await getTranslations("admin.shell");

  return (
    <AdminShell title={t("consoleName")} description={t("overview.description")}>
      <div className="grid gap-4">
        {ADMIN_SECTIONS.map((group) => (
          <Panel key={group.key} title={t(`sections.groups.${group.key}`)} bodyClassName="p-3">
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
                        <span className="text-base font-medium text-foreground">
                          {t(`sections.items.${item.key}`)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {t(`overview.blurbs.${item.key}`)}
                        </span>
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
