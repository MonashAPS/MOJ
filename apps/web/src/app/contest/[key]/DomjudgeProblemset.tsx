"use client";

import type { ContestDetail, ContestProblemEntry } from "@convex/contests";
import { cn } from "@moj/ui";
import { FileArchive, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { QuickSubmit } from "@/components/problems/QuickSubmit";
import { balloonFor } from "@/lib/balloon";

/**
 * The problem sheet as DOMjudge's team pages lay it out.
 *
 * DOMjudge's problem list is not a table of statistics: it is the balloon
 * colour, the letter, the name, what the judge will allow it, and the two
 * downloads. There is no link into a problem page because there is no problem
 * page — the statement is the PDF. Everything our list says that DOMjudge's
 * does not (the solve counts, the AC rate, the editorial) belongs to the site
 * rather than to the contest, and goes when the structure does.
 *
 * The submit button is ours and stays: it is functionality DOMjudge has too,
 * just somewhere else.
 */

const ACTION =
  "inline-flex h-(--control-h-sm) items-center gap-1.5 rounded-sm border border-border-strong bg-card px-2.5 " +
  "text-sm font-medium text-subtle transition-colors hover:bg-secondary hover:text-foreground " +
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/60";

const HEAD =
  "h-9 whitespace-nowrap border-b-2 border-border-strong px-2 text-left align-middle " +
  "font-sans text-sm font-bold text-foreground";

/** The balloon: DOMjudge's problem list is read by colour before letter. */
function Balloon({ code, label }: { code: string; label: string }) {
  const balloon = balloonFor(code);

  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-bold text-[color:hsl(0_0%_12%)]"
      style={{ backgroundColor: balloon.fill, borderColor: balloon.line }}
    >
      {label}
    </span>
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
  const columns = useTranslations("contests.columns");
  // "Time limit:" is written for the problem's info box, where it labels a
  // value beside it; as a column head it wants no colon.
  const limits = useTranslations("problems.detail");
  const problems = detail.problems;
  const canSubmit = detail.viewer.isAuthenticated;

  return (
    <section className="grid gap-2">
      <h2 className="font-display text-h3 font-semibold">{t("problems")}</h2>

      {problems.length === 0 ? (
        <p className="text-muted-foreground">{t("noProblems")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-base">
            <thead>
              <tr>
                <th className={HEAD} colSpan={2}>
                  {columns("problem")}
                </th>
                <th className={HEAD}>{limits("timeLimit").replace(":", "")}</th>
                <th className={cn(HEAD, "text-right")}>{columns("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((problem) => (
                <ProblemLine
                  key={problem.contestProblemId}
                  problem={problem}
                  canSubmit={canSubmit}
                  defaultLanguageKey={defaultLanguageKey}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProblemLine({
  problem,
  canSubmit,
  defaultLanguageKey,
}: {
  problem: ContestProblemEntry;
  canSubmit: boolean;
  defaultLanguageKey: string | null;
}) {
  const t = useTranslations("contests.detail");
  const limits = useTranslations("problems.detail");

  return (
    <tr className="border-b border-border">
      <td className="w-px py-2 pr-2 align-middle">
        <Balloon code={problem.code} label={problem.label} />
      </td>
      <td className="w-full py-2 pr-2 align-middle">
        <span className="block font-semibold">{problem.name}</span>
        <span className="block font-mono text-sm text-muted-foreground">{problem.code}</span>
      </td>
      <td className="whitespace-nowrap py-2 pr-2 align-middle font-mono text-sm tabular-nums">
        {limits("seconds", { value: problem.timeLimit.toFixed(problem.timeLimit % 1 === 0 ? 0 : 2) })}
      </td>
      <td className="py-2 align-middle">
        <span className="flex flex-wrap items-center justify-end gap-2">
          {problem.isAccessible ? (
            <a href={`/problem/${problem.code}/pdf`} download={`${problem.code}.pdf`} className={ACTION}>
              <FileText size={14} aria-hidden />
              {t("statement")}
            </a>
          ) : null}
          {problem.isAccessible && problem.hasSamples ? (
            <a
              href={`/problem/${problem.code}/samples`}
              download={`${problem.code}-samples.zip`}
              className={ACTION}
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
              <button
                type="button"
                className={cn(
                  ACTION,
                  "border-primary bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground",
                )}
              >
                {t("submit")}
              </button>
            </QuickSubmit>
          ) : null}
        </span>
      </td>
    </tr>
  );
}
