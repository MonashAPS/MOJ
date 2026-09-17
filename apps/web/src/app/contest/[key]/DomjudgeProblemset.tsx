"use client";

import type { ContestDetail, ContestProblemEntry } from "@convex/contests";
import { FileArchive, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { QuickSubmit } from "@/components/problems/QuickSubmit";

/**
 * The problemset page as DOMjudge draws it.
 *
 * DOMjudge does not list problems in a table. The contest's name is written
 * across the top, and under it the problems are cards in a grid: the letter in
 * a bordered square, the name, the limits the judge will hold it to, whether it
 * is pass-fail or scored, and the downloads. No link into a problem page, no
 * solve count, no AC rate, no editorial column — DOMjudge has none of those, and
 * they are the site talking about itself rather than the contest.
 *
 * The submit button is ours and stays: functionality DOMjudge keeps elsewhere,
 * not structure it arranges differently.
 */

const CARD =
  "flex flex-col items-center gap-1 rounded-(--radius) border border-border bg-card px-4 py-5 text-center";

const BUTTON =
  "inline-flex h-(--control-h-sm) items-center gap-1.5 rounded-(--radius-sm) px-3 text-sm font-medium " +
  "transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/60";

const DOWNLOAD = `${BUTTON} bg-neutral text-white hover:brightness-95`;

const SUBMIT = `${BUTTON} bg-primary text-primary-foreground hover:bg-primary-hover`;

/** The problem row holds KB; DOMjudge writes whole MB, or GB past a gigabyte. */
function memoryLabel(kilobytes: number): string {
  const megabytes = kilobytes / 1024;

  if (megabytes < 1024) return `${Math.round(megabytes)} MB`;
  const gigabytes = megabytes / 1024;

  return `${gigabytes.toFixed(Number.isInteger(gigabytes) ? 0 : 1)} GB`;
}

function ProblemCard({
  problem,
  canSubmit,
  defaultLanguageKey,
}: {
  problem: ContestProblemEntry;
  canSubmit: boolean;
  defaultLanguageKey: string | null;
}) {
  const t = useTranslations("contests.detail");

  return (
    <div className={CARD}>
      <span className="flex size-9 items-center justify-center rounded-(--radius-sm) border border-border-strong bg-card font-mono text-base font-bold">
        {problem.label}
      </span>
      <p className="text-h3 font-normal leading-tight">{problem.name}</p>
      <p className="text-sm text-subtle">
        {t("domjudgeLimits", {
          time: t("domjudgeSeconds", { count: problem.timeLimit }),
          memory: memoryLabel(problem.memoryLimit),
        })}
      </p>
      <p className="text-sm text-subtle">
        {t("domjudgeType", { type: problem.partial ? t("domjudgeScoring") : t("domjudgePassFail") })}
      </p>

      <span className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {problem.isAccessible ? (
          <a href={`/problem/${problem.code}/pdf`} download={`${problem.code}.pdf`} className={DOWNLOAD}>
            <FileText size={14} aria-hidden />
            {t("statement")}
          </a>
        ) : null}
        {problem.isAccessible && problem.hasSamples ? (
          <a
            href={`/problem/${problem.code}/samples`}
            download={`${problem.code}-samples.zip`}
            className={DOWNLOAD}
          >
            <FileArchive size={14} aria-hidden />
            {t("samples")}
          </a>
        ) : null}
        {problem.isAccessible && canSubmit ? (
          <QuickSubmit
            problemCode={problem.code}
            problemName={problem.name}
            defaultLanguageKey={defaultLanguageKey}
            submissionsLeft={problem.submissionsLeft}
          >
            <button type="button" className={SUBMIT}>
              {t("submit")}
            </button>
          </QuickSubmit>
        ) : null}
      </span>
    </div>
  );
}

export function DomjudgeProblemset({
  detail,
  defaultLanguageKey,
}: {
  detail: ContestDetail;
  defaultLanguageKey: string | null;
}) {
  const t = useTranslations("contests.detail");
  const problems = detail.problems;
  const canSubmit = detail.viewer.isAuthenticated;

  return (
    <section className="grid gap-5">
      {/* Centred and named after the contest: DOMjudge's problemset page carries
          no other heading, and no tab strip over it. */}
      <h1 className="text-center font-display text-h1 font-semibold">
        {t("domjudgeProblemsTitle", { name: detail.contest?.name ?? "" })}
      </h1>

      {problems.length === 0 ? (
        <p className="text-center text-muted-foreground">{t("noProblems")}</p>
      ) : (
        <div className="grid gap-4 min-[640px]:grid-cols-2 min-[1000px]:grid-cols-3">
          {problems.map((problem) => (
            <ProblemCard
              key={problem.contestProblemId}
              problem={problem}
              canSubmit={canSubmit}
              defaultLanguageKey={defaultLanguageKey}
            />
          ))}
        </div>
      )}
    </section>
  );
}
