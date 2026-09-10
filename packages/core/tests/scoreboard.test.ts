/**
 * The ICPC hall scoreboard, the freeze and the reveal, from the MAPS fork
 * (judge/utils/frozen_scoreboard.py, judge/views/live_scoreboard.py and the
 * reveal logic in templates/contest/live-scoreboard.html).
 */

import { describe, expect, it } from "vitest";
import type { Attempt, ScoreboardRow } from "../src/scoreboard";
import {
  applyFreeze,
  attemptAccepted,
  attemptIgnored,
  attemptPending,
  blindDuringFreeze,
  buildCell,
  buildScoreboard,
  CORRECT,
  canReveal,
  canSeeThroughFreeze,
  cellPenalty,
  classifyEvent,
  EMPTY,
  FAILED,
  FROZEN,
  firstSolves,
  freezeOffsetFor,
  freezeTime,
  IGNORED_RESULTS,
  INCORRECT,
  isFirstBlood,
  isFrozenFor,
  JUDGING,
  nextRevealTarget,
  PENDING,
  PENDING_RESULTS,
  penaltyMinutesFor,
  rankRows,
  revealAll,
  revealStep,
  revealUndo,
  SOLVED,
  startReveal,
  toAttempt,
} from "../src/scoreboard";
import type { ContestSubmissionRow } from "../src/types";
import {
  commonUsers,
  createContest,
  createContestProblem,
  createParticipation,
  createUser,
  HOUR,
  MINUTE,
  NOW,
} from "./fixtures";

const START = NOW;
const END = START + 5 * HOUR;
const FREEZE_OFFSET = 4 * 3600; // seconds; a one hour freeze on a five hour contest

const contest = createContest("hall", {
  startTime: START,
  endTime: END,
  freezeMinutes: 60,
  formatName: "icpc",
});

function attempt(
  participation: string,
  problem: string,
  seconds: number,
  result: string | null,
  points = result === "AC" ? 1 : 0,
): Attempt {
  return { participation, problem, time: seconds, points, result, maxPoints: 1 };
}

describe("attempt classification", () => {
  it("ignores IE, CE and AB", () => {
    expect(IGNORED_RESULTS).toEqual(["IE", "CE", "AB"]);
    for (const result of IGNORED_RESULTS) {
      expect(attemptIgnored(attempt("u", "p", 10, result))).toBe(true);
    }
    expect(attemptIgnored(attempt("u", "p", 10, "WA"))).toBe(false);
  });

  it("treats null, empty, D and the grading statuses as pending", () => {
    expect(PENDING_RESULTS).toEqual([null, "", "D", "QU", "P", "G"]);
    for (const result of PENDING_RESULTS) {
      expect(attemptPending(attempt("u", "p", 10, result))).toBe(true);
      expect(attemptAccepted(attempt("u", "p", 10, result, 1))).toBe(false);
    }
  });

  it("accepts an AC, or full marks without one", () => {
    expect(attemptAccepted(attempt("u", "p", 10, "AC"))).toBe(true);
    expect(attemptAccepted(attempt("u", "p", 10, "WA", 1))).toBe(true);
    expect(attemptAccepted(attempt("u", "p", 10, "WA", 0.5))).toBe(false);
  });

  it("flattens a contest submission", () => {
    const submission: ContestSubmissionRow = {
      id: "s",
      contestProblemId: "pa",
      participationId: "u1",
      contestPoints: 1,
      result: "AC",
      status: "D",
      date: START + 10 * MINUTE,
    };
    expect(toAttempt(submission, contest, 1)).toEqual({
      participation: "u1",
      problem: "pa",
      time: 600,
      points: 1,
      result: "AC",
      maxPoints: 1,
    });
  });
});

