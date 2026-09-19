/**
 * ICPC hall scoreboard scoring, the freeze, and the reveal ceremony.
 *
 * Ported from the MAPS fork (MonashAPS/online-judge branch v2):
 * judge/utils/frozen_scoreboard.py for the scoring and the cell states,
 * judge/views/live_scoreboard.py for the freeze offset and the per-contest
 * payload, and the reveal/first-blood logic from
 * templates/contest/live-scoreboard.html.
 *
 * The board is always scored ICPC-style regardless of the contest's configured
 * format: one point per solve, penalty minutes for wrong attempts.
 */

import type { ParticipationUpdate, ResolvedFormatConfig } from "./formats/base";
import { getContestFormat, updateParticipation } from "./formats/index";
import { contestIsEditableBy, hasPerm, isAuthenticated, isSuperuser } from "./permissions";
import type {
  ContestParticipationRow,
  ContestProblemRow,
  ContestRow,
  ContestSubmissionRow,
  Id,
  SubmissionResult,
  Viewer,
} from "./types";
import { IN_PROGRESS_GRADING_STATUS } from "./verdicts";

/* -------------------------------------------------------------------------- */
/* Cell and event states                                                      */
/* -------------------------------------------------------------------------- */

/** Accepted, and the accept happened before the freeze. */
export const SOLVED = "solved";

/** Something was submitted at or after the freeze: an answer is being withheld. */
export const FROZEN = "frozen";

/** Still being judged, but all of it predates the freeze. Nothing is withheld. */
export const JUDGING = "judging";

/** Attempted, no accept, nothing outstanding. */
export const FAILED = "failed";

/** Never attempted. */
export const EMPTY = "empty";

export type CellState = typeof SOLVED | typeof FROZEN | typeof JUDGING | typeof FAILED | typeof EMPTY;

export const CORRECT = "correct";

export const PENDING = "pending";

export const INCORRECT = "incorrect";

export type EventState = typeof CORRECT | typeof PENDING | typeof INCORRECT;

/**
 * Verdicts that never count for anything: judge/contest_format/icpc.py's
 * ignored set plus AB (aborted), which is likewise not the competitor's fault.
 */
export const IGNORED_RESULTS: readonly string[] = ["IE", "CE", "AB"];

/**
 * Verdicts meaning "not judged yet". An unjudged submission has a null result,
 * but a grading status can leak into the field, so the in-progress statuses
 * count too ('D' is graded-but-not-scored).
 */
export const PENDING_RESULTS: readonly (string | null)[] = [null, "", "D", ...IN_PROGRESS_GRADING_STATUS];

export const DEFAULT_PENALTY_MINUTES = 20;

export const DEFAULT_FREEZE_MINUTES = 60;

/* -------------------------------------------------------------------------- */
/* Attempts                                                                   */
/* -------------------------------------------------------------------------- */

export interface Attempt {
  /** Participation id. */
  readonly participation: Id | null;
  /** Contest problem id. */
  readonly problem: Id;
  /** Seconds from the start of the contest. */
  readonly time: number;
  /** Points awarded by the contest submission. */
  readonly points: number;
  /** DMOJ verdict string, or null if not judged. */
  readonly result: SubmissionResult | string | null;
  /** The contest problem's point value. */
  readonly maxPoints: number;
}

/** `Attempt.ignored`. */
export function attemptIgnored(attempt: Attempt): boolean {
  return attempt.result !== null && IGNORED_RESULTS.includes(attempt.result);
}

/** `Attempt.pending`. */
export function attemptPending(attempt: Attempt): boolean {
  return PENDING_RESULTS.includes(attempt.result ?? null);
}

/** `Attempt.accepted`. */
export function attemptAccepted(attempt: Attempt): boolean {
  if (attemptPending(attempt)) return false;

  if (attempt.result === "AC") return true;

  // Fall back to points for formats that award full marks without an 'AC'.
  return attempt.maxPoints > 0 && attempt.points >= attempt.maxPoints;
}

