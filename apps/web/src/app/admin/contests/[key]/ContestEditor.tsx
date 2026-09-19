"use client";

import { api } from "@convex/_generated/api";
import { Badge, Button, EmptyState, SkeletonPanel, type TabItem } from "@moj/ui";
import { useQuery } from "convex/react";
import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AdminShell, RevisionsPanel } from "@/components/admin";
import { ContestActionsTab } from "./ContestActionsTab";
import { ContestGeneralTab } from "./ContestGeneralTab";
import { ContestPeopleTab } from "./ContestPeopleTab";
import { ContestProblemsTab } from "./ContestProblemsTab";

const TABS = ["setup", "access", "scoring", "problems", "people", "actions", "history"] as const;

/**
 * Where the tabs that used to exist now live. `general` was one page of nine
 * sections and `proctoring` was a page with one checkbox on it; both are links
 * people have in bookmarks and in Slack.
 */
const MOVED = {
  general: "setup",
  proctoring: "setup",
  revisions: "history",
} satisfies Record<string, (typeof TABS)[number]>;

export function ContestEditor({ contestKey }: { contestKey: string }) {
  const t = useTranslations("admin.contests.editor");
  const params = useSearchParams();
  const asked = params.get("tab") ?? "";
  // SAFETY: guarded by the `in` check on the line itself, so the key is one
  // MOVED carries.
  const moved = asked in MOVED ? MOVED[asked as keyof typeof MOVED] : undefined;
  const active = TABS.find((tab) => tab === asked) ?? moved ?? "setup";

  const contest = useQuery(api.pages.admin.contests.edit, { key: contestKey });
  const options = useQuery(api.pages.admin.contests.options, {});

  const revisions = useQuery(
    api.pages.admin.revisions.byKey,
    active === "history" ? { entityType: "contest" as const, key: contestKey } : "skip",
  );

  const tabs: TabItem[] = TABS.map((tab) => ({
    key: tab,
    label: t(`tabs.${tab}`),
    href: tab === "setup" ? `/admin/contests/${contestKey}/` : `/admin/contests/${contestKey}/?tab=${tab}`,
  }));

  const breadcrumb = [
    { label: t("breadcrumbConsole"), href: "/admin/" },
    { label: t("breadcrumbContests"), href: "/admin/contests/" },
    { label: contestKey },
  ];

  if (contest === null) {
    return (
      <AdminShell title={contestKey} breadcrumb={breadcrumb}>
        <EmptyState
          icon={<FileQuestion aria-hidden />}
          title={t("missingTitle")}
          description={t("missingDescription")}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/contests/">{t("backToContests")}</Link>
            </Button>
          }
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title={contest ? contest.name : contestKey}
      breadcrumb={breadcrumb}
      tabs={tabs}
      activeTab={active}
      action={
        contest ? (
          <>
            <Badge variant={contest.isVisible ? "good" : "neutral"} rounding="square">
              {contest.isVisible ? t("visible") : t("hidden")}
            </Badge>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/contest/${contestKey}/`}>{t("viewOnSite")}</Link>
            </Button>
          </>
        ) : null
      }
    >
      {contest === undefined ? (
        <div className="grid gap-4">
          <SkeletonPanel lines={5} />
          <SkeletonPanel lines={3} />
        </div>
      ) : active === "setup" || active === "access" || active === "scoring" ? (
        <ContestGeneralTab contest={contest} options={options} tab={active} />
      ) : active === "problems" ? (
        <ContestProblemsTab contest={contest} />
      ) : active === "people" ? (
        <ContestPeopleTab contest={contest} />
      ) : active === "actions" ? (
        <ContestActionsTab contest={contest} />
      ) : (
        <RevisionsPanel revisions={revisions} emptyDescription={t("revisionsEmpty")} />
      )}
    </AdminShell>
  );
}
