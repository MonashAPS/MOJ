/**
 * The values a problem scoring kind works with, each tagged with its kind so a
 * stored value can never be read as another kind's.
 */

import type { SubmissionResult, SubmissionTestCaseRow } from "../types";

/** `problems.scoring`. Absent means standard DMOJ scoring. */
export type ProblemScoring = { readonly kind: "golf" };

export type ScoringKind = ProblemScoring["kind"];

/** Golf's measure of one accepted submission: its length. */
export type GolfMeasure = { readonly kind: "golf"; readonly bytes: number };

/** Golf's best over a scope: the shortest accepted length. */
export type GolfBest = { readonly kind: "golf"; readonly bytes: number };

/** What one graded submission contributes to its scope (`submissions.scoringMeasure`). */
export type ScoringMeasure = GolfMeasure;

/** The best so far over a scope (`scoringBests.best`). */
export type ScoringBest = GolfBest;

export type ScoringOf<K extends ScoringKind> = Extract<ProblemScoring, { readonly kind: K }>;

export type MeasureOf<K extends ScoringKind> = Extract<ScoringMeasure, { readonly kind: K }>;

export type BestOf<K extends ScoringKind> = Extract<ScoringBest, { readonly kind: K }>;

/** A graded case, with the checker's feedback a kind may read a value from. */
export interface ScoredTestCase extends SubmissionTestCaseRow {
  readonly feedback: string;
}

/** A submission as grading left it: what a kind measures. */
export interface GradedSubmission {
  readonly result: SubmissionResult | null;
  readonly source: string;
  readonly testCases: readonly ScoredTestCase[];
}

/**
 * One scoring kind.
 *
 * `improve` returns `best` itself when the measure does not beat it, which is
 * how the caller knows the best did not move and nothing else needs rescoring.
 */
export interface ScoringRule<K extends ScoringKind> {
  /** What a graded submission contributes, or null when it contributes nothing. */
  measure(scoring: ScoringOf<K>, submission: GradedSubmission): MeasureOf<K> | null;
  /** The best once `measure` is folded in. */
  improve(scoring: ScoringOf<K>, best: BestOf<K> | null, measure: MeasureOf<K>): BestOf<K>;
  /** Whether `best` rests on `measure`, so withdrawing the measure may move it. */
  holds(scoring: ScoringOf<K>, best: BestOf<K>, measure: MeasureOf<K>): boolean;
  /** Points out of `problemPoints`, before rounding. A null measure scores nothing. */
  points(
    scoring: ScoringOf<K>,
    measure: MeasureOf<K> | null,
    best: BestOf<K> | null,
    problemPoints: number,
  ): number;
}

/** One rule per kind, which is the whole of the dispatch. */
export type ScoringRules = { readonly [K in ScoringKind]: ScoringRule<K> };
