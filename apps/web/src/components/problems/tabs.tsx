import type { TabItem } from "@moj/ui";
import { BookOpen, Copy, Database, FileText, ListChecks, Send, Settings, Trophy, Vote } from "lucide-react";
import type { useTranslations } from "next-intl";
import type { ProblemDetail } from "@/components/problems/ProblemInfoBox";

export type ProblemTabKey =
  | "statement"
  | "submissions"
  | "editorial"
  | "submit"
  | "rank"
  | "vote"
  | "test_data"
  | "manage"
  | "clone"
  | "tickets";

/**
 * DMOJ keeps these as links inside the info box; MOJ gives the page its own tab
 * bar, so they are promoted to `make_tab` entries. The conditions are DMOJ's,
 * unchanged.
 */
export function problemTabs(problem: ProblemDetail, t: ReturnType<typeof useTranslations>): TabItem[] {
  const base = `/problem/${problem.code}`;

  const tabs: TabItem[] = [
    { key: "statement", label: t("tabStatement"), href: base, icon: <FileText /> },
    {
      key: "submissions",
      label: t("tabSubmissions", { count: problem.stats.attempts }),
      href: `${base}/submissions/`,
      icon: <ListChecks />,
    },
  ];

  if (problem.canSeeEditorial) {
    tabs.push({ key: "editorial", label: t("tabEditorial"), href: `${base}/editorial`, icon: <BookOpen /> });
  }

  if (problem.canSubmit) {
    tabs.push({ key: "submit", label: t("tabSubmit"), href: `${base}/submit`, icon: <Send /> });
  }

  tabs.push({ key: "rank", label: t("tabRanks"), href: `${base}/rank/`, icon: <Trophy /> });

  if (problem.viewer.canViewVotes) {
    tabs.push({ key: "vote", label: t("tabVote"), href: `${base}/vote`, icon: <Vote /> });
  }

  if (problem.canEdit && !problem.isManuallyManaged) {
    tabs.push({ key: "test_data", label: t("tabTestData"), href: `${base}/test_data`, icon: <Database /> });
  }

  if (problem.canManageSubmissions) {
    tabs.push({
      key: "manage",
      label: t("tabManage"),
      href: `${base}/manage/submission`,
      icon: <Settings />,
    });
  }

  if (problem.canEdit) {
    tabs.push({ key: "clone", label: t("tabClone"), href: `${base}/clone`, icon: <Copy /> });
  }

  return tabs;
}