describe("cells", () => {
  it("solves before the freeze, with a penalty per wrong try", () => {
    const cell = buildCell(
      [attempt("u", "p", 600, "WA"), attempt("u", "p", 1200, "AC"), attempt("u", "p", 1800, "WA")],
      FREEZE_OFFSET,
      20,
    );
    expect(cell).toEqual({ state: SOLVED, wrong: 1, pending: 0, time: 1200, penalty: 40 });
    expect(cellPenalty(1200, 1, 20)).toBe(40);
    expect(cellPenalty(119, 0, 20)).toBe(1);
  });

  it("freezes anything submitted at or after the freeze", () => {
    const attempts = [attempt("u", "p", 600, "WA"), attempt("u", "p", FREEZE_OFFSET, "AC")];
    const cell = buildCell(attempts, FREEZE_OFFSET, 20, true);
    expect(cell.state).toBe(FROZEN);
    expect(cell.wrong).toBe(1);
    expect(cell.pending).toBe(1);
    expect(cell.penalty).toBe(0);
    expect(cell.reveal).toEqual({
      state: SOLVED,
      wrong: 1,
      time: FREEZE_OFFSET,
      penalty: 240 + 20,
    });
  });

  it("does not leak the reveal unless asked", () => {
    const cell = buildCell([attempt("u", "p", FREEZE_OFFSET, "AC")], FREEZE_OFFSET, 20, false);
    expect(cell.state).toBe(FROZEN);
    expect(cell.reveal).toBeUndefined();
  });

  it("distinguishes judging from frozen", () => {
    const judging = buildCell([attempt("u", "p", 600, null)], FREEZE_OFFSET, 20, true);
    expect(judging.state).toBe(JUDGING);
    expect(judging.pending).toBe(1);
    expect(judging.reveal).toBeUndefined();
  });

  it("fails an attempted problem and empties an unattempted one", () => {
    expect(buildCell([attempt("u", "p", 600, "WA")], FREEZE_OFFSET, 20).state).toBe(FAILED);
    expect(buildCell([], FREEZE_OFFSET, 20).state).toBe(EMPTY);
    // Ignored verdicts never make a cell look attempted.
    expect(buildCell([attempt("u", "p", 600, "CE")], FREEZE_OFFSET, 20).state).toBe(EMPTY);
  });

  it("stops at the first accept", () => {
    const cell = buildCell(
      [attempt("u", "p", 1200, "AC"), attempt("u", "p", 600, "WA"), attempt("u", "p", 1800, "WA")],
      FREEZE_OFFSET,
      20,
    );
    expect(cell.wrong).toBe(1);
    expect(cell.time).toBe(1200);
  });
});

describe("buildScoreboard", () => {
  const problems = [
    { id: "pa", label: "A" },
    { id: "pb", label: "B" },
  ];
  const participants = [
    { id: "u1", username: "alice" },
    { id: "u2", username: "bob" },
    { id: "u3", username: "carol" },
  ];
  const attempts = [
    attempt("u1", "pa", 600, "WA"),
    attempt("u1", "pa", 1200, "AC"),
    attempt("u1", "pb", 15000, "AC"),
    attempt("u2", "pa", 300, "WA"),
    attempt("u2", "pb", 600, null),
    attempt("u9", "pa", 100, "AC"),
  ];

  const board = buildScoreboard({
    problems,
    participants,
    attempts,
    freezeOffset: FREEZE_OFFSET,
    penaltyMinutes: 20,
    includeReveal: true,
  });

  it("scores and ranks the rows", () => {
    expect(board.rows.map((row) => row.username)).toEqual(["alice", "bob", "carol"]);
    expect(board.rows.map((row) => row.rank)).toEqual([1, 2, 2]);
    expect(board.rows[0]).toMatchObject({ solved: 1, penalty: 40 });
    expect(board.rows[0]?.cells.map((cell) => cell.state)).toEqual([SOLVED, FROZEN]);
    expect(board.rows[1]?.cells.map((cell) => cell.state)).toEqual([FAILED, JUDGING]);
    expect(board.rows[2]?.cells.map((cell) => cell.state)).toEqual([EMPTY, EMPTY]);
  });

  it("drops attempts from unknown participants and problems", () => {
    const stray = buildScoreboard({
      problems,
      participants,
      attempts: [attempt("u1", "unknown", 100, "AC")],
      freezeOffset: FREEZE_OFFSET,
    });
    expect(stray.rows.every((row) => row.solved === 0)).toBe(true);
  });

  it("shares ranks by solves and penalty, breaking the display order by username", () => {
    const rows: ScoreboardRow[] = [
      { id: "1", username: "zoe", cells: [], solved: 1, penalty: 10, rank: 0 },
      { id: "2", username: "amy", cells: [], solved: 1, penalty: 10, rank: 0 },
      { id: "3", username: "bob", cells: [], solved: 2, penalty: 99, rank: 0 },
      { id: "4", username: "cat", cells: [], solved: 1, penalty: 5, rank: 0 },
    ];
    const ranked = rankRows(rows);
    expect(ranked.map((row) => row.username)).toEqual(["bob", "cat", "amy", "zoe"]);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 3, 3]);
  });

  it("highlights the first solve of each problem", () => {
    const solves = firstSolves(board.rows);
    expect(solves.get(0)).toBe(1200);
    expect(isFirstBlood(board.rows, board.rows[0] as ScoreboardRow, 0)).toBe(true);
    expect(isFirstBlood(board.rows, board.rows[1] as ScoreboardRow, 0)).toBe(false);
  });
});

