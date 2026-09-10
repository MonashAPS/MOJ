/**
 * The hall scoreboard's view rules: the attendance filter, the display ranks,
 * the ceremony's next target and the event feed.
 *
 * Everything here is pure and derived from one `scoreboard.event` subscription,
 * which is the whole reason the page needs no polling. The ordering rule is
 * `rankRows` from `@moj/core` restated for the filtered view: the server ranks
 * the whole division, and filtering to the hall has to re-rank so the board
 * reads 1, 2, 3 with no gaps where a remote competitor was.
 */

import type { BoardCell, BoardRow, Division, ScoreboardEventPayload } from "@convex/scoreboard";

export type Attendance = "all" | "in-person";

export type DisplayRow = BoardRow & { displayRank: number };

/** `@moj/core`'s `rankRows` comparator: solves desc, penalty asc, then name. */
export function compareRows(a: BoardRow, b: BoardRow): number {
  return (
    b.solved - a.solved ||
    a.penalty - b.penalty ||
    (a.username < b.username ? -1 : a.username > b.username ? 1 : 0)
  );
}

/** Ties share a rank, and the next rank skips past them. */
function assignRanks(rows: BoardRow[]): DisplayRow[] {
  let lastKey: string | null = null;
  let rank = 0;
  return rows.map((row, index) => {
    const key = `${row.solved}/${row.penalty}`;
    if (key !== lastKey) {
      rank = index + 1;
      lastKey = key;
    }
    return { ...row, displayRank: rank };
  });
}

/** The rows actually on screen: filtered by attendance, then re-ranked. */
export function displayRows(division: Division, attendance: Attendance): DisplayRow[] {
  const rows = attendance === "in-person" ? division.rows.filter((row) => row.inPerson) : [...division.rows];
  rows.sort(compareRows);
  return assignRanks(rows);
}

export type RevealTarget = { rowIndex: number; cellIndex: number; rank: number; row: DisplayRow };

/**
 * The lowest-ranked row that still has something frozen, and its leftmost frozen
 * cell: the bottom-up ICPC ceremony order.
 *
 * Walks the *displayed* rows, so revealing an in-person-only board never stops
 * on a remote competitor nobody in the hall can see.
 */
export function nextRevealTarget(rows: readonly DisplayRow[]): RevealTarget | null {
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex--) {
    const row = rows[rowIndex];
    if (!row) continue;
    for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex++) {
      if (row.cells[cellIndex]?.state === "frozen") {
        return { rowIndex, cellIndex, rank: row.displayRank, row };
      }
    }
  }
  return null;
}

/** What a cell looks like, for spotting the ones that changed between updates. */
export function cellSignature(cell: BoardCell): string {
  return `${cell.state}:${cell.wrong}:${cell.pending}:${cell.time ?? ""}`;
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** ICPC counts in whole minutes from the start of the contest. */
export function contestMinutes(seconds: number): number {
  return Math.floor(seconds / 60);
}

/** A contest minute as a clock the hall can read: 1:30, not 90. */
export function contestClock(seconds: number): string {
  const total = contestMinutes(seconds);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/* -------------------------------------------------------------------------- */
/* Event feed                                                                 */
/* -------------------------------------------------------------------------- */

export type FeedEntry = {
  key: string;
  divisionKey: string;
  divisionName: string;
  state: "correct" | "pending";
  displayName: string;
  username: string;
  problem: string;
  /** Contest seconds, or null for an entry the freeze is still holding. */
  time: number | null;
  note: string;
};

/**
 * Recent solves and pending submissions across every division, newest first.
 *
 * Derived from the board rather than from the submission list: the hall's own
 * subscription already carries every solve time and every outstanding
 * submission, so the sidebar costs nothing extra and can never disagree with the
 * grid beside it. `convex/pages/scoreboard.ts`'s `feed` query is the
 * per-submission version of the same list (it also carries wrong answers and
 * wall-clock times); swap `entries` for it once it is deployed.
 *
 * Anything the freeze is holding sorts above the solves, because a frozen cell
 * is by definition a submission made at or after the freeze point — but only a
 * fifth of the list, so a long freeze cannot bury every solve.
 */
export function feedEntries(payload: ScoreboardEventPayload, limit = 60): FeedEntry[] {
  if (!payload) return [];

  const pending: FeedEntry[] = [];
  const solves: FeedEntry[] = [];

  for (const division of payload.divisions) {
    for (const row of division.rows) {
      row.cells.forEach((cell, index) => {
        const problem = division.problems[index];
        if (!problem) return;
        const base = {
          key: `${division.key}:${row.participationId}:${index}`,
          divisionKey: division.key,
          divisionName: division.name,
          displayName: row.displayName,
          username: row.username,
          problem: problem.label,
        };
        if (cell.state === "solved" && cell.time !== null) {
          solves.push({
            ...base,
            state: "correct",
            time: cell.time,
            note: cell.wrong ? `+${cell.wrong}` : "",
          });
        } else if (cell.state === "frozen" || cell.state === "judging") {
          const outstanding = cell.pending || 1;
          pending.push({
            ...base,
            state: "pending",
            time: null,
            note: plural(outstanding, "sub", "subs"),
          });
        }
      });
    }
  }

  pending.sort(
    (a, b) => a.divisionName.localeCompare(b.divisionName) || a.displayName.localeCompare(b.displayName),
  );
  solves.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));

  // Everything the freeze is holding is newer than every solve on the board, so
  // strict time order would bury the solves under a long freeze. The
  // outstanding submissions keep the top of the list but only a fifth of it.
  const room = Math.max(6, Math.floor(limit / 5));
  return [...pending.slice(0, room), ...solves].slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A display box that gets refreshed or restarted mid-event should come back up
 * the way it was left. A locked-down kiosk profile that refuses storage still
 * gets a working toggle for the session.
 */
export function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing or a kiosk profile: this session keeps the setting anyway.
  }
}
