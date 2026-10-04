"use client";

import type { ContestProgress as Progress } from "@convex/contests";
import { cn, Tooltip } from "@moj/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * How far the viewer has got through a contest, as one square per problem.
 *
 * Green is solved, grey is not, and each square is the problem: hovering names
 * it, clicking opens it when the viewer has access.
 */
export function ContestProgress({ progress }: { progress: Progress }) {
  const t = useTranslations("contests.progress");

  if (progress.total === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {progress.problems.map((problem) => {
          const props = {
            "aria-label": problem.name,
            className: cn(
              "relative z-1 block size-4 rounded-xs border",
              problem.solved ? "border-success-ink bg-success-ink" : "border-border bg-secondary",
              problem.isAccessible &&
                "transition-[transform,border-color,box-shadow] hover:scale-115 hover:shadow-xs",
              problem.isAccessible && (problem.solved ? "hover:border-foreground" : "hover:border-primary"),
            ),
          };

          return (
            <Tooltip
              key={problem.code}
              content={`${problem.label}. ${problem.name}${problem.solved ? ` — ${t("solvedOne")}` : ""}`}
            >
              {problem.isAccessible ? (
                <Link href={`/problem/${problem.code}/`} {...props} />
              ) : (
                <span {...props} />
              )}
            </Tooltip>
          );
        })}
      </div>

      <span className="text-sm tabular-nums text-muted-foreground">
        {t("solvedCount", { solved: progress.solved, total: progress.total })}
      </span>
    </div>
  );
}
