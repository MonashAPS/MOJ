"use client";

import type { api } from "@convex/_generated/api";
import type { SubmissionScoring } from "@convex/submissions";
import type { ScoringKind } from "@moj/core";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

type Detail = NonNullable<FunctionReturnType<typeof api.submissions.detail>>;

/** What a kind's explanation draws from: the scope's values, and the cases a per-case kind reads. */
type ScoringExplanationProps = {
  scoring: SubmissionScoring;
  cases: Detail["cases"];
};

function GolfExplanation({ scoring }: ScoringExplanationProps) {
  const t = useTranslations("submissions.scored");
  const bytes = scoring.measure?.kind === "golf" ? scoring.measure.bytes : null;
  const best = scoring.best?.kind === "golf" ? scoring.best.bytes : null;

  if (bytes !== null) {
    // A virtual entrant can beat a live best that has not moved for it.
    const shortest = Math.min(best ?? bytes, bytes);

    return <p>{t("golfMeasured", { bytes, shortest, scope: scoring.scope })}</p>;
  }

  if (best === null) return <p>{t("golfNoneAccepted", { scope: scoring.scope })}</p>;

  return <p>{t("golfRejected", { shortest: best, scope: scoring.scope })}</p>;
}

/** One explanation per kind; a new kind does not compile until it has one. */
const EXPLANATIONS = {
  golf: GolfExplanation,
} satisfies { readonly [K in ScoringKind]: ComponentType<ScoringExplanationProps> };

/** Why a scored submission is worth what the status header says it is. */
export function ScoringExplanation({ scoring, cases }: ScoringExplanationProps) {
  const Explanation = EXPLANATIONS[scoring.kind];

  return (
    <div className="grid gap-1 text-sm text-subtle">
      <Explanation scoring={scoring} cases={cases} />
    </div>
  );
}