describe("classifyEvent", () => {
  it("masks everything at or after the freeze", () => {
    expect(classifyEvent(attempt("u", "p", FREEZE_OFFSET, "AC"), FREEZE_OFFSET)).toEqual([PENDING, true]);
    expect(classifyEvent(attempt("u", "p", FREEZE_OFFSET + 1, "WA"), FREEZE_OFFSET)).toEqual([PENDING, true]);
    expect(classifyEvent(attempt("u", "p", 100, null), FREEZE_OFFSET)).toEqual([PENDING, false]);
    expect(classifyEvent(attempt("u", "p", 100, "AC"), FREEZE_OFFSET)).toEqual([CORRECT, false]);
    expect(classifyEvent(attempt("u", "p", 100, "WA"), FREEZE_OFFSET)).toEqual([INCORRECT, false]);
  });
});

describe("reveal", () => {
  const problems = [{ id: "pa" }, { id: "pb" }];
  const participants = [
    { id: "u1", username: "alice" },
    { id: "u2", username: "bob" },
  ];
  const attempts = [
    attempt("u1", "pa", 600, "AC"),
    attempt("u1", "pb", 15000, "AC"),
    attempt("u2", "pa", 16000, "AC"),
    attempt("u2", "pb", 300, "WA"),
  ];
  const board = buildScoreboard({
    problems,
    participants,
    attempts,
    freezeOffset: FREEZE_OFFSET,
    penaltyMinutes: 20,
    includeReveal: true,
  });

  it("walks the board from the bottom, leftmost frozen cell first", () => {
    const state = startReveal(board.rows);
    const target = nextRevealTarget(state.rows);
    // bob is ranked below alice, so his frozen cell goes first.
    expect(target).toEqual({ rowIndex: 1, cellIndex: 0, rank: 2 });
  });

  it("resolves a cell, rescores the row and re-ranks", () => {
    let state = startReveal(board.rows);
    state = revealStep(state);

    const bob = state.rows.find((row) => row.username === "bob") as ScoreboardRow;
    expect(bob.cells[0]).toMatchObject({ state: SOLVED, time: 16000, pending: 0 });
    expect(bob.cells[0]?.reveal).toBeUndefined();
    expect(bob.solved).toBe(1);
    expect(bob.penalty).toBe(Math.floor(16000 / 60));
    // Alice is still ahead on penalty until her cell is revealed.
    expect(state.rows[0]?.username).toBe("alice");

    state = revealStep(state);
    const alice = state.rows.find((row) => row.username === "alice") as ScoreboardRow;
    expect(alice.solved).toBe(2);
    expect(state.rows[0]?.username).toBe("alice");
    expect(nextRevealTarget(state.rows)).toBeNull();
  });

  it("undoes a step", () => {
    const state = startReveal(board.rows);
    const stepped = revealStep(state);
    const undone = revealUndo(stepped);
    expect(undone.rows.map((row) => row.solved)).toEqual(state.rows.map((row) => row.solved));
    expect(nextRevealTarget(undone.rows)).toEqual(nextRevealTarget(state.rows));
    // Nothing to undo is a no-op.
    expect(revealUndo(state)).toBe(state);
  });

  it("reveals everything as one undoable step", () => {
    const state = startReveal(board.rows);
    const all = revealAll(state);
    expect(nextRevealTarget(all.rows)).toBeNull();
    expect(all.history).toHaveLength(1);
    expect(nextRevealTarget(revealUndo(all).rows)).not.toBeNull();
    // A finished board cannot be revealed further.
    expect(revealAll(all)).toBe(all);
    expect(revealStep(all)).toBe(all);
  });

  it("fails closed on a frozen cell with no reveal payload", () => {
    const blind = buildScoreboard({
      problems,
      participants,
      attempts,
      freezeOffset: FREEZE_OFFSET,
      penaltyMinutes: 20,
      includeReveal: false,
    });
    const state = revealStep(startReveal(blind.rows));
    const revealed = state.rows.flatMap((row) => row.cells).filter((cell) => cell.state === FAILED);
    expect(revealed.length).toBeGreaterThan(0);
    expect(nextRevealTarget(state.rows)).not.toBeNull();
  });

  it("lets superusers and editors of every division drive it", () => {
    const users = commonUsers();
    const editorOfOne = createUser("editor", { permissions: ["edit_own_contest"] });
    const divisionA = createContest("a", { curatorProfileIds: ["editor"] });
    const divisionB = createContest("b");

    expect(canReveal(users.superuser, [divisionA, divisionB])).toBe(true);
    expect(canReveal(editorOfOne, [divisionA])).toBe(true);
    expect(canReveal(editorOfOne, [divisionA, divisionB])).toBe(false);
    expect(canReveal(null, [divisionA])).toBe(false);
  });
});

