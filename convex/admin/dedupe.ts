// Staff console: the duplicate rows an older import left in the reference
// tables. convex/admin/languages.ts holds the same repair for `languages`,
// which broke the judge handshake and so was written first; this is the repair
// for the other six tables convex/importer.ts upserts by a natural key.

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, mutation } from "../_generated/server";
import { requireSuperuser } from "../lib/auth";
import { writeRevision } from "../lib/community";

/**
 * `npm run setup` seeds the reference tables and an older `npm run import`
 * inserted the dump's rows on top of them, so a deployment that was seeded and
 * then imported holds two rows for every natural key. The navigation bar is
 * where it shows: the header renders "Problems Problems Submissions
 * Submissions". The importer upserts by the key now; this repairs the
 * deployments loaded before it did.
 *
 * The work is bounded the way `admin/languages.dedupeByKey` bounds it: one pass
 * rewrites up to `DEDUPE_WRITE_BUDGET` rows and reads up to
 * `DEDUPE_READ_BUDGET` documents, then schedules the next pass. Re-running it
 * once it is done is a no-op.
 */

/** What the revisions read when nobody said why. */
const DEDUPE_REASON = "Merged duplicate rows by natural key";
/** Documents one page reads from a table. */
const DEDUPE_PAGE = 200;
/** Rows one pass rewrites before handing over to the next scheduled pass. */
const DEDUPE_WRITE_BUDGET = 500;
/** Documents one pass reads, for the tables it has to scan to find references. */
const DEDUPE_READ_BUDGET = 2000;

/**
 * The tables convex/importer.ts keys naturally, minus `languages`, which
 * `admin/languages.dedupeByKey` already owns.
 */
type KeyedTable =
  | "problemTypes"
  | "problemGroups"
  | "licenses"
  | "navigationBar"
  | "miscConfig"
  | "flatPages";

/**
 * Every table in convex/schema.ts with a field that names one of those rows, in
 * the order the repair walks them: `problems.typeIds`, `problems.groupId` and
 * `problems.licenseId`, then `navigationBar.parentId`, which points back inside
 * the table being repaired. Nothing names a `miscConfig` or a `flatPages` row,
 * so those two only need their losers gone.
 */
const DEDUPE_TABLES = ["problems", "navigationBar"] as const;

type DedupeTable = (typeof DEDUPE_TABLES)[number];

const dedupeTableValidator = v.union(v.literal("problems"), v.literal("navigationBar"));

/**
 * Where a pass got to: the table it was walking and, for the tables it has to
 * scan, the `_creationTime` it had reached. Convex allows only one `.paginate()`
 * per function execution, so the scans walk the built in `by_creation_time`
 * index instead, which also survives a patch: repointing a row does not move it.
 */
interface DedupeState {
  table: DedupeTable;
  cursor: number | null;
}

interface Budget {
  reads: number;
  writes: number;
}

/** The fields the ranking reads; every keyed table carries all three. */
interface KeyedRow {
  _id: Id<KeyedTable>;
  _creationTime: number;
  legacyId?: number;
}

/** A losing row and the row its references move to. */
interface Merge {
  entityType: string;
  loser: KeyedRow;
  survivor: Id<KeyedTable>;
}

interface TablePlan<Row extends KeyedRow> {
  keys: string[];
  merges: Merge[];
  survivorOf: Map<Row["_id"], Row["_id"]>;
}

/**
 * Orders the rows sharing a natural key, survivor first.
 *
 * A row carrying a `legacyId` came out of the dump, and the imported problems
 * were resolved against the legacy id mapping, so that row is the one
 * production data points at: it beats a row without one. Between two rows that
 * both were imported, or neither was, the newest wins, because it is the one
 * the most recent load wrote and the one anything imported since then names.
 * The `_id` tie-break is what makes the order total, so a repair spread over
 * several passes keeps picking the same survivor.
 */
