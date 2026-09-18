/**
 * What a DOMjudge scoreboard says that ours does not.
 *
 * DOMjudge's cells count attempts and minutes rather than points, its brightest
 * green is reserved for whoever solved a problem first, and the row under the
 * table says how many teams got each one out. All three are arithmetic over the
 * rows already on screen, which is what this does — no new query, and nothing
 * claimed about rows that have not loaded.
 */

export type BoardCell = {
  state: string;
  points: number;
  pointsText: string;
  timeText: string;
  /** ICPC's rejected-submission count; absent in formats that do not penalise. */
  penalty?: number;
  /** Every submission the judge ran on it, the solve included. */
  attempts?: number;
};

export type BoardRow = {
  participationId: string;
  isDisqualified: boolean;
  problems: (BoardCell | null)[];
};

export type ProblemStanding = {
  /** Rows shown that have it out. */
  solved: number;
  /** Rows shown that have submitted to it at all. */
  tried: number;
  /** Who got it first, by the time on the cell. */
  firstParticipationId: string | null;
};

/** `niceRepr` writes HH:MM:SS; DOMjudge's cell counts whole minutes. */
export function minutesOf(timeText: string): number | null {
  const parts = /^(-?)(\d+):([0-5]\d):([0-5]\d)$/.exec(timeText);

  if (!parts) return null;
  const total = Number(parts[2]) * 3600 + Number(parts[3]) * 60 + Number(parts[4]);
  const minutes = Math.floor(total / 60);

  return parts[1] === "-" ? -minutes : minutes;
}

export function isSolved(state: string): boolean {
  return state.replace("pretest-", "") === "full-score";
}

/**
 * How many times the row went at the problem.
 *
 * Every format records this now, so the count is usually just there. A
 * participation scored before it was recorded falls back to the penalty, which
 * is the rejections that preceded the solve — one fewer than the tries it took.
 * Null when neither is there, and the cell has nothing to say but its score.
 */
export function triesOf(cell: BoardCell): number | null {
  if (cell.attempts !== undefined) return cell.attempts;

  if (cell.penalty === undefined) return null;

  return isSolved(cell.state) ? cell.penalty + 1 : cell.penalty;
}

/**
 * Per problem, over the rows given: how many solved it, how many tried, and who
 * was first.
 *
 * A disqualified row is counted by neither, and cannot take first blood: DOMjudge
 * strikes those rows out of the standings rather than leaving them holding a
 * record.
 */
export function boardStandings(rows: readonly BoardRow[], problemCount: number): ProblemStanding[] {
  const standings: ProblemStanding[] = Array.from({ length: problemCount }, () => ({
    solved: 0,
    tried: 0,
    firstParticipationId: null,
  }));

  const firstAt: (number | null)[] = Array.from({ length: problemCount }, () => null);

  for (const row of rows) {
    if (row.isDisqualified) continue;

    for (let index = 0; index < problemCount; index += 1) {
      const cell = row.problems[index];
      const standing = standings[index];

      if (!cell || !standing) continue;
      const tries = triesOf(cell);

      // A cell exists because something was submitted, whatever it scored.
      if (tries === null || tries > 0 || isSolved(cell.state)) standing.tried += 1;

      if (!isSolved(cell.state)) continue;
      standing.solved += 1;

      const minutes = minutesOf(cell.timeText);

      if (minutes === null) continue;
      const best = firstAt[index];

      if (best === null || best === undefined || minutes < best) {
        firstAt[index] = minutes;
        standing.firstParticipationId = row.participationId;
      }
    }
  }

  return standings;
}
