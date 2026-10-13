/**
 * Organisation standings: a scoreboard event ranks organisations by pooling
 * their members' contest scores, and every further member's score on a
 * problem counts for less than the one before it.
 *
 * Per problem, an organisation's positive scores sorted best first count
 * `s_0 + s_1·d + s_2·d² + …`, where `d` is the event's decay: 1 adds everyone up
 * in full, 0 keeps only the best, and anything between lets every member add
 * something while the best counts most. The total is the sum over every
 * problem of every contest in the event. DMOJ has nothing like it.
 */

import type { FormatData, FormatDataEntry, Id } from "./types";
import { pyRound } from "./util/number";

/** Digits a standings score keeps, so equal totals compare equal. */
export const STANDINGS_SCORE_DIGITS = 6;

/** Whether a decay is usable: a finite weight between 0 and 1 inclusive. */
export function isValidDecay(decay: number): boolean {
  return Number.isFinite(decay) && decay >= 0 && decay <= 1;
}

export interface MembershipRef {
  readonly organizationId: Id;
  readonly order: number;
}

/**
 * The organisation an entrant counts for: its first membership, by `order`,
 * among the event's organisations, where an empty list admits every
 * organisation. Null when it belongs to none of them.
 */
export function entrantOrganization(
  memberships: readonly MembershipRef[],
  organizationIds: readonly Id[],
): Id | null {
  const allowed = organizationIds.length ? new Set(organizationIds) : null;
  const ordered = [...memberships].sort((a, b) => a.order - b.order);

  return ordered.find((row) => !allowed || allowed.has(row.organizationId))?.organizationId ?? null;
}

/** What one problem of a participation is worth: its points plus any bonus (ecoo). */
export function formatDataScore(entry: FormatDataEntry): number {
  return entry.points + (entry.bonus ?? 0);
}

/** Score per contest problem id. */
export type ProblemScores = Record<Id, number>;

/** A participation's problem scores, from its `formatData`. */
export function problemScores(formatData: FormatData | null | undefined): ProblemScores {
  const out: ProblemScores = {};

  for (const [problemId, entry] of Object.entries(formatData ?? {})) {
    out[problemId] = formatDataScore(entry);
  }

  return out;
}

/** `Σ s_i · decay^i` over the positive scores, best first. */
export function diminishingSum(scores: readonly number[], decay: number): number {
  const positive = scores.filter((score) => score > 0).sort((a, b) => b - a);

  return positive.reduce((sum, score, index) => sum + score * decay ** index, 0);
}

export interface StandingsEntrant {
  readonly id: Id;
  /** From `entrantOrganization`; an entrant in none of the organisations does not count. */
  readonly organizationId: Id | null;
  /** Across every contest of the event. */
  readonly scores: Readonly<ProblemScores>;
}

export interface OrganizationStandingsInput {
  readonly decay: number;
  /** Contest problem ids, in display order. */
  readonly problemIds: readonly Id[];
  /** The organisations in the standings, in the order ties are listed. */
  readonly organizationIds: readonly Id[];
  readonly entrants: readonly StandingsEntrant[];
}

export interface EntrantTotal {
  readonly id: Id;
  readonly total: number;
}

export interface OrganizationStanding {
  readonly organizationId: Id;
  /** Shared by organisations with equal totals. */
  readonly rank: number;
  readonly total: number;
  /** The organisation's score on each problem, in `problemIds` order. */
  readonly problems: readonly number[];
  /** Its entrants' own totals, best first; equal totals keep the input order. */
  readonly entrants: readonly EntrantTotal[];
}

function roundScore(value: number): number {
  return pyRound(value, STANDINGS_SCORE_DIGITS);
}

/**
 * Rank the organisations by their pooled totals, highest first. Every listed
 * organisation gets a row, with or without entrants; ties share a rank and keep
 * the order of `organizationIds`.
 */
export function organizationStandings(input: OrganizationStandingsInput): OrganizationStanding[] {
  const members = new Map<Id, StandingsEntrant[]>(input.organizationIds.map((id) => [id, []]));

  for (const entrant of input.entrants) {
    if (entrant.organizationId === null) continue;
    members.get(entrant.organizationId)?.push(entrant);
  }

  const rows = input.organizationIds.map((organizationId) => {
    const entrants = members.get(organizationId) ?? [];

    const raw = input.problemIds.map((problemId) =>
      diminishingSum(
        entrants.map((entrant) => entrant.scores[problemId] ?? 0),
        input.decay,
      ),
    );

    const totals = entrants
      .map((entrant) => ({
        id: entrant.id,
        total: roundScore(
          input.problemIds.reduce((sum, problemId) => sum + Math.max(0, entrant.scores[problemId] ?? 0), 0),
        ),
      }))
      .sort((a, b) => b.total - a.total);

    return {
      organizationId,
      rank: 0,
      total: roundScore(raw.reduce((sum, score) => sum + score, 0)),
      problems: raw.map(roundScore),
      entrants: totals,
    };
  });

  rows.sort((a, b) => b.total - a.total);

  let rank = 0;
  let last: number | null = null;

  for (const [index, row] of rows.entries()) {
    if (row.total !== last) {
      rank = index + 1;
      last = row.total;
    }

    row.rank = rank;
  }

  return rows;
}