function bySurvivorRank(a: KeyedRow, b: KeyedRow): number {
  const aImported = a.legacyId === undefined ? 1 : 0;
  const bImported = b.legacyId === undefined ? 1 : 0;
  if (aImported !== bImported) return aImported - bImported;
  if (a._creationTime !== b._creationTime) return b._creationTime - a._creationTime;
  return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
}

/** Plans one keyed table: which rows go, which row each of them folds into. */
function planTable<Row extends KeyedRow>(
  table: KeyedTable,
  entityType: string,
  rows: Row[],
  keyOf: (row: Row) => string,
): TablePlan<Row> {
  const byKey = new Map<string, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = byKey.get(key);
    if (group) group.push(row);
    else byKey.set(key, [row]);
  }

  const keys: string[] = [];
  const merges: Merge[] = [];
  const survivorOf = new Map<Row["_id"], Row["_id"]>();
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    // Six tables share one report, so the key says which table it came from.
    keys.push(`${table}/${key}`);
    const ranked = [...group].sort(bySurvivorRank);
    const survivor = ranked[0] as Row;
    for (const loser of ranked.slice(1)) {
      survivorOf.set(loser._id, survivor._id);
      merges.push({ entityType, loser, survivor: survivor._id });
    }
  }
  return { keys, merges, survivorOf };
}

interface DedupePlan {
  keys: string[];
  merges: Merge[];
  problemTypes: Map<Id<"problemTypes">, Id<"problemTypes">>;
  problemGroups: Map<Id<"problemGroups">, Id<"problemGroups">>;
  licenses: Map<Id<"licenses">, Id<"licenses">>;
  navigationBar: Map<Id<"navigationBar">, Id<"navigationBar">>;
}

/**
 * The plan for every keyed table at once, recomputed at the top of each pass.
 * Collecting them whole is what they are for: they are the reference tables,
 * a few hundred rows between them even on an imported site.
 */
async function buildPlan(ctx: MutationCtx): Promise<DedupePlan> {
  const [types, groups, licenses, navigation, misc, pages] = await Promise.all([
    ctx.db.query("problemTypes").collect(),
    ctx.db.query("problemGroups").collect(),
    ctx.db.query("licenses").collect(),
    ctx.db.query("navigationBar").collect(),
    ctx.db.query("miscConfig").collect(),
    ctx.db.query("flatPages").collect(),
  ]);

  const typePlan = planTable("problemTypes", "problemType", types, (row) => row.name);
  const groupPlan = planTable("problemGroups", "problemGroup", groups, (row) => row.name);
  const licensePlan = planTable("licenses", "license", licenses, (row) => row.key);
  const navigationPlan = planTable("navigationBar", "navigationBar", navigation, (row) => row.key);
  const miscPlan = planTable("miscConfig", "miscConfig", misc, (row) => row.key);
  const pagePlan = planTable("flatPages", "flatPage", pages, (row) => row.url);

  const all = [typePlan, groupPlan, licensePlan, navigationPlan, miscPlan, pagePlan];
  return {
    keys: all.flatMap((plan) => plan.keys).sort(),
    merges: all.flatMap((plan) => plan.merges),
    problemTypes: typePlan.survivorOf,
    problemGroups: groupPlan.survivorOf,
    licenses: licensePlan.survivorOf,
    navigationBar: navigationPlan.survivorOf,
  };
}

/** One page of `problems`, walked by `_creationTime`, which Convex keeps unique. */
async function problemsPage(ctx: MutationCtx, cursor: number | null): Promise<Doc<"problems">[]> {
  const query = ctx.db.query("problems");
  return await (cursor === null
    ? query.withIndex("by_creation_time")
    : query.withIndex("by_creation_time", (q) => q.gt("_creationTime", cursor))
  ).take(DEDUPE_PAGE);
}

/** Where the next page of a scan starts, and whether there is one. */
function advance(rows: { _creationTime: number }[]): { cursor: number | null; isDone: boolean } {
  const last = rows[rows.length - 1];
  if (rows.length < DEDUPE_PAGE || last === undefined) return { cursor: null, isDone: true };
  return { cursor: last._creationTime, isDone: false };
}

