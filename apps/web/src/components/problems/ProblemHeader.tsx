import { TitleRow } from "@moj/ui";
import Link from "next/link";
import type { ProblemDetail } from "@/components/problems/ProblemInfoBox";
import { type ProblemTabKey, problemTabs } from "@/components/problems/tabs";

/**
 * Every problem sub-page wears the same title row: DMOJ's linked content title
 * ("Submit to <problem>") over the problem's own tab bar.
 */
export function ProblemHeader({
  problem,
  active,
  title,
  action,
}: {
  problem: ProblemDetail;
  active: ProblemTabKey;
  title?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <TitleRow
      breadcrumb={
        <Link href={`/problem/${problem.code}`} className="hover:text-link">
          {problem.name}
        </Link>
      }
      title={title ?? problem.name}
      tabs={problemTabs(problem)}
      active={active}
      action={action}
    />
  );
}
