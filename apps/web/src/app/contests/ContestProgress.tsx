"use client";

import type { ContestProgress as Progress } from "@convex/contests";
import { Tooltip } from "@moj/ui";
import { CircleHelp, Lock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * How far the viewer has got through a contest, as one square per problem.
 *
 * Green is solved, grey is not, and each square is the problem: hovering names
 * it, clicking opens it. The count underneath is out of the squares shown, not
 * out of the contest, because a contest may be holding problems back.
 */
export function ContestProgress({ progress }: { progress: Progress }) {
  const t = useTranslations("contests.progress");
  if (progress.total === 0 && !progress.hasHidden) return null;

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
              className={`size-4 rounded-xs border transition-transform hover:scale-110 ${
                problem.solved
                  ? "border-success-ink bg-success-ink"
                  : "border-border bg-secondary hover:border-primary"
              }`}
            />
          </Tooltip>
        ))}

        {/* A lock, never a number: how many problems are being withheld is
            itself something somebody who was not there should not learn. */}
        {progress.hasHidden ? (
          <Tooltip content={t("hiddenExplained")}>
            <span className="ml-0.5 inline-flex items-center gap-0.5 text-muted-foreground">
              <Lock size={13} aria-hidden />
              <CircleHelp size={12} aria-hidden />
              <span className="sr-only">{t("hiddenExplained")}</span>
            </span>
          </Tooltip>
        ) : null}
      </div>

      {progress.total > 0 ? (
        <span className="text-sm tabular-nums text-muted-foreground">
          {t("solvedCount", { solved: progress.solved, total: progress.total })}
        </span>
      ) : null}
    </div>
  );
}
