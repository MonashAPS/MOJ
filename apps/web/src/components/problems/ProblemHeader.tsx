"use client";

import { Button, PageTabs, type TabItem, TitleRow, TwoColumn } from "@moj/ui";
import { CheckCircle2, CircleDashed, CircleSlash2, FileDown } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ProblemTabLink } from "@/components/problems/EditorialLink";
import { type ProblemDetail, ProblemInfoBox } from "@/components/problems/ProblemInfoBox";
import { type ProblemTabKey, problemTabs } from "@/components/problems/tabs";

const STATE_ICON = new Map([
  ["solved", { Icon: CheckCircle2, tone: "var(--state-solved)", label: "solved" }],
  ["partial", { Icon: CircleSlash2, tone: "var(--state-partial)", label: "partial" }],
  ["attempted", { Icon: CircleDashed, tone: "var(--state-attempted)", label: "attempted" }],
]);

/**
 * Every route under `/problem/<code>` wears the same chrome: DMOJ's title row
 * with "View as PDF" beside the name, the problem's tab bar on the row under it,
 * the rule, and the info box in the sticky sidebar. Switching tabs therefore
 * changes only the column that has to change, and the shell's route progress bar
 * and page-enter reveal carry it — which is why the tabs render `next/link`
 * rather than plain anchors.
 *
 * The tabs take a row of their own rather than sharing the title's: a staff
 * viewer has as many as ten of them, which beside a title either crushes the
 * name or wraps into a ragged second row starting halfway across the page.
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
  const state = STATE_ICON.get(problem.viewer.state);

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
            // A long name wraps as text rather than being cut; the state icon
            // stays with the first line instead of centring itself down the side
            // of a title that wrapped.
            <span className="flex min-w-0 items-start gap-2">
              {state ? (
                <state.Icon
                  size={20}
                  aria-label={states(state.label)}
                  style={{ color: state.tone }}
                  className="mt-1 shrink-0"
                />
              ) : null}
              <span className="min-w-0 break-words">{problem.statement.name}</span>
            </span>
          )
        }
        action={
          <Button asChild variant="ghost" icon={<FileDown size={14} />}>
            <a href={`/problem/${problem.code}/pdf`}>{t("viewAsPdf")}</a>
          </Button>
        }
        ruler={false}
      />
      {/* Block-level, so the strip spans the column whatever the tab count is
          and scrolls inside itself once it runs out of room. */}
      <PageTabs
        tabs={tabs ?? problemTabs(problem, t)}
        active={active}
        linkAs={ProblemTabLink}
        className="mt-3"
      />
      {/* `TitleRow`'s own rule, drawn here instead so it closes the tab row. */}
      <hr className="page-rule mb-6 mt-3" />
      <div id="content-body">
        <TwoColumn side={<ProblemInfoBox problem={problem} />}>{children}</TwoColumn>
      </div>
    </>
  );
}
