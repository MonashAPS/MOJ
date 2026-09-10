/**
 * Shared machinery for the contest formats.
 *
 * DMOJ's formats are Django model methods that write straight to the
 * participation row and render HTML fragments. Here they are pure:
 * `updateParticipation` returns the four fields the caller should write, and
 * the display helpers return structured data for the React table instead of
 * `<td>` strings. The arithmetic is DMOJ's, line for line.
 *
 * Source: judge/contest_format/*.py.
 */

import type {
  ContestParticipationRow,
  ContestProblemRow,
  ContestRow,
  ContestSubmissionRow,
  FormatData,
  FormatDataEntry,
  Id,
} from "../types";
import { floatformat, niceRepr } from "../util/number";

/** Thrown by `validate(config)`, standing in for Django's `ValidationError`. */
export class FormatConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormatConfigError";
  }
}

/** Thrown by `getFormat` for a name that is not registered. */
export class UnknownContestFormatError extends Error {
  constructor(name: string) {
    super(`unknown contest format "${name}"`);
    this.name = "UnknownContestFormatError";
  }
}

export type SolutionState = "failed-score" | "full-score" | "partial-score";

/** `BaseContestFormat.best_solution_state(points, total)` (base.py:104). */
export function bestSolutionState(points: number, total: number): SolutionState {
  if (!points) return "failed-score";
  if (points === total) return "full-score";
  return "partial-score";
}

export interface UpdateParticipationInput {
  readonly participation: ContestParticipationRow;
  /** The participation's contest submissions (DMOJ's `participation.submissions`). */
  readonly submissions: readonly ContestSubmissionRow[];
  readonly contestProblems: readonly ContestProblemRow[];
  readonly contest: ContestRow;
  /** Overrides `contest.formatConfig`. */
  readonly config?: unknown;
  /** Overrides the computed participation start (ms since epoch). */
  readonly start?: number;
  /** Overrides the computed participation end (ms since epoch); used by `ecoo`. */
  readonly endTime?: number;
}

export interface ParticipationUpdate {
  readonly score: number;
  /** Seconds, as DMOJ's `PositiveIntegerField` holds them. */
  readonly cumtime: number;
  readonly tiebreaker: number;
  readonly formatData: FormatData;
}

export interface ProblemCellDisplay {
  /** DMOJ's `<td class>`: `best_solution_state` with an optional `pretest-` prefix. */
  readonly state: string;
  readonly solutionState: SolutionState;
  readonly isPretest: boolean;
  readonly points: number;
  readonly pointsText: string;
  /** `HH:MM:SS`, or '' when the format hides solving times. */
  readonly timeText: string;
  readonly penalty?: number;
  readonly penaltyText?: string;
  readonly bonus?: number;
  readonly bonusText?: string;
}

export interface ParticipationResultDisplay {
  readonly points: number;
  readonly pointsText: string;
  readonly cumtime: number;
  /** `HH:MM:SS`, or '' when the format hides cumulative time. */
  readonly cumtimeText: string;
}

export interface ContestFormat {
  /** Registry key: `default`, `ioi`, `ioi16`, `atcoder`, `icpc`, `ecoo`. */
  readonly name: string;
  /** DMOJ's human-facing `name`. */
  readonly displayName: string;
  readonly configDefaults: Readonly<Record<string, unknown>>;
  /** Label scheme this format uses when the contest does not override it. */
  readonly defaultLabelScheme: "letters" | "numbers";

  /** `validate(config)`; throws `FormatConfigError`. */
  validate(config: unknown): void;
  /** Defaults merged with the stored config, after validation. */
  resolveConfig(config: unknown): Record<string, unknown>;

  updateParticipation(input: UpdateParticipationInput): ParticipationUpdate;

  displayUserProblem(
    participation: Pick<ContestParticipationRow, "formatData">,
    contestProblem: ContestProblemRow,
    contest: ContestRow,
    config?: unknown,
  ): ProblemCellDisplay | null;

  displayParticipationResult(
    participation: Pick<ContestParticipationRow, "score" | "cumtime">,
    contest: ContestRow,
    config?: unknown,
  ): ParticipationResultDisplay;

  getProblemBreakdown(
    participation: Pick<ContestParticipationRow, "formatData">,
    contestProblems: readonly ContestProblemRow[],
  ): (FormatDataEntry | null)[];

  /** DMOJ's per-format label. The contest's `labelScheme` overrides it. */
  getLabelForProblem(index: number): string;

  /** Markdown lines describing the format's settings. */
  getShortFormDisplay(config?: unknown): string[];
}

/* -------------------------------------------------------------------------- */
/* Helpers shared by the format implementations                               */
/* -------------------------------------------------------------------------- */

export function pointsPrecision(contest: ContestRow): number {
  return contest.pointsPrecision ?? 3;
}

/** Validate a config against `config_defaults` / `config_validators`, DMOJ style. */
export function validateAgainstDefaults(
  config: unknown,
  defaults: Readonly<Record<string, unknown>>,
  validators: Readonly<Record<string, (value: never) => boolean>>,
  styleName: string,
): void {
  if (config === null || config === undefined) return;
  if (typeof config !== "object" || Array.isArray(config)) {
    throw new FormatConfigError(`${styleName} expects no config or dict as config`);
  }
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (!(key in defaults)) throw new FormatConfigError(`unknown config key "${key}"`);
    if (!sameType(value, defaults[key])) {
      throw new FormatConfigError(`invalid type for config key "${key}"`);
    }
    const validator = validators[key];
    if (validator && !(validator as (value: unknown) => boolean)(value)) {
      throw new FormatConfigError(`invalid value "${String(value)}" for config key "${key}"`);
    }
  }
}

