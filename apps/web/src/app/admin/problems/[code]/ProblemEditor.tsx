"use client";

import { api } from "@convex/_generated/api";
import { Badge, Button, EmptyState, SkeletonPanel, type TabItem } from "@moj/ui";
import { useQuery } from "convex/react";
import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
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

const TABS = [
  "general",
  "statement",
  "editorial",
  "translations",
  "limits",
  "clarifications",
  "data",
  "revisions",
  "actions",
] as const;

export function ProblemEditor({ code }: { code: string }) {
  const t = useTranslations("admin.problems.editor");
  const shared = useTranslations("admin.problems.shared");
  const params = useSearchParams();
  const active = TABS.find((tab) => tab === params.get("tab")) ?? "general";

  const problem = useQuery(api.pages.admin.problems.edit, { code });
  const options = useQuery(api.pages.admin.problems.options, {});

  const revisions = useQuery(
    api.pages.admin.revisions.byKey,
    active === "revisions" ? { entityType: "problem" as const, key: code } : "skip",
  );

  const tabs: TabItem[] = TABS.map((tab) => ({
    key: tab,
    label: t(`tab.${tab}`),
    href: tab === "general" ? `/admin/problems/${code}/` : `/admin/problems/${code}/?tab=${tab}`,
  }));

  const breadcrumb = [
    { label: shared("consoleCrumb"), href: "/admin/" },
    { label: shared("problemsCrumb"), href: "/admin/problems/" },
    { label: code },
  ];

  if (problem === null) {
    return (
      <AdminShell title={code} breadcrumb={breadcrumb}>
        <EmptyState
          icon={<FileQuestion aria-hidden />}
          title={t("notFoundTitle")}
          description={t("notFoundDescription")}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/problems/">{t("backToProblems")}</Link>
            </Button>
          }
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title={problem ? problem.name : code}
      breadcrumb={breadcrumb}
      tabs={tabs}
      activeTab={active}
      action={
        problem ? (
          <>
            <Badge variant={problem.isPublic ? "good" : "neutral"} rounding="square">
              {problem.isPublic ? t("public") : t("private")}
            </Badge>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/problem/${code}/`}>{t("viewOnSite")}</Link>
            </Button>
          </>
        ) : null
      }
    >
      {problem === undefined ? (
        <div className="grid gap-4">
          <SkeletonPanel lines={5} />
          <SkeletonPanel lines={3} />
        </div>
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
        <RevisionsPanel revisions={revisions} emptyDescription={t("revisionsEmpty")} />
      ) : (
        <ProblemActionsTab problem={problem} options={options} />
      )}
    </AdminShell>
  );
}

/** Test data has its own editor on the public side; the console links to it. */
function TestDataTab({ code }: { code: string }) {
  const t = useTranslations("admin.problems.editor");

  return (
    <EmptyState
      icon={<FileQuestion aria-hidden />}
      title={t("testDataTitle")}
      description={t("testDataDescription")}
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href={`/problem/${code}/test_data/`}>{t("testDataAction")}</Link>
        </Button>
      }
    />
  );
}
