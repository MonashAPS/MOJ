/**
 * Problem scoring kinds (`problems.scoring`): points that depend on the other
 * submissions to a problem, not on the submission alone.
 *
 * A scored problem keeps a best per scope. A contest submission is scored
 * against the best among its contest problem's submissions, and every
 * submission's practice points against the best among all of the problem's.
 * A kind says what a graded submission measures, how a measure folds into the
 * best and what a measure scores against it; `convex/scoring.ts` keeps the
 * bests and rescores a scope whenever its best moves.
 *
 * Adding a kind is a rule beside `./golf`, its members in the unions in
 * `./types` and a line in `SCORING_RULES`. Everything else dispatches here.
 */

import { pyRound } from "../util/number";
import { golfScoring } from "./golf";
import type {
  BestOf,
  GradedSubmission,
  MeasureOf,
  ProblemScoring,
  ScoringBest,
  ScoringKind,
  ScoringMeasure,
  ScoringOf,
  ScoringRule,
  ScoringRules,
} from "./types";

export { golfScoring, sourceBytes } from "./golf";

export type * from "./types";

export const SCORING_RULES: ScoringRules = {
  golf: golfScoring,
};

/** Whether a name is a kind the registry knows. */
export function isScoringKind(kind: string): kind is ScoringKind {
  return kind in SCORING_RULES;
}

/** A `problems.scoring` value with its settings in a fixed order; absent is standard. */
function canonical(scoring: ProblemScoring | null | undefined): string {
  if (!scoring) return "standard";

  return JSON.stringify(Object.entries(scoring).sort(([a], [b]) => a.localeCompare(b)));
}

/** Whether two `problems.scoring` values score the same way. */
export function sameScoring(
  a: ProblemScoring | null | undefined,
  b: ProblemScoring | null | undefined,
): boolean {
  return canonical(a) === canonical(b);
}

/**
 * A stored measure or best of another kind (the problem changed kind since it
 * was written) is no value at all to this one.
 */
function ofKind<K extends ScoringKind>(
  kind: K,
  value: ScoringMeasure | null | undefined,
): MeasureOf<K> | null;

function ofKind<K extends ScoringKind>(kind: K, value: ScoringBest | null | undefined): BestOf<K> | null;

function ofKind<K extends ScoringKind>(
  kind: K,
  value: ScoringMeasure | ScoringBest | null | undefined,
): MeasureOf<K> | BestOf<K> | null {
  if (value === null || value === undefined || value.kind !== kind) return null;

  // SAFETY: `kind` is the discriminant of every member of both unions, so a
  // value carrying `kind` is that kind's member.
  return value as MeasureOf<K> | BestOf<K>;
}

/** What a graded submission contributes to its scopes, or null for nothing. */
export function measureSubmission<K extends ScoringKind>(
  scoring: ScoringOf<K>,
  submission: GradedSubmission,
): MeasureOf<K> | null {
  const rule: ScoringRule<K> = SCORING_RULES[scoring.kind];

  return rule.measure(scoring, submission);
}

/**
 * The best once `measure` is folded in. When it does not move, this is `best`
 * itself, so `improveBest(...) !== best` is the test for a moved best.
 */
export function improveBest<K extends ScoringKind>(
  scoring: ScoringOf<K>,
  best: ScoringBest | null | undefined,
  measure: ScoringMeasure | null | undefined,
): ScoringBest | null {
  const rule: ScoringRule<K> = SCORING_RULES[scoring.kind];
  const current = ofKind(scoring.kind, best);
  const own = ofKind(scoring.kind, measure);

  if (own === null) return best ?? null;

  return rule.improve(scoring, current, own);
}

/** The best over a whole scope, rebuilt from its submissions' measures. */
export function bestOf<K extends ScoringKind>(
  scoring: ScoringOf<K>,
  measures: Iterable<ScoringMeasure | null | undefined>,
): ScoringBest | null {
  let best: ScoringBest | null = null;

  for (const measure of measures) best = improveBest(scoring, best, measure);

  return best;
}

/** Whether withdrawing `measure` (a rejudge) may move `best`. */
export function holdsBest<K extends ScoringKind>(
  scoring: ScoringOf<K>,
  best: ScoringBest | null | undefined,
  measure: ScoringMeasure | null | undefined,
): boolean {
  const rule: ScoringRule<K> = SCORING_RULES[scoring.kind];
  const current = ofKind(scoring.kind, best);
  const own = ofKind(scoring.kind, measure);

  return current !== null && own !== null && rule.holds(scoring, current, own);
}

/**
 * A submission's points out of `problemPoints` against its scope's best, to
 * the three decimals `on_grading_end` keeps. No measure scores nothing.
 */
export function scoringPoints<K extends ScoringKind>(
  scoring: ScoringOf<K>,
  measure: ScoringMeasure | null | undefined,
  best: ScoringBest | null | undefined,
  problemPoints: number,
): number {
  const rule: ScoringRule<K> = SCORING_RULES[scoring.kind];

  return pyRound(
    rule.points(scoring, ofKind(scoring.kind, measure), ofKind(scoring.kind, best), problemPoints),
    3,
  );
}