/**
 * Python's `isinstance(value, type(default))`.
 *
 * `bool` is a subclass of `int` in Python, so a boolean passes an integer
 * default; the reverse does not hold.
 */
function sameType(value: unknown, expected: unknown): boolean {
  if (typeof expected === "boolean") return typeof value === "boolean";
  if (typeof expected === "number") return typeof value === "number" || typeof value === "boolean";
  return typeof value === typeof expected;
}

export function mergeConfig(
  defaults: Readonly<Record<string, unknown>>,
  config: unknown,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...defaults };
  if (config && typeof config === "object" && !Array.isArray(config)) {
    Object.assign(merged, config as Record<string, unknown>);
  }
  return merged;
}

/** Milliseconds between a submission and the participation start, as seconds. */
export function secondsSince(start: number, date: number): number {
  return (date - start) / 1000;
}

/**
 * `ContestParticipation.cumtime` is a `PositiveIntegerField`, so Django's
 * `int()` truncates the float seconds every format accumulates before the row
 * is written. Ranking, tie breaking and the `HH:MM:SS` display all read the
 * truncated value, so the formats truncate too rather than leaving a fraction
 * of a second that DMOJ never had.
 */
export function cumtimeSeconds(seconds: number): number {
  return Math.trunc(Math.max(seconds, 0));
}

export function groupByProblem(
  submissions: readonly ContestSubmissionRow[],
  participationId?: Id,
): Map<Id, ContestSubmissionRow[]> {
  const groups = new Map<Id, ContestSubmissionRow[]>();
  for (const submission of submissions) {
    if (
      participationId !== undefined &&
      submission.participationId !== undefined &&
      submission.participationId !== participationId
    ) {
      continue;
    }
    const bucket = groups.get(submission.contestProblemId);
    if (bucket) bucket.push(submission);
    else groups.set(submission.contestProblemId, [submission]);
  }
  return groups;
}

/** Order the problem groups the way the SQL does: by the contest problem order. */
export function orderedProblemIds(
  groups: Map<Id, ContestSubmissionRow[]>,
  contestProblems: readonly ContestProblemRow[],
): Id[] {
  const ordered = [...contestProblems]
    .sort((a, b) => a.order - b.order)
    .map((problem) => problem.id)
    .filter((id) => groups.has(id));
  // Submissions pointing at a contest problem we were not given still count,
  // exactly as the SQL's join does.
  for (const id of groups.keys()) if (!ordered.includes(id)) ordered.push(id);
  return ordered;
}

export function contestProblemPoints(contestProblems: readonly ContestProblemRow[], id: Id): number {
  return contestProblems.find((problem) => problem.id === id)?.points ?? 0;
}

/** Build the display cell shared by every format. */
export function buildProblemCell(
  entry: FormatDataEntry,
  contestProblem: ContestProblemRow,
  contest: ContestRow,
  options: { readonly showTime?: boolean; readonly penalty?: boolean; readonly bonus?: boolean } = {},
): ProblemCellDisplay {
  const isPretest = contest.runPretestsOnly === true && contestProblem.isPretested === true;
  const solutionState = bestSolutionState(entry.points, contestProblem.points);
  const cell: {
    -readonly [K in keyof ProblemCellDisplay]: ProblemCellDisplay[K];
  } = {
    state: (isPretest ? "pretest-" : "") + solutionState,
    solutionState,
    isPretest,
    points: entry.points,
    pointsText: floatformat(entry.points),
    timeText: options.showTime === false ? "" : niceRepr(entry.time),
  };
  if (options.penalty) {
    cell.penalty = entry.penalty ?? 0;
    cell.penaltyText = entry.penalty ? floatformat(entry.penalty) : "";
  }
  if (options.bonus) {
    cell.bonus = entry.bonus ?? 0;
    cell.bonusText = entry.bonus ? floatformat(entry.bonus) : "";
  }
  return cell;
}

export function buildParticipationResult(
  participation: Pick<ContestParticipationRow, "score" | "cumtime">,
  contest: ContestRow,
  showCumtime = true,
): ParticipationResultDisplay {
  const score = participation.score ?? 0;
  const cumtime = participation.cumtime ?? 0;
  return {
    points: score,
    pointsText: floatformat(score, -pointsPrecision(contest)),
    cumtime,
    cumtimeText: showCumtime ? niceRepr(cumtime) : "",
  };
}

export function breakdown(
  participation: Pick<ContestParticipationRow, "formatData">,
  contestProblems: readonly ContestProblemRow[],
): (FormatDataEntry | null)[] {
  const data = participation.formatData ?? {};
  return contestProblems.map((problem) => data[problem.id] ?? null);
}

/** `DefaultContestFormat.get_label_for_problem`: 1, 2, 3, ... */
export function numberLabel(index: number): string {
  return String(index + 1);
}

/** `ICPCContestFormat.get_label_for_problem`: A, B, ... Z, AA, AB, ... */
export function letterLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    label += String.fromCharCode(((value - 1) % 26) + 65);
    value = Math.floor((value - 1) / 26);
  }
  return [...label].reverse().join("");
}
