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
  JsonObject,
  JsonValue,
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

/** A scalar a format's config holds; DMOJ's `config_defaults` are all scalars. */
export type FormatConfigValue = boolean | number | string;

/** DMOJ's `config_defaults`: the keys a format accepts, with their defaults. */
export type FormatConfigDefaults = Readonly<Record<string, FormatConfigValue>>;

/** A stored `formatConfig` as it reaches a format, before the format decodes it. */
export type FormatConfigInput = JsonValue | undefined;

/** DMOJ's `config_validators`, run after the value passed the type check. */
export type FormatConfigValidators = Readonly<Record<string, (value: JsonValue) => boolean>>;

/** A format's config as the format-agnostic callers see it: defaults plus overrides. */
export type ResolvedFormatConfig = Readonly<Record<string, JsonValue>>;

/** Narrow a decoded JSON value to Python's `dict`. */
export function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBooleanValue(value: JsonValue): value is boolean {
  return typeof value === "boolean";
}

function isNumberValue(value: JsonValue): value is number {
  return typeof value === "number";
}

function isStringValue(value: JsonValue): value is string {
  return typeof value === "string";
}

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
  readonly config?: FormatConfigInput;
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
  /** Submissions the judge ran on it, the solve included; absent on a row
   *  scored before the count was recorded. */
  readonly attempts?: number;
}

/** `ProblemCellDisplay` while `buildProblemCell` is still filling it in. */
type MutableProblemCell = {
  -readonly [K in keyof ProblemCellDisplay]: ProblemCellDisplay[K];
};

export interface ParticipationResultDisplay {
  readonly points: number;
  readonly pointsText: string;
  readonly cumtime: number;
  /** `HH:MM:SS`, or '' when the format hides cumulative time. */
  readonly cumtimeText: string;
}

/**
 * One line of `getShortFormDisplay`, as a message key rather than a sentence.
 *
 * The keys live under `contests.scoring` in the web app's catalogue rather than
 * here because this package has no locale to read, and the scoring rules have to
 * be readable in the language the rest of the contest page is in. The markdown
 * emphasis stays inside the message, which is where a translator needs it.
 */
export interface ScoringLine {
  readonly key: string;
  readonly values?: Readonly<Record<string, number>>;
}

export interface ContestFormat {
  /** Registry key: `default`, `ioi`, `ioi16`, `atcoder`, `icpc`, `ecoo`. */
  readonly name: string;
  /** DMOJ's human-facing `name`. */
  readonly displayName: string;
  readonly configDefaults: FormatConfigDefaults;
  /** Label scheme this format uses when the contest does not override it. */
  readonly defaultLabelScheme: "letters" | "numbers";

  /** `validate(config)`; throws `FormatConfigError`. */
  validate(config: FormatConfigInput): void;
  /** Defaults merged with the stored config, after validation. */
  resolveConfig(config: FormatConfigInput): ResolvedFormatConfig;

  updateParticipation(input: UpdateParticipationInput): ParticipationUpdate;

  displayUserProblem(
    participation: Pick<ContestParticipationRow, "formatData">,
    contestProblem: ContestProblemRow,
    contest: ContestRow,
    config?: FormatConfigInput,
  ): ProblemCellDisplay | null;

  displayParticipationResult(
    participation: Pick<ContestParticipationRow, "score" | "cumtime">,
    contest: ContestRow,
    config?: FormatConfigInput,
  ): ParticipationResultDisplay;

  getProblemBreakdown(
    participation: Pick<ContestParticipationRow, "formatData">,
    contestProblems: readonly ContestProblemRow[],
  ): (FormatDataEntry | null)[];

  /** DMOJ's per-format label. The contest's `labelScheme` overrides it. */
  getLabelForProblem(index: number): string;

  /** Message keys for the markdown lines describing the format's settings. */
  getShortFormDisplay(config?: FormatConfigInput): ScoringLine[];
}

/* -------------------------------------------------------------------------- */
/* Helpers shared by the format implementations                               */
/* -------------------------------------------------------------------------- */

export function pointsPrecision(contest: ContestRow): number {
  return contest.pointsPrecision ?? 3;
}

/** Validate a config against `config_defaults` / `config_validators`, DMOJ style. */
export function validateAgainstDefaults(
  config: FormatConfigInput,
  defaults: FormatConfigDefaults,
  validators: FormatConfigValidators,
  styleName: string,
): void {
  if (config === null || config === undefined) return;

  if (!isJsonObject(config)) {
    throw new FormatConfigError(`${styleName} expects no config or dict as config`);
  }

  for (const [key, value] of Object.entries(config)) {
    const expected = defaults[key];

    if (expected === undefined) throw new FormatConfigError(`unknown config key "${key}"`);

    if (!sameType(value, expected)) {
      throw new FormatConfigError(`invalid type for config key "${key}"`);
    }

    const validator = validators[key];

    if (validator && !validator(value)) {
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
function sameType(value: JsonValue, expected: FormatConfigValue): boolean {
  if (isBooleanValue(expected)) return isBooleanValue(value);

  if (isNumberValue(expected)) return isNumberValue(value) || isBooleanValue(value);

  return isStringValue(value);
}

/** The stored value for a config key, or undefined when the config omits it. */
function storedConfigValue(config: FormatConfigInput, key: string): JsonValue | undefined {
  if (config === null || config === undefined || !isJsonObject(config)) return undefined;

  return config[key];
}

/** A numeric config key, falling back to the format's default (DMOJ's `int()`). */
export function numberConfig(config: FormatConfigInput, key: string, fallback: number): number {
  const stored = storedConfigValue(config, key);

  return stored === undefined ? fallback : Number(stored);
}

/** A boolean config key, falling back to the format's default (DMOJ's `bool()`). */
export function booleanConfig(config: FormatConfigInput, key: string, fallback: boolean): boolean {
  const stored = storedConfigValue(config, key);

  return stored === undefined ? fallback : Boolean(stored);
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
export function orderedProblemGroups(
  groups: Map<Id, ContestSubmissionRow[]>,
  contestProblems: readonly ContestProblemRow[],
): [Id, ContestSubmissionRow[]][] {
  const ordered: [Id, ContestSubmissionRow[]][] = [];

  for (const problem of [...contestProblems].sort((a, b) => a.order - b.order)) {
    const group = groups.get(problem.id);

    if (group !== undefined) ordered.push([problem.id, group]);
  }

  const placed = new Set(ordered.map(([id]) => id));

  // Submissions pointing at a contest problem we were not given still count,
  // exactly as the SQL's join does.
  for (const [id, group] of groups) if (!placed.has(id)) ordered.push([id, group]);

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

  const cell: MutableProblemCell = {
    state: (isPretest ? "pretest-" : "") + solutionState,
    solutionState,
    isPretest,
    points: entry.points,
    pointsText: floatformat(entry.points),
    timeText: options.showTime === false ? "" : niceRepr(entry.time),
  };

  // Every format records this now, so the cell carries it whatever the format;
  // a participation scored before it did simply has none.
  if (entry.attempts !== undefined) cell.attempts = entry.attempts;

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