/** Flatten a contest submission into an attempt. */
export function toAttempt(
  submission: ContestSubmissionRow,
  contest: Pick<ContestRow, "startTime">,
  maxPoints: number,
): Attempt {
  return {
    participation: submission.participationId ?? null,
    problem: submission.contestProblemId,
    time: (submission.date - contest.startTime) / 1000,
    points: submission.contestPoints,
    result: submission.result ?? null,
    maxPoints,
  };
}

/* -------------------------------------------------------------------------- */
/* Cells                                                                      */
/* -------------------------------------------------------------------------- */

export interface RevealedCell {
  readonly state: typeof SOLVED | typeof FAILED;
  readonly wrong: number;
  readonly time: number | null;
  readonly penalty: number;
}

export interface ScoreboardCell {
  state: CellState;
  wrong: number;
  pending: number;
  time: number | null;
  penalty: number;
  /** The truth behind the freeze. Only ever serialised for admins. */
  reveal?: RevealedCell;
}

interface ResolutionCounts {
  readonly wrong: number;
  readonly pending: number;
}

/** A solved resolution carries its solve time; an unsolved one has none. */
type Resolution =
  | (ResolutionCounts & { readonly solved: true; readonly solveTime: number })
  | (ResolutionCounts & { readonly solved: false; readonly solveTime: null });

/** `_resolve(attempts, upto)`: walk in time order and find the first accept. */
function resolve(attempts: readonly Attempt[], upto?: number): Resolution {
  let wrong = 0;
  let pending = 0;

  for (const attempt of attempts) {
    if (attemptIgnored(attempt)) continue;

    if (upto !== undefined && attempt.time >= upto) continue;

    if (attemptAccepted(attempt)) {
      return { solved: true, solveTime: attempt.time, wrong, pending: 0 };
    }

    if (attemptPending(attempt)) pending += 1;
    else wrong += 1;
  }

  return { solved: false, solveTime: null, wrong, pending };
}

/** `_cell_penalty`: the solve minute plus a penalty per wrong try. */
export function cellPenalty(solveTime: number, wrong: number, penaltyMinutes: number): number {
  return Math.floor(solveTime / 60) + wrong * penaltyMinutes;
}

/** `_build_cell(attempts, freeze_offset, penalty_minutes, include_reveal)`. */
export function buildCell(
  attempts: readonly Attempt[],
  freezeOffset: number,
  penaltyMinutes: number,
  includeReveal = false,
): ScoreboardCell {
  const ordered = [...attempts].sort((a, b) => a.time - b.time);

  // What the public is allowed to see: everything strictly before the freeze.
  const before = resolve(ordered, freezeOffset);

  if (before.solved) {
    const solveTime = before.solveTime;

    return {
      state: SOLVED,
      wrong: before.wrong,
      pending: 0,
      time: solveTime,
      penalty: cellPenalty(solveTime, before.wrong, penaltyMinutes),
    };
  }

  const frozenCount = ordered.filter(
    (attempt) => !attemptIgnored(attempt) && attempt.time >= freezeOffset,
  ).length;

  let state: CellState;

  if (frozenCount) state = FROZEN;
  else if (before.pending) state = JUDGING;
  else if (before.wrong) state = FAILED;
  else state = EMPTY;

  const cell: ScoreboardCell = {
    state,
    wrong: before.wrong,
    pending: before.pending + frozenCount,
    time: null,
    penalty: 0,
  };

  if (includeReveal && state === FROZEN) {
    const truth = resolve(ordered);
    cell.reveal = {
      state: truth.solved ? SOLVED : FAILED,
      wrong: truth.wrong,
      time: truth.solveTime,
      penalty: truth.solved ? cellPenalty(truth.solveTime, truth.wrong, penaltyMinutes) : 0,
    };
  }

  return cell;
}

