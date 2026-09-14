"use client";

import { api } from "@convex/_generated/api";
import { Badge, Button, EmptyState, type TabItem } from "@moj/ui";
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
import { ContestProctorTab } from "./ContestProctorTab";

const TABS = ["general", "problems", "people", "proctoring", "actions", "revisions"] as const;

export function ContestEditor({ contestKey }: { contestKey: string }) {
  const t = useTranslations("admin.contests.editor");
  const states = useTranslations("common.states");
  const params = useSearchParams();
  const active = TABS.some((tab) => tab === params.get("tab")) ? (params.get("tab") as string) : "general";

  const contest = useQuery(api.pages.admin1.contestEdit, { key: contestKey });
  const options = useQuery(api.pages.admin1.contestOptions, {});
  const revisions = useQuery(
    api.pages.admin1.revisionsFor,
    active === "revisions" ? { entityType: "contest" as const, key: contestKey } : "skip",
  );

  const tabs: TabItem[] = TABS.map((tab) => ({
    key: tab,
    label: t(`tabs.${tab}`),
    href: tab === "general" ? `/admin/contests/${contestKey}/` : `/admin/contests/${contestKey}/?tab=${tab}`,
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
            <Badge variant={contest.isVisible ? "good" : "neutral"} shape="square">
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
        <p className="text-sm text-muted-foreground">{states("loading")}</p>
      ) : active === "general" ? (
        <ContestGeneralTab contest={contest} options={options} />
      ) : active === "problems" ? (
        <ContestProblemsTab contest={contest} />
      ) : active === "people" ? (
        <ContestPeopleTab contest={contest} />
      ) : active === "proctoring" ? (
        <ContestProctorTab contest={contest} />
      ) : active === "actions" ? (
        <ContestActionsTab contest={contest} />
      ) : (
        <RevisionsPanel revisions={revisions} emptyDescription={t("revisionsEmpty")} />
      )}
    </AdminShell>
  );
}