describe("freeze configuration", () => {
  it("computes the freeze offset and instant", () => {
    expect(freezeOffsetFor(contest)).toBe(FREEZE_OFFSET);
    expect(freezeTime(contest)).toBe(END - HOUR);

    const unfrozen = { ...contest, freezeMinutes: 0 };
    // No freeze pushes the cutoff past the end of the contest.
    expect(freezeOffsetFor(unfrozen)).toBe(5 * 3600 + 1);
    expect(freezeTime(unfrozen)).toBeNull();

    // A freeze longer than the contest clamps to the start.
    expect(freezeOffsetFor({ ...contest, freezeMinutes: 600 })).toBe(0);
    expect(freezeTime({ ...contest, freezeMinutes: 600 })).toBe(START);
  });

  it("takes the penalty from the contest format", () => {
    expect(penaltyMinutesFor(contest)).toBe(20);
    expect(penaltyMinutesFor({ ...contest, formatConfig: { penalty: 5 } })).toBe(5);
    expect(penaltyMinutesFor({ formatName: "atcoder", formatConfig: null })).toBe(5);
    // A format with no penalty setting falls back to the ICPC default.
    expect(penaltyMinutesFor({ formatName: "default", formatConfig: null })).toBe(20);
    // A broken config never takes the board down.
    expect(penaltyMinutesFor({ formatName: "icpc", formatConfig: { penalty: "x" } })).toBe(20);
  });
});