/**
 * One page of one reference table. `problems` holds all three of its keyed
 * references in one row, so a page repoints the types, the group and the
 * license together and patches once; it has no index on any of them, so it is
 * scanned with a cursor. `navigationBar.parentId` has one, so the children of
 * each loser are drained through it and a repointed row leaves the range.
 */
async function rewriteTablePage(
  ctx: MutationCtx,
  table: DedupeTable,
  plan: DedupePlan,
  cursor: number | null,
  budget: Budget,
): Promise<{ rewritten: number; cursor: number | null; isDone: boolean }> {
  if (table === "navigationBar") {
    for (const [loser, survivor] of plan.navigationBar) {
      const rows = await ctx.db
        .query("navigationBar")
        .withIndex("by_parent", (q) => q.eq("parentId", loser))
        .take(DEDUPE_PAGE);
      budget.reads -= Math.max(rows.length, 1);
      if (rows.length === 0) continue;
      for (const row of rows) {
        // admin/site.ts refuses to make an item its own parent, which is what
        // repointing a row onto the duplicate it is folding into would do.
        await ctx.db.patch(row._id, { parentId: row._id === survivor ? undefined : survivor });
      }
      budget.writes -= rows.length;
      return { rewritten: rows.length, cursor: null, isDone: false };
    }
    return { rewritten: 0, cursor: null, isDone: true };
  }

  const rows = await problemsPage(ctx, cursor);
  budget.reads -= Math.max(rows.length, 1);
  let rewritten = 0;
  for (const row of rows) {
    const patch: Partial<Doc<"problems">> = {};
    if (row.typeIds.some((id) => plan.problemTypes.has(id))) {
      const typeIds: Id<"problemTypes">[] = [];
      for (const id of row.typeIds) {
        const mapped = plan.problemTypes.get(id) ?? id;
        // The loser folds into the survivor rather than listing it twice.
        if (!typeIds.includes(mapped)) typeIds.push(mapped);
      }
      patch.typeIds = typeIds;
    }
    const group = plan.problemGroups.get(row.groupId);
    if (group) patch.groupId = group;
    const license = row.licenseId === undefined ? undefined : plan.licenses.get(row.licenseId);
    if (license) patch.licenseId = license;
    if (Object.keys(patch).length === 0) continue;
    await ctx.db.patch(row._id, patch);
    rewritten += 1;
  }
  budget.writes -= rewritten;
  return { rewritten, ...advance(rows) };
}

/** Walks the reference tables from `from` until the budget runs out. */
async function rewriteReferences(
  ctx: MutationCtx,
  plan: DedupePlan,
  from: DedupeState,
  budget: Budget,
): Promise<{ rewritten: number; next: DedupeState | null }> {
  const start = Math.max(DEDUPE_TABLES.indexOf(from.table), 0);
  let rewritten = 0;
  for (let i = start; i < DEDUPE_TABLES.length; i++) {
    const table = DEDUPE_TABLES[i] as DedupeTable;
    let cursor = i === start ? from.cursor : null;
    for (;;) {
      if (budget.reads <= 0 || budget.writes <= 0) return { rewritten, next: { table, cursor } };
      const step = await rewriteTablePage(ctx, table, plan, cursor, budget);
      rewritten += step.rewritten;
      if (step.isDone) break;
      cursor = step.cursor;
    }
  }
  return { rewritten, next: null };
}

export interface DedupeReport {
  keys: string[];
  keysRepaired: number;
  rowsDeleted: number;
  referencesRewritten: number;
  isDone: boolean;
}

const dedupeReportValidator = v.object({
  keys: v.array(v.string()),
  keysRepaired: v.number(),
  rowsDeleted: v.number(),
  referencesRewritten: v.number(),
  isDone: v.boolean(),
});

const emptyReport: DedupeReport = {
  keys: [],
  keysRepaired: 0,
  rowsDeleted: 0,
  referencesRewritten: 0,
  isDone: true,
};