/* -------------------------------------------------------------------------- */
/* Board                                                                      */
/* -------------------------------------------------------------------------- */

export interface ScoreboardProblem {
  readonly id: Id;
  readonly label?: string;
  readonly code?: string;
  readonly name?: string;
  readonly points?: number;
}

export interface ScoreboardParticipant {
  readonly id: Id;
  readonly username: string;
  readonly displayName?: string;
  readonly flag?: string | null;
  readonly badges?: readonly string[];
  readonly inPerson?: boolean;
}

export interface ScoreboardRow extends ScoreboardParticipant {
  cells: ScoreboardCell[];
  solved: number;
  penalty: number;
  rank: number;
}

export interface Scoreboard {
  readonly problems: readonly ScoreboardProblem[];
  readonly rows: ScoreboardRow[];
}

export interface BuildScoreboardInput {
  readonly problems: readonly ScoreboardProblem[];
  readonly participants: readonly ScoreboardParticipant[];
  readonly attempts: readonly Attempt[];
  /** Seconds from contest start at which the board freezes. */
  readonly freezeOffset: number;
  readonly penaltyMinutes?: number;
  /** **Only ever true for admins**: ships the hidden post-freeze results. */
  readonly includeReveal?: boolean;
}

/** `build_scoreboard(...)` (frozen_scoreboard.py:174). */
export function buildScoreboard(input: BuildScoreboardInput): Scoreboard {
  const penaltyMinutes = input.penaltyMinutes ?? DEFAULT_PENALTY_MINUTES;
  const includeReveal = input.includeReveal ?? false;
  const problemOrder = input.problems.map((problem) => problem.id);
  const known = new Set(problemOrder);

  const buckets = new Map<string, Attempt[]>();

  for (const attempt of input.attempts) {
    if (!known.has(attempt.problem)) continue;
    const key = `${attempt.participation} ${attempt.problem}`;
    const bucket = buckets.get(key);

    if (bucket) bucket.push(attempt);
    else buckets.set(key, [attempt]);
  }

  const rows: ScoreboardRow[] = input.participants.map((participant) => {
    const cells = problemOrder.map((problemId) =>
      buildCell(
        buckets.get(`${participant.id} ${problemId}`) ?? [],
        input.freezeOffset,
        penaltyMinutes,
        includeReveal,
      ),
    );

    return {
      ...participant,
      cells,
      solved: cells.filter((cell) => cell.state === SOLVED).length,
      penalty: cells.reduce((sum, cell) => sum + (cell.state === SOLVED ? cell.penalty : 0), 0),
      rank: 0,
    };
  });

  return { problems: [...input.problems], rows: rankRows(rows) };
}

/**
 * `rank_rows(rows)`: solves descending, penalty ascending, then username so the
 * order is stable between polls. Ties share a rank.
 */
export function rankRows(rows: ScoreboardRow[]): ScoreboardRow[] {
  rows.sort(
    (a, b) =>
      b.solved - a.solved ||
      a.penalty - b.penalty ||
      (a.username < b.username ? -1 : a.username > b.username ? 1 : 0),
  );

  let lastKey: string | null = null;
  let rank = 0;
  rows.forEach((row, index) => {
    const key = `${row.solved}/${row.penalty}`;

    if (key !== lastKey) {
      rank = index + 1;
      lastKey = key;
    }

    row.rank = rank;
  });

  return rows;
}

/**
 * `classify_event(attempt, freeze_offset)`: how one submission reads in the
 * live feed. Anything at or after the freeze reads as pending for everyone,
 * admins included, so the sidebar cannot spoil the frozen grid.
 *
 * @returns `[state, masked]`, where `masked` says the freeze changed the answer
 */
export function classifyEvent(attempt: Attempt, freezeOffset: number): [EventState, boolean] {
  if (attempt.time >= freezeOffset) return [PENDING, true];

  if (attemptPending(attempt)) return [PENDING, false];

  return [attemptAccepted(attempt) ? CORRECT : INCORRECT, false];
}

