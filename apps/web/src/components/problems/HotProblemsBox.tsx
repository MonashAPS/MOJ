"use client";

import { api } from "@convex/_generated/api";
import { Panel } from "@moj/ui";
import { useQuery } from "convex/react";
import { Flame } from "lucide-react";
import Link from "next/link";
import { formatPoints } from "@/lib/units";

/** DMOJ's "Hot problems" sidebox, under the search form. */
export function HotProblemsBox() {
  const problems = useQuery(api.problems.hotProblems, {});
  if (problems === undefined || problems.length === 0) return null;

  return (
    <Panel title="Hot problems" icon={<Flame size={14} />} bodyClassName="p-0">
      <ul>
        {problems.map((problem) => (
          <li key={problem.id} className="border-b border-border last:border-b-0">
            <Link
              href={`/problem/${problem.code}`}
              className="flex min-h-[30px] items-center gap-2 px-3 py-1.5 text-base text-subtle hover:bg-row-hover hover:text-link"
            >
              <span className="min-w-0 flex-1 truncate">{problem.name}</span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                {formatPoints(problem.points)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
