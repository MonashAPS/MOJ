"use client";

import type { ContestProgress as Progress } from "@convex/contests";
import { Tooltip } from "@moj/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * How far the viewer has got through a contest, as one square per problem.
 *
 * Green is solved, grey is not, and each square is the problem: hovering names
 * it, clicking opens it. Every problem is here, public or not — the contest's
 * own page already names them all.
 */
export function ContestProgress({ progress }: { progress: Progress }) {
  const t = useTranslations("contests.progress");
  if (progress.total === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {progress.problems.map((problem) => (
          <Tooltip
            key={problem.code}
            content={`${problem.label}. ${problem.name}${problem.solved ? ` — ${t("solvedOne")}` : ""}`}
          >
            <Link
              href={`/problem/${problem.code}/`}
              aria-label={problem.name}
              // Both states answer the pointer. A solved square that ignores
              // the cursor reads as a picture rather than a link, which is the
              // opposite of the truth.
              className={`size-4 rounded-xs border transition-[transform,border-color,box-shadow] hover:scale-115 hover:shadow-xs ${
                problem.solved
                  ? "border-success-ink bg-success-ink hover:border-foreground"
                  : "border-border bg-secondary hover:border-primary"
              }`}
            />
          </Tooltip>
        ))}
      </div>

      <span className="text-sm tabular-nums text-muted-foreground">
        {t("solvedCount", { solved: progress.solved, total: progress.total })}
      </span>
    </div>
  );
}