/** First accepted solve per problem index, for the first-blood highlight. */
export function firstSolves(rows: readonly ScoreboardRow[]): Map<number, number> {
  const best = new Map<number, number>();

  for (const row of rows) {
    row.cells.forEach((cell, index) => {
      if (cell.state !== SOLVED || cell.time === null) return;
      const current = best.get(index);

      if (current === undefined || cell.time < current) best.set(index, cell.time);
    });
  }

  return best;
}

/** Whether a cell holds the first solve of its problem. */
export function isFirstBlood(rows: readonly ScoreboardRow[], row: ScoreboardRow, cellIndex: number): boolean {
  const cell = row.cells[cellIndex];

  if (!cell || cell.state !== SOLVED || cell.time === null) return false;

  return firstSolves(rows).get(cellIndex) === cell.time;
}

/** `build_contest_payload`: the freeze cutoff as seconds from the contest start. */
export function freezeOffsetFor(
  contest: Pick<ContestRow, "startTime" | "endTime" | "freeze">,
  freezeMinutes: number | null = contest.freeze?.minutes ?? null,
): number {
  const duration = (contest.endTime - contest.startTime) / 1000;

  if (freezeMinutes !== null && freezeMinutes > 0) {
    return Math.max(0, duration - freezeMinutes * 60);
  }

  // No freeze: push the cutoff past the end of the contest.
  return duration + 1;
}

/**
 * The wall-clock instant the board freezes, or null when there is no freeze.
 *
 * A freeze at least as long as the contest clamps to the start; the admin
 * mutation refuses to store one.
 */
export function freezeTime(contest: Pick<ContestRow, "startTime" | "endTime" | "freeze">): number | null {
  if (!contest.freeze) return null;

  return Math.max(contest.startTime, contest.endTime - contest.freeze.minutes * 60_000);
}

/** `_penalty_minutes(contest)`: the contest's own ICPC penalty when it has one. */
export function penaltyMinutesFor(contest: Pick<ContestRow, "formatName" | "formatConfig">): number {
  const format = getContestFormat(contest);
  let config: ResolvedFormatConfig;

  try {
    config = format.resolveConfig(contest.formatConfig);
  } catch {
    return DEFAULT_PENALTY_MINUTES;
  }

  const penalty = config.penalty ?? DEFAULT_PENALTY_MINUTES;
  const value = Number(penalty);

  if (!Number.isFinite(value)) return DEFAULT_PENALTY_MINUTES;

  return Math.max(0, Math.trunc(value));
}

/**
 * `can_reveal(user, contests)`: superusers always, otherwise the viewer must be
 * able to edit every contest in the event, so a division organiser cannot spoil
 * the other side.
 */
export function canReveal(viewer: Viewer, contests: readonly ContestRow[]): boolean {
  if (!isAuthenticated(viewer)) return false;

  if (isSuperuser(viewer)) return true;

  return contests.every((contest) => contestIsEditableBy(contest, viewer));
}

/* -------------------------------------------------------------------------- */
/* Reveal ceremony                                                            */
/* -------------------------------------------------------------------------- */

export interface RevealTarget {
  readonly rowIndex: number;
  readonly cellIndex: number;
  readonly rank: number;
}

export interface RevealState {
  readonly rows: ScoreboardRow[];
  /** Snapshots for undo, oldest first. */
  readonly history: readonly ScoreboardRow[][];
}

function cloneCell(cell: ScoreboardCell): ScoreboardCell {
  const copy: ScoreboardCell = { ...cell };

  if (cell.reveal) copy.reveal = { ...cell.reveal };

  return copy;
}

function cloneRows(rows: readonly ScoreboardRow[]): ScoreboardRow[] {
  return rows.map((row) => ({ ...row, cells: row.cells.map(cloneCell) }));
}

