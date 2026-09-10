"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { Badge, Button, EmptyState, type TabItem } from "@moj/ui";
import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminShell, RevisionsPanel } from "@/components/admin";
import { ProblemActionsTab } from "./ProblemActionsTab";
import {
  ProblemClarificationsTab,
  ProblemEditorialTab,
  ProblemLanguageLimitsTab,
  ProblemTranslationsTab,
} from "./ProblemContentTabs";
import { ProblemGeneralTab } from "./ProblemGeneralTab";
import { ProblemStatementTab } from "./ProblemStatementTab";

const TABS: { key: string; label: string }[] = [
  { key: "general", label: "General" },
  { key: "statement", label: "Statement" },
  { key: "editorial", label: "Editorial" },
  { key: "translations", label: "Translations" },
  { key: "limits", label: "Language limits" },
  { key: "clarifications", label: "Clarifications" },
  { key: "data", label: "Test data" },
  { key: "revisions", label: "Revisions" },
  { key: "actions", label: "Actions" },
];

export function ProblemEditor({ code }: { code: string }) {
  const params = useSearchParams();
  const active = TABS.some((tab) => tab.key === params.get("tab"))
    ? (params.get("tab") as string)
    : "general";

  const problem = useQuery(api.pages.admin1.problemEdit, { code });
  const options = useQuery(api.pages.admin1.problemOptions, {});
  const revisions = useQuery(
    api.pages.admin1.revisionsFor,
    active === "revisions" ? { entityType: "problem" as const, key: code } : "skip",
  );

  const tabs: TabItem[] = TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    href: tab.key === "general" ? `/admin/problems/${code}/` : `/admin/problems/${code}/?tab=${tab.key}`,
  }));

  if (problem === null) {
    return (
      <AdminShell
        title={code}
        breadcrumb={[
          { label: "Staff console", href: "/admin/" },
          { label: "Problems", href: "/admin/problems/" },
          { label: code },
        ]}
      >
        <EmptyState
          icon={<FileQuestion aria-hidden />}
          title="No such problem"
          description="There is no problem with that code, or it is not one you may edit."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/problems/">Back to problems</Link>
            </Button>
          }
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title={problem ? problem.name : code}
      breadcrumb={[
        { label: "Staff console", href: "/admin/" },
        { label: "Problems", href: "/admin/problems/" },
        { label: code },
      ]}
      tabs={tabs}
      activeTab={active}
      action={
        problem ? (
          <>
            <Badge variant={problem.isPublic ? "good" : "neutral"} shape="square">
              {problem.isPublic ? "Public" : "Private"}
            </Badge>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/problem/${code}/`}>View on site</Link>
            </Button>
          </>
        ) : null
      }
    >
      {problem === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : active === "general" ? (
        <ProblemGeneralTab problem={problem} options={options} />
      ) : active === "statement" ? (
        <ProblemStatementTab problem={problem} />
      ) : active === "editorial" ? (
        <ProblemEditorialTab problem={problem} />
      ) : active === "translations" ? (
        <ProblemTranslationsTab problem={problem} />
      ) : active === "limits" ? (
        <ProblemLanguageLimitsTab problem={problem} options={options} />
      ) : active === "clarifications" ? (
        <ProblemClarificationsTab problem={problem} />
      ) : active === "data" ? (
        <TestDataTab code={code} />
      ) : active === "revisions" ? (
        <RevisionsPanel
          revisions={revisions}
          emptyDescription="Every edit to this problem is recorded here with the reason it was made."
        />
      ) : (
        <ProblemActionsTab problem={problem} options={options} />
      )}
    </AdminShell>
  );
}

/** Test data has its own editor on the public side; the console links to it. */
function TestDataTab({ code }: { code: string }) {
  return (
    <EmptyState
      icon={<FileQuestion aria-hidden />}
      title="Test data lives on the problem page"
      description="Cases, generators, checkers and the archive are edited in the test data editor, which validates the archive as you go."
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href={`/problem/${code}/test_data/`}>Open the test data editor</Link>
        </Button>
      }
    />
  );
}
