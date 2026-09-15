/**
 * What the two duplicate repairs share: the page size, the per-pass budgets,
 * the cursor a pass resumes from and the report it hands back.
 *
 * `admin/languages.ts` repairs the `languages` table and `admin/dedupe.ts` the
 * six other tables `convex/importer.ts` keys naturally. Each owns its own plan
 * and its own per-table rewrites; the bookkeeping around them is here.
 */

import { v } from "convex/values";

/** Documents one page reads from a table. */
export const DEDUPE_PAGE = 200;
/** Rows one pass rewrites before handing over to the next scheduled pass. */
export const DEDUPE_WRITE_BUDGET = 500;
/** Documents one pass reads, for the tables it has to scan to find references. */
export const DEDUPE_READ_BUDGET = 2000;

/**
 * Where a pass got to: the table it was walking and, for the tables it has to
 * scan, the `_creationTime` it had reached. Convex allows only one `.paginate()`
 * per function execution, so the scans walk the built in `by_creation_time`
 * index instead, which also survives a patch: repointing a row does not move it.
 */
export interface DedupeState<Table extends string = string> {
  table: Table;
  cursor: number | null;
}

export interface Budget {
  reads: number;
  writes: number;
}

export interface DedupeReport {
  keys: string[];
  keysRepaired: number;
  rowsDeleted: number;
  referencesRewritten: number;
  isDone: boolean;
}

export const dedupeReportValidator = v.object({
  keys: v.array(v.string()),
  keysRepaired: v.number(),
  rowsDeleted: v.number(),
  referencesRewritten: v.number(),
  isDone: v.boolean(),
});

export const emptyDedupeReport: DedupeReport = {
  keys: [],
  keysRepaired: 0,
  rowsDeleted: 0,
  referencesRewritten: 0,
  isDone: true,
};

/** Where the next page of a scan starts, and whether there is one. */
export function nextPage(rows: { _creationTime: number }[]): { cursor: number | null; isDone: boolean } {
  const last = rows[rows.length - 1];
  if (rows.length < DEDUPE_PAGE || last === undefined) return { cursor: null, isDone: true };
  return { cursor: last._creationTime, isDone: false };
}

export function newBudget(): Budget {
  return { reads: DEDUPE_READ_BUDGET, writes: DEDUPE_WRITE_BUDGET };
}