/** Start a reveal over a board's rows. */
export function startReveal(rows: readonly ScoreboardRow[]): RevealState {
  return { rows: cloneRows(rows), history: [] };
}

/**
 * The lowest-ranked row that still has something frozen, and its leftmost
 * frozen cell: the bottom-up ICPC ceremony order.
 */
export function nextRevealTarget(rows: readonly ScoreboardRow[]): RevealTarget | null {
  let target: RevealTarget | null = null;

  for (const [rowIndex, row] of rows.entries()) {
    const cellIndex = row.cells.findIndex((cell) => cell.state === FROZEN);

    // The last row that still has a frozen cell is the lowest-ranked one.
    if (cellIndex !== -1) target = { rowIndex, cellIndex, rank: row.rank };
  }

  return target;
}

function applyReveal(rows: ScoreboardRow[], target: RevealTarget): void {
  const row = rows[target.rowIndex];
  const cell = row?.cells[target.cellIndex];

  if (row === undefined || cell === undefined) return;
  const truth = cell.reveal;

  if (truth) {
    cell.state = truth.state;
    cell.wrong = truth.wrong;
    cell.time = truth.time;
    cell.penalty = truth.penalty;
  } else {
    // A frozen cell always carries its resolution for admins. Fail closed
    // rather than looping forever on it.
    cell.state = FAILED;
    cell.penalty = 0;
  }

  cell.pending = 0;
  delete cell.reveal;

  row.solved = row.cells.filter((c) => c.state === SOLVED).length;
  row.penalty = row.cells.reduce((sum, c) => sum + (c.state === SOLVED ? c.penalty : 0), 0);
  rankRows(rows);
}

/** Reveal one cell, bottom-up. Returns the state unchanged when nothing is left. */
export function revealStep(state: RevealState): RevealState {
  const target = nextRevealTarget(state.rows);

  if (!target) return state;
  const history = [...state.history, cloneRows(state.rows)];
  const rows = cloneRows(state.rows);
  applyReveal(rows, target);

  return { rows, history };
}

/** Undo the last reveal step. */
export function revealUndo(state: RevealState): RevealState {
  const previous = state.history.at(-1);

  if (previous === undefined) return state;

  return { rows: previous, history: state.history.slice(0, -1) };
}

/** Reveal everything remaining, as one undoable step. */
export function revealAll(state: RevealState): RevealState {
  if (!nextRevealTarget(state.rows)) return state;
  const history = [...state.history, cloneRows(state.rows)];
  const rows = cloneRows(state.rows);

  for (let target = nextRevealTarget(rows); target; target = nextRevealTarget(rows)) {
    applyReveal(rows, target);
  }

  return { rows, history };
}

/* -------------------------------------------------------------------------- */
/* Freeze on the ordinary contest ranking                                     */
/* -------------------------------------------------------------------------- */

/**
 * Whether this viewer sees through the freeze: contest editors, anyone always
 * admitted, and anyone with `see_private_contest` or `edit_all_contest`.
 */
export function canSeeThroughFreeze(contest: ContestRow, viewer: Viewer): boolean {
  if (!isAuthenticated(viewer)) return false;

  if (isSuperuser(viewer)) return true;

  if (hasPerm(viewer, "judge.see_private_contest") || hasPerm(viewer, "judge.edit_all_contest")) {
    return true;
  }

  if (contestIsEditableBy(contest, viewer)) return true;

  return (contest.alwaysAdmitProfileIds ?? []).includes(viewer.id);
}

export interface FreezeStatusOptions {
  readonly now?: number;
  /** Staff have revealed (or unfrozen) the board after the contest ended. */
  readonly revealed?: boolean;
}

/**
 * Whether the board is currently frozen for this viewer.
 *
 * The freeze starts at `endTime - freezeMinutes` and, per SPEC section 7, stays
 * on after the contest ends until staff reveal it.
 */
