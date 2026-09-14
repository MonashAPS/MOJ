"use client";

import { Button, type TabItem, TitleRow, TwoColumn } from "@moj/ui";
import { CheckCircle2, CircleDashed, CircleSlash2, FileDown } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ProblemTabLink } from "@/components/problems/EditorialLink";
import { type ProblemDetail, ProblemInfoBox } from "@/components/problems/ProblemInfoBox";
import { type ProblemTabKey, problemTabs } from "@/components/problems/tabs";

const STATE_ICON = {
  solved: { Icon: CheckCircle2, tone: "var(--state-solved)", label: "solved" },
  partial: { Icon: CircleSlash2, tone: "var(--state-partial)", label: "partial" },
  attempted: { Icon: CircleDashed, tone: "var(--state-attempted)", label: "attempted" },
} as const;

/**
 * Every route under `/problem/<code>` wears the same chrome: DMOJ's title row,
 * the problem's tab bar, "View as PDF" at the far right, and the info box in the
 * sticky sidebar. Switching tabs therefore changes only the column that has to
 * change, and the shell's route progress bar and page-enter reveal carry it —
 * which is why the tabs render `next/link` rather than plain anchors.
 */
export function ProblemPage({
  problem,
  active,
  title,
  breadcrumb,
  tabs,
  children,
}: {
  problem: ProblemDetail;
  active: ProblemTabKey;
  title?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  tabs?: TabItem[];
  children: React.ReactNode;
}) {
  const t = useTranslations("problems.detail");
  const states = useTranslations("problems.state");
  const state = STATE_ICON[problem.viewer.state as keyof typeof STATE_ICON];

  return (
    <>
      <TitleRow
        breadcrumb={
          breadcrumb ??
          (active === "statement" ? undefined : (
            <Link href={`/problem/${problem.code}`} className="hover:text-link">
              {problem.statement.name}
            </Link>
          ))
        }
        title={
          title ?? (
            <span className="flex items-center gap-2">
              {state ? (
                <state.Icon size={20} aria-label={states(state.label)} style={{ color: state.tone }} />
              ) : null}
              <span>{problem.statement.name}</span>
            </span>
          )
        }
        tabs={tabs ?? problemTabs(problem, t)}
        active={active}
        linkAs={ProblemTabLink}
        action={
          <Button asChild variant="ghost" icon={<FileDown size={14} />}>
            <a href={`/problem/${problem.code}/pdf`}>{t("viewAsPdf")}</a>
          </Button>
        }
      />
      <div id="content-body">
        <TwoColumn side={<ProblemInfoBox problem={problem} />}>{children}</TwoColumn>
      </div>
    </>
  );
}