describe("applyFreeze", () => {
  const problem = createContestProblem("hall", "one", { points: 100, order: 1 });
  const participation = createParticipation("hall", "alice", { realStart: START });
  const virtual = createParticipation("hall", "bob", { realStart: START, virtual: 1 });

  const submissions: ContestSubmissionRow[] = [
    {
      id: "before",
      contestProblemId: problem.id,
      participationId: participation.id,
      contestPoints: 50,
      result: "WA",
      status: "D",
      date: START + HOUR,
    },
    {
      id: "after",
      contestProblemId: problem.id,
      participationId: participation.id,
      contestPoints: 100,
      result: "AC",
      status: "D",
      date: START + 4.5 * HOUR,
    },
  ];

  const now = START + 4.5 * HOUR;
  const users = commonUsers();

  it("rescores from pre-freeze submissions for ordinary viewers", () => {
    const [row] = applyFreeze([{ participation, submissions }], contest, users.normal, {
      contestProblems: [problem],
      now,
    });
    expect(row?.frozen).toBe(true);
    expect(row?.update.score).toBe(50);
  });

  it("shows the real standings to viewers who see through the freeze", () => {
    const editorContest = { ...contest, curatorProfileIds: ["normal"] };
    const editor = createUser("normal", { permissions: ["edit_own_contest"] });
    const [row] = applyFreeze([{ participation, submissions }], editorContest, editor, {
      contestProblems: [problem],
      now,
    });
    expect(row?.frozen).toBe(false);
    expect(row?.update.score).toBe(100);
  });

  it("never freezes a virtual participation", () => {
    const [row] = applyFreeze(
      [
        {
          participation: virtual,
          submissions: submissions.map((submission) => ({
            ...submission,
            participationId: virtual.id,
          })),
        },
      ],
      contest,
      users.normal,
      { contestProblems: [problem], now },
    );
    expect(row?.frozen).toBe(false);
    expect(row?.update.score).toBe(100);
  });

  it("does nothing before the freeze point or once revealed", () => {
    const early = applyFreeze([{ participation, submissions }], contest, users.normal, {
      contestProblems: [problem],
      now: START + HOUR,
    });
    expect(early[0]?.frozen).toBe(false);

    const revealed = applyFreeze([{ participation, submissions }], contest, users.normal, {
      contestProblems: [problem],
      now,
      revealed: true,
    });
    expect(revealed[0]?.frozen).toBe(false);
    expect(revealed[0]?.update.score).toBe(100);
  });

  it("reports who sees through the freeze", () => {
    expect(isFrozenFor(contest, users.normal, { now })).toBe(true);
    expect(isFrozenFor(contest, users.superuser, { now })).toBe(false);
    expect(isFrozenFor({ ...contest, freezeMinutes: 0 }, users.normal, { now })).toBe(false);

    expect(canSeeThroughFreeze(contest, users.superuser)).toBe(true);
    expect(canSeeThroughFreeze(contest, users.normal)).toBe(false);
    expect(canSeeThroughFreeze(contest, null)).toBe(false);
    expect(
      canSeeThroughFreeze({ ...contest, viewContestScoreboardProfileIds: ["normal"] }, users.normal),
    ).toBe(true);
    expect(canSeeThroughFreeze(contest, createUser("staff", { permissions: ["see_private_contest"] }))).toBe(
      true,
    );
  });
});

describe("blindDuringFreeze", () => {
  const blindContest = { ...contest, blindDuringFreeze: true };
  const users = commonUsers();
  const contestant = createUser("alice");
  const own = { id: "s", profileId: "alice", date: START + 4.5 * HOUR, result: "AC" as const };
  const now = START + 4.5 * HOUR;

  it("masks a contestant own post-freeze submission", () => {
    const masked = blindDuringFreeze(own, blindContest, contestant, { now });
    expect(masked).toMatchObject({ masked: true, status: "QU", result: null, points: null });
  });

  it("leaves pre-freeze submissions alone", () => {
    const early = { ...own, date: START + HOUR };
    expect(blindDuringFreeze(early, blindContest, contestant, { now })).toBe(early);
  });

  it("lifts once the contest ends", () => {
    expect(blindDuringFreeze(own, blindContest, contestant, { now: END + MINUTE })).toBe(own);
  });

  it("does nothing without the flag, for staff, or for other people submissions", () => {
    expect(blindDuringFreeze(own, contest, contestant, { now })).toBe(own);
    expect(blindDuringFreeze(own, blindContest, users.superuser, { now })).toBe(own);
    const other = { ...own, profileId: "someone_else" };
    expect(blindDuringFreeze(other, blindContest, contestant, { now })).toBe(other);
  });
});