export function isFrozenFor(contest: ContestRow, viewer: Viewer, options: FreezeStatusOptions = {}): boolean {
  const cutoff = freezeTime(contest);

  if (cutoff === null) return false;

  if (options.revealed) return false;

  if (canSeeThroughFreeze(contest, viewer)) return false;

  return (options.now ?? Date.now()) >= cutoff;
}

export interface FreezeRankingRow {
  readonly participation: ContestParticipationRow;
  /** Every contest submission of that participation. */
  readonly submissions: readonly ContestSubmissionRow[];
}

export interface FrozenRankingRow {
  readonly participation: ContestParticipationRow;
  readonly update: ParticipationUpdate;
  /** True when this row was recomputed from pre-freeze submissions only. */
  readonly frozen: boolean;
}

export interface ApplyFreezeOptions extends FreezeStatusOptions {
  readonly contestProblems: readonly ContestProblemRow[];
}

/**
 * Recompute contest ranking rows with the freeze applied.
 *
 * During a freeze every live participation is rescored from submissions made
 * strictly before the freeze point, so a post-freeze solve cannot move anyone.
 * Virtual participations are never frozen (their window is their own), and
 * viewers who can see through the freeze get the unfrozen numbers.
 */
export function applyFreeze(
  rows: readonly FreezeRankingRow[],
  contest: ContestRow,
  viewer: Viewer,
  options: ApplyFreezeOptions,
): FrozenRankingRow[] {
  const cutoff = freezeTime(contest);
  const frozenForViewer = isFrozenFor(contest, viewer, options);

  return rows.map((row) => {
    const isVirtual = row.participation.virtual > 0;
    const freeze = cutoff !== null && frozenForViewer && !isVirtual;

    const submissions = freeze
      ? row.submissions.filter((submission) => submission.date < cutoff)
      : row.submissions;

    return {
      participation: row.participation,
      update: updateParticipation({
        participation: row.participation,
        submissions,
        contestProblems: options.contestProblems,
        contest,
      }),
      frozen: freeze,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Blind mode                                                                 */
/* -------------------------------------------------------------------------- */

export interface MaskedSubmission {
  readonly status: "QU";
  readonly result: null;
  readonly points: null;
  readonly casePoints: 0;
  readonly caseTotal: 0;
  readonly masked: true;
}

const MASKED: MaskedSubmission = {
  status: "QU",
  result: null,
  points: null,
  casePoints: 0,
  caseTotal: 0,
  masked: true,
};

export interface BlindOptions extends FreezeStatusOptions {
  /** The viewer's own profile id, when they are the contestant. */
  readonly viewerProfileId?: Id;
}

/**
 * `contests.freeze.blind`: a contestant's own verdicts read as pending
 * from the freeze point until the contest ends.
 *
 * Staff (anyone who can see through the freeze) always see the real verdict, as
 * does anyone looking at someone else's submission (that is the freeze's job,
 * not blind mode's).
 */
export function blindDuringFreeze<T extends { readonly profileId: Id; readonly date: number }>(
  submission: T,
  contest: ContestRow,
  viewer: Viewer,
  options: BlindOptions = {},
): T | (T & MaskedSubmission) {
  if (!contest.freeze?.blind) return submission;

  const cutoff = freezeTime(contest);

  if (cutoff === null) return submission;

  const now = options.now ?? Date.now();

  if (now < cutoff) return submission;

  // Blind mode lifts when the contest ends.
  if (now > contest.endTime) return submission;

  if (canSeeThroughFreeze(contest, viewer)) return submission;

  const viewerId = options.viewerProfileId ?? (isAuthenticated(viewer) ? viewer.id : undefined);

  if (viewerId === undefined || submission.profileId !== viewerId) return submission;

  if (submission.date < cutoff) return submission;

  return { ...submission, ...MASKED };
}
