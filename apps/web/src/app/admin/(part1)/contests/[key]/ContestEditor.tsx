"use client";

import { api } from "@convex/_generated/api";
import { Badge, Button, EmptyState, type TabItem } from "@moj/ui";
import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminShell, RevisionsPanel } from "@/components/admin";
import { useAdminContestEdit, useAdminContestOptions } from "@/components/admin/fallbacks";
import { useConsoleQuery } from "@/components/admin/useConsoleQuery";
import { ContestActionsTab } from "./ContestActionsTab";
import { ContestGeneralTab } from "./ContestGeneralTab";
import { ContestPeopleTab } from "./ContestPeopleTab";
import { ContestProblemsTab } from "./ContestProblemsTab";

const TABS = [
  { key: "general", label: "General" },
  { key: "problems", label: "Problems" },
  { key: "people", label: "People" },
  { key: "actions", label: "Actions" },
  { key: "revisions", label: "Revisions" },
];

export function ContestEditor({ contestKey }: { contestKey: string }) {
  const params = useSearchParams();
  const active = TABS.some((tab) => tab.key === params.get("tab"))
    ? (params.get("tab") as string)
    : "general";

  const { data: contest } = useAdminContestEdit(contestKey);
  const { data: options } = useAdminContestOptions();
  const revisions = useConsoleQuery(
    api.pages.admin1.revisionsFor,
    active === "revisions" ? { entityType: "contest" as const, key: contestKey } : "skip",
  );

  const tabs: TabItem[] = TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    href:
      tab.key === "general"
        ? `/admin/contests/${contestKey}/`
        : `/admin/contests/${contestKey}/?tab=${tab.key}`,
  }));

  const breadcrumb = [
    { label: "Staff console", href: "/admin/" },
    { label: "Contests", href: "/admin/contests/" },
    { label: contestKey },
  ];

  if (contest === null) {
    return (
      <AdminShell title={contestKey} breadcrumb={breadcrumb}>
        <EmptyState
          icon={<FileQuestion aria-hidden />}
          title="No such contest"
          description="There is no contest with that id, or it is not one you may edit."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/contests/">Back to contests</Link>
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
              {contest.isVisible ? "Visible" : "Hidden"}
            </Badge>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/contest/${contestKey}/`}>View on site</Link>
            </Button>
          </>
        ) : null
      }
    >
      {contest === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : active === "general" ? (
        <ContestGeneralTab contest={contest} options={options} />
      ) : active === "problems" ? (
        <ContestProblemsTab contest={contest} />
      ) : active === "people" ? (
        <ContestPeopleTab contest={contest} />
      ) : active === "actions" ? (
        <ContestActionsTab contest={contest} />
      ) : (
        <RevisionsPanel
          revisions={revisions.data ?? (revisions.unavailable ? [] : undefined)}
          loading={revisions.data === undefined && !revisions.unavailable}
          emptyDescription="Every edit to this contest is recorded here with the reason it was made."
        />
      )}
    </AdminShell>
  );
}
