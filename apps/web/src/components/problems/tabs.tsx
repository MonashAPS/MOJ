import type { TabItem } from "@moj/ui";
import { BookOpen, Copy, Database, FileText, ListChecks, Send, Settings, Trophy, Vote } from "lucide-react";
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
  | "clone";

/**
 * DMOJ keeps these as links inside the info box; the club asked for the page's
 * own tab bar, so they are promoted to `make_tab` entries. The conditions are
 * DMOJ's, unchanged.
 */
export function problemTabs(problem: ProblemDetail): TabItem[] {
  const base = `/problem/${problem.code}`;
  const tabs: TabItem[] = [
    { key: "statement", label: "Statement", href: base, icon: <FileText /> },
    {
      key: "submissions",
      label:
        problem.stats.attempts > 0
          ? `Submissions (${problem.stats.attempts.toLocaleString("en-AU")})`
          : "Submissions",
      href: `${base}/submissions/`,
      icon: <ListChecks />,
    },
  ];

  if (problem.canSeeEditorial) {
    tabs.push({ key: "editorial", label: "Editorial", href: `${base}/editorial`, icon: <BookOpen /> });
  }
  if (problem.canSubmit) {
    tabs.push({ key: "submit", label: "Submit", href: `${base}/submit`, icon: <Send /> });
  }
  tabs.push({ key: "rank", label: "Ranks", href: `${base}/rank/`, icon: <Trophy /> });
  if (problem.viewer.canViewVotes) {
    tabs.push({ key: "vote", label: "Vote", href: `${base}/vote`, icon: <Vote /> });
  }
  if (problem.canEdit && !problem.isManuallyManaged) {
    tabs.push({ key: "test_data", label: "Test data", href: `${base}/test_data`, icon: <Database /> });
  }
  if (problem.canManageSubmissions) {
    tabs.push({
      key: "manage",
      label: "Manage submissions",
      href: `${base}/manage/submission`,
      icon: <Settings />,
    });
  }
  if (problem.canEdit) {
    tabs.push({ key: "clone", label: "Clone", href: `${base}/clone`, icon: <Copy /> });
  }
  return tabs;
}
