"use client";

import { api } from "@convex/_generated/api";
import { Button } from "@moj/ui";
import { useQuery } from "convex/react";
import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * What the problems list says while the viewer is inside a contest that hides
 * the rest of the catalogue.
 *
 * The list stays on screen, blurred, rather than being replaced: a contestant
 * who lands here has usually gone looking for the contest's problems, and the
 * fix for that is to point at them, not to quietly serve a different page under
 * the same heading — which is the DMOJ behaviour this replaced.
 */
export function ContestLock({ contestKey, contestName }: { contestKey: string; contestName: string }) {
  const t = useTranslations("problems.list");
  const bar = useQuery(api.contests.navBar, {});
  const problems = bar?.contest.key === contestKey ? bar.problems : [];

  return (
    <div className="pointer-events-none absolute inset-0 z-1 flex items-start justify-center p-4">
      <div className="pointer-events-auto sticky top-(--sticky-top) w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-2">
        <div className="grid gap-1 border-b border-border px-5 py-4 text-center">
          <Lock size={20} aria-hidden className="mx-auto text-muted-foreground" />
          <p className="mt-1 text-sm font-medium">{t("contestLockTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("contestLockHint")}</p>
        </div>

        <div className="grid gap-2 p-4">
          <p className="font-display text-sm font-semibold">{contestName}</p>

          {problems.length === 0 ? null : (
            <ol className="grid overflow-hidden rounded-md border border-border">
              {problems.map((problem) => (
                <li key={problem.code} className="border-b border-border last:border-b-0">
                  <Link
                    href={`/problem/${problem.code}/`}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary"
                  >
                    <span
                      aria-hidden
                      className={`size-2 shrink-0 rounded-xs ${
                        problem.state === "solved"
                          ? "bg-good"
                          : problem.state === "partial"
                            ? "bg-warn"
                            : problem.state === "attempted"
                              ? "bg-bad"
                              : "bg-well"
                      }`}
                    />
                    <span className="font-mono text-sm text-muted-foreground">{problem.label}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{problem.name}</span>
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {problem.points}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}

          <Button asChild className="w-full">
            <Link href={`/contest/${contestKey}/`}>
              {t("contestLockAction")}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