/**
 * One bounded pass. Recomputes the plan from the tables every time, which is
 * what makes a resumed or repeated run safe: the losers are only deleted once
 * nothing points at them any more.
 */
async function dedupePass(
  ctx: MutationCtx,
  from: DedupeState,
  editorProfileId: Id<"profiles"> | undefined,
  reason: string,
): Promise<{ report: DedupeReport; next: DedupeState | null }> {
  const plan = await buildPlan(ctx);
  if (plan.merges.length === 0) return { report: emptyReport, next: null };

  const budget: Budget = { reads: DEDUPE_READ_BUDGET, writes: DEDUPE_WRITE_BUDGET };
  const { rewritten, next } = await rewriteReferences(ctx, plan, from, budget);
  if (next) {
    return {
      report: {
        keys: plan.keys,
        keysRepaired: 0,
        rowsDeleted: 0,
        referencesRewritten: rewritten,
        isDone: false,
      },
      next,
    };
  }

  let deleted = 0;
  for (const merge of plan.merges) {
    await writeRevision(
      ctx,
      merge.entityType,
      merge.survivor,
      { mergedFrom: merge.loser },
      editorProfileId,
      reason,
    );
    await ctx.db.delete(merge.loser._id);
    deleted += 1;
  }

  return {
    report: {
      keys: plan.keys,
      keysRepaired: plan.keys.length,
      rowsDeleted: deleted,
      referencesRewritten: rewritten,
      isDone: true,
    },
    next: null,
  };
}

/**
 * Merges the duplicate reference rows a pre-upsert import left behind.
 *
 * Superuser only: it rewrites problems and deletes rows, which is more than the
 * taxonomy and site permissions are meant to buy. Safe to run twice; `isDone`
 * false means a follow-up pass has been scheduled and is finishing the job.
 */
export const dedupeNaturalKeys = mutation({
  args: { reason: v.optional(v.string()) },
  returns: dedupeReportValidator,
  handler: async (ctx, { reason }): Promise<DedupeReport> => {
    const editor = await requireSuperuser(ctx);
    const why = reason ?? DEDUPE_REASON;
    const { report, next } = await dedupePass(
      ctx,
      { table: DEDUPE_TABLES[0], cursor: null },
      editor._id,
      why,
    );
    if (next) {
      await ctx.scheduler.runAfter(0, internal.admin.dedupe.dedupeNaturalKeysStep, {
        table: next.table,
        cursor: next.cursor,
        rewritten: report.referencesRewritten,
        editorProfileId: editor._id,
        reason: why,
      });
    }
    return report;
  },
});

/**
 * The scheduled continuation of `dedupeNaturalKeys`, one bounded pass per step.
 *
 * Also the way to start the repair from the command line, where there is no
 * signed in superuser for `dedupeNaturalKeys` to check: every argument
 * defaults, so `npx convex run admin/dedupe:dedupeNaturalKeysStep '{}'` runs
 * the whole thing.
 */
export const dedupeNaturalKeysStep = internalMutation({
  args: {
    table: v.optional(dedupeTableValidator),
    cursor: v.optional(v.union(v.number(), v.null())),
    rewritten: v.optional(v.number()),
    editorProfileId: v.optional(v.id("profiles")),
    reason: v.optional(v.string()),
  },
  returns: dedupeReportValidator,
  handler: async (ctx, args): Promise<DedupeReport> => {
    const reason = args.reason ?? DEDUPE_REASON;
    const { report, next } = await dedupePass(
      ctx,
      { table: args.table ?? DEDUPE_TABLES[0], cursor: args.cursor ?? null },
      args.editorProfileId,
      reason,
    );
    const total = (args.rewritten ?? 0) + report.referencesRewritten;
    if (next) {
      await ctx.scheduler.runAfter(0, internal.admin.dedupe.dedupeNaturalKeysStep, {
        table: next.table,
        cursor: next.cursor,
        rewritten: total,
        editorProfileId: args.editorProfileId,
        reason,
      });
    }
    return { ...report, referencesRewritten: total };
  },
});
