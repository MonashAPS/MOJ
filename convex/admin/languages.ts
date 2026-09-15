// Staff console: languages. judge/models/runtime.py:19 and DMOJ's
// `copy_language` management command.

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, query } from "../_generated/server";
import { requirePerm, requireSuperuser } from "../lib/auth";
import { writeRevision } from "../lib/community";
import {
  type Budget,
  DEDUPE_PAGE,
  type DedupeReport,
  type DedupeState,
  dedupeReportValidator,
  newBudget,
  nextPage,
} from "../lib/dedupe";
import { invalid, notFound } from "../lib/errors";

const LANGUAGE_PERM = "judge.change_language";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePerm(ctx, LANGUAGE_PERM);

    const [languages, problems] = await Promise.all([
      ctx.db.query("languages").collect(),
      ctx.db.query("problems").collect(),
    ]);

    languages.sort((a, b) => a.key.localeCompare(b.key));

    return languages.map((row) => ({
      ...row,
      problemCount: problems.filter((problem) => problem.allowedLanguageIds.includes(row._id)).length,
    }));
  },
});

export const get = query({
  args: { id: v.id("languages") },
  handler: async (ctx, { id }) => {
    await requirePerm(ctx, LANGUAGE_PERM);

    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    key: v.string(),
    name: v.string(),
    shortName: v.optional(v.string()),
    commonName: v.string(),
    editorMode: v.string(),
    shikiLang: v.string(),
    template: v.optional(v.string()),
    info: v.optional(v.string()),
    description: v.optional(v.string()),
    extension: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"languages">> => {
    const editor = await requirePerm(ctx, LANGUAGE_PERM);

    const key = args.key.trim();

    if (key.length === 0) throw invalid("A language needs a short identifier.");

    if (key.length > 6) throw invalid("Short identifiers are limited to 6 characters.");

    const clash = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    if (clash) throw invalid(`A language with the identifier ${key} already exists.`);

    const id = await ctx.db.insert("languages", {
      key,
      name: args.name,
      shortName: args.shortName ?? "",
      commonName: args.commonName,
      editorMode: args.editorMode,
      shikiLang: args.shikiLang,
      template: args.template ?? "",
      info: args.info ?? "",
      description: args.description ?? "",
      extension: args.extension,
    });

    await writeRevision(
      ctx,
      "language",
      id,
      await ctx.db.get(id),
      editor._id,
      args.reason ?? "Created language",
    );

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("languages"),
    key: v.optional(v.string()),
    name: v.optional(v.string()),
    shortName: v.optional(v.string()),
    commonName: v.optional(v.string()),
    editorMode: v.optional(v.string()),
    shikiLang: v.optional(v.string()),
    template: v.optional(v.string()),
    info: v.optional(v.string()),
    description: v.optional(v.string()),
    extension: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const editor = await requirePerm(ctx, LANGUAGE_PERM);
    const row = await ctx.db.get(args.id);

    if (!row) throw notFound("Language");

    const patch: Partial<Doc<"languages">> = {};

    if (args.key !== undefined) {
      const key = args.key.trim();

      if (key.length === 0) throw invalid("A language needs a short identifier.");

      if (key !== row.key) {
        const clash = await ctx.db
          .query("languages")
          .withIndex("by_key", (q) => q.eq("key", key))
          .first();

        if (clash) throw invalid(`A language with the identifier ${key} already exists.`);
      }

      patch.key = key;
    }

    if (args.name !== undefined) patch.name = args.name;

    if (args.shortName !== undefined) patch.shortName = args.shortName;

    if (args.commonName !== undefined) patch.commonName = args.commonName;

    if (args.editorMode !== undefined) patch.editorMode = args.editorMode;

    if (args.shikiLang !== undefined) patch.shikiLang = args.shikiLang;

    if (args.template !== undefined) patch.template = args.template;

    if (args.info !== undefined) patch.info = args.info;

    if (args.description !== undefined) patch.description = args.description;

    if (args.extension !== undefined) patch.extension = args.extension;

    await writeRevision(ctx, "language", args.id, row, editor._id, args.reason ?? "Edited language");
    await ctx.db.patch(args.id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("languages"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const editor = await requirePerm(ctx, LANGUAGE_PERM);
    const row = await ctx.db.get(id);

    if (!row) throw notFound("Language");

    const submission = await ctx.db
      .query("submissions")
      .withIndex("by_language_date", (q) => q.eq("languageId", id))
      .first();

    if (submission) throw invalid("That language has submissions and cannot be deleted.");

    const problems = await ctx.db.query("problems").collect();

    for (const problem of problems) {
      if (!problem.allowedLanguageIds.includes(id)) continue;
      await ctx.db.patch(problem._id, {
        allowedLanguageIds: problem.allowedLanguageIds.filter((entry) => entry !== id),
      });
    }

    const limits = await ctx.db.query("languageLimits").collect();

    for (const limit of limits) {
      if (limit.languageId === id) await ctx.db.delete(limit._id);
    }

    const versions = await ctx.db
      .query("runtimeVersions")
      .withIndex("by_language", (q) => q.eq("languageId", id))
      .collect();

    for (const version of versions) await ctx.db.delete(version._id);

    await writeRevision(ctx, "language", id, row, editor._id, reason ?? "Deleted language");
    await ctx.db.delete(id);
  },
});

/**
 * `copy_language` (judge/management/commands/copy_language.py): every problem
 * that allows `source` also allows `target`, and the per-language limits come
 * along with it.
 */
export const copyLanguage = mutation({
  args: { sourceKey: v.string(), targetKey: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { sourceKey, targetKey, reason }) => {
    const editor = await requirePerm(ctx, LANGUAGE_PERM);

    const source = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", sourceKey))
      .first();

    if (!source) throw invalid(`Invalid source language: ${sourceKey}`);

    const target = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", targetKey))
      .first();

    if (!target) throw invalid(`Invalid target language: ${targetKey}`);

    if (source._id === target._id) throw invalid("Pick two different languages.");

    const problems = await ctx.db.query("problems").collect();
    let allowed = 0;

    for (const problem of problems) {
      const hasSource = problem.allowedLanguageIds.includes(source._id);
      const hasTarget = problem.allowedLanguageIds.includes(target._id);

      if (hasSource && !hasTarget) {
        await ctx.db.patch(problem._id, {
          allowedLanguageIds: [...problem.allowedLanguageIds, target._id],
        });
        allowed += 1;
      } else if (!hasSource && hasTarget) {
        // `target.problem_set.set(source.problem_set.all())` replaces the set.
        await ctx.db.patch(problem._id, {
          allowedLanguageIds: problem.allowedLanguageIds.filter((entry) => entry !== target._id),
        });
      }
    }

    const limits = await ctx.db.query("languageLimits").collect();
    let copied = 0;

    for (const limit of limits) {
      if (limit.languageId !== source._id) continue;

      const existing = limits.find(
        (row) => row.problemId === limit.problemId && row.languageId === target._id,
      );

      if (existing) continue;
      await ctx.db.insert("languageLimits", {
        problemId: limit.problemId,
        languageId: target._id,
        timeLimit: limit.timeLimit,
        memoryLimit: limit.memoryLimit,
      });
      copied += 1;
    }

    await writeRevision(
      ctx,
      "language",
      target._id,
      { copiedFrom: source.key, problems: allowed, limits: copied },
      editor._id,
      reason ?? `Copied ${source.key} to ${target.key}`,
    );

    return { problems: allowed, limits: copied };
  },
});

/* -------------------------------------------------------------------------- */
/* Duplicate repair                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `npm run setup` seeds the language table and an older `npm run import`
 * inserted the dump's languages on top of it, so a deployment that was seeded
 * and then imported holds two rows for every key. A lookup by key stopped being
 * unique, which is what failed the judge handshake with a 400. The importer
 * upserts by key now; this repairs the deployments loaded before it did.
 *
 * The survivor is the row carrying a `legacyId`, because that is the one the
 * imported submissions point at, and the oldest row otherwise. Every reference
 * to the losers is repointed before they are deleted.
 *
 * The work is bounded: one pass rewrites up to `DEDUPE_WRITE_BUDGET` rows and
 * reads up to `DEDUPE_READ_BUDGET` documents, then schedules the next pass, the
 * way convex/jobs.ts chains a job. Re-running it once it is done is a no-op.
 */

/** What the revisions read when nobody said why. */
const DEDUPE_REASON = "Merged duplicate languages by key";

/**
 * Every table in convex/schema.ts with a field that names a language, in the
 * order the repair walks them: `submissions.languageId`,
 * `runtimeVersions.languageId`, `languageLimits.languageId`,
 * `profiles.languageId` and `problems.allowedLanguageIds`.
 */
const DEDUPE_TABLES = ["submissions", "runtimeVersions", "languageLimits", "profiles", "problems"] as const;

type DedupeTable = (typeof DEDUPE_TABLES)[number];

const dedupeTableValidator = v.union(
  v.literal("submissions"),
  v.literal("runtimeVersions"),
  v.literal("languageLimits"),
  v.literal("profiles"),
  v.literal("problems"),
);

type SurvivorMap = Map<Id<"languages">, Id<"languages">>;

/**
 * Picks a survivor per duplicated key. Deterministic, so every pass of a
 * chained repair agrees on which row is being kept.
 */
function planDuplicates(rows: Doc<"languages">[]): { keys: string[]; survivorOf: SurvivorMap } {
  const byKey = new Map<string, Doc<"languages">[]>();

  for (const row of rows) {
    const group = byKey.get(row.key);

    if (group) group.push(row);
    else byKey.set(row.key, [row]);
  }

  const keys: string[] = [];
  const survivorOf: SurvivorMap = new Map();

  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    keys.push(key);

    const ranked = [...group].sort((a, b) => {
      // The imported row wins: the submissions point at it.
      const aImported = a.legacyId === undefined ? 1 : 0;
      const bImported = b.legacyId === undefined ? 1 : 0;

      if (aImported !== bImported) return aImported - bImported;

      if (a._creationTime !== b._creationTime) return a._creationTime - b._creationTime;

      return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
    });

    const survivor = ranked[0] as Doc<"languages">;

    for (const loser of ranked.slice(1)) survivorOf.set(loser._id, survivor._id);
  }

  keys.sort();

  return { keys, survivorOf };
}

/**
 * One page of a table that has no index on its language reference, walked by
 * `_creationTime`, which Convex keeps unique within a table.
 */
async function scanPage(
  ctx: MutationCtx,
  table: "languageLimits",
  cursor: number | null,
): Promise<Doc<"languageLimits">[]>;
async function scanPage(
  ctx: MutationCtx,
  table: "profiles",
  cursor: number | null,
): Promise<Doc<"profiles">[]>;
async function scanPage(
  ctx: MutationCtx,
  table: "problems",
  cursor: number | null,
): Promise<Doc<"problems">[]>;
async function scanPage(
  ctx: MutationCtx,
  table: "languageLimits" | "profiles" | "problems",
  cursor: number | null,
): Promise<{ _creationTime: number }[]> {
  const query = ctx.db.query(table);

  return await (cursor === null
    ? query.withIndex("by_creation_time")
    : query.withIndex("by_creation_time", (q) => q.gt("_creationTime", cursor))
  ).take(DEDUPE_PAGE);
}

/**
 * One page of one table. `submissions` and `runtimeVersions` are drained
 * through their index on `languageId`, so a repointed row leaves the range and
 * the next page is the remainder; the three tables with no such index are
 * scanned with a cursor.
 */
async function rewriteTablePage(
  ctx: MutationCtx,
  table: DedupeTable,
  survivorOf: SurvivorMap,
  cursor: number | null,
  budget: Budget,
): Promise<{ rewritten: number; cursor: number | null; isDone: boolean }> {
  if (table === "submissions" || table === "runtimeVersions") {
    for (const [loser, survivor] of survivorOf) {
      const rows =
        table === "submissions"
          ? await ctx.db
              .query("submissions")
              .withIndex("by_language_date", (q) => q.eq("languageId", loser))
              .take(DEDUPE_PAGE)
          : await ctx.db
              .query("runtimeVersions")
              .withIndex("by_language", (q) => q.eq("languageId", loser))
              .take(DEDUPE_PAGE);

      budget.reads -= Math.max(rows.length, 1);

      if (rows.length === 0) continue;

      for (const row of rows) await ctx.db.patch(row._id, { languageId: survivor });
      budget.writes -= rows.length;

      return { rewritten: rows.length, cursor: null, isDone: false };
    }

    return { rewritten: 0, cursor: null, isDone: true };
  }

  if (table === "languageLimits") {
    const rows = await scanPage(ctx, "languageLimits", cursor);
    budget.reads -= Math.max(rows.length, 1);
    let rewritten = 0;

    for (const row of rows) {
      const survivor = survivorOf.get(row.languageId);

      if (!survivor) continue;

      // Repointing must not leave a problem with two limits for one language.
      const siblings = await ctx.db
        .query("languageLimits")
        .withIndex("by_problem", (q) => q.eq("problemId", row.problemId))
        .collect();

      budget.reads -= Math.max(siblings.length, 1);
      const clash = siblings.some((other) => other._id !== row._id && other.languageId === survivor);

      if (clash) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { languageId: survivor });
      rewritten += 1;
    }

    budget.writes -= rewritten;

    return { rewritten, ...nextPage(rows) };
  }

  if (table === "profiles") {
    const rows = await scanPage(ctx, "profiles", cursor);
    budget.reads -= Math.max(rows.length, 1);
    let rewritten = 0;

    for (const row of rows) {
      if (row.languageId === undefined) continue;
      const survivor = survivorOf.get(row.languageId);

      if (!survivor) continue;
      await ctx.db.patch(row._id, { languageId: survivor });
      rewritten += 1;
    }

    budget.writes -= rewritten;

    return { rewritten, ...nextPage(rows) };
  }

  const rows = await scanPage(ctx, "problems", cursor);
  budget.reads -= Math.max(rows.length, 1);
  let rewritten = 0;

  for (const row of rows) {
    if (!row.allowedLanguageIds.some((id) => survivorOf.has(id))) continue;
    const next: Id<"languages">[] = [];

    for (const id of row.allowedLanguageIds) {
      const mapped = survivorOf.get(id) ?? id;

      if (!next.includes(mapped)) next.push(mapped);
    }

    await ctx.db.patch(row._id, { allowedLanguageIds: next });
    rewritten += 1;
  }

  budget.writes -= rewritten;

  return { rewritten, ...nextPage(rows) };
}

/** Walks the reference tables from `from` until the budget runs out. */
async function rewriteReferences(
  ctx: MutationCtx,
  survivorOf: SurvivorMap,
  from: DedupeState<DedupeTable>,
  budget: Budget,
): Promise<{ rewritten: number; next: DedupeState<DedupeTable> | null }> {
  const start = Math.max(DEDUPE_TABLES.indexOf(from.table), 0);
  let rewritten = 0;

  for (let i = start; i < DEDUPE_TABLES.length; i++) {
    const table = DEDUPE_TABLES[i] as DedupeTable;
    let cursor = i === start ? from.cursor : null;

    for (;;) {
      if (budget.reads <= 0 || budget.writes <= 0) return { rewritten, next: { table, cursor } };
      const step = await rewriteTablePage(ctx, table, survivorOf, cursor, budget);
      rewritten += step.rewritten;

      if (step.isDone) break;
      cursor = step.cursor;
    }
  }

  return { rewritten, next: null };
}

/**
 * One bounded pass. Recomputes the plan from the table every time, which is
 * what makes a resumed or repeated run safe: the losers are only deleted once
 * nothing points at them any more.
 */
async function dedupePass(
  ctx: MutationCtx,
  from: DedupeState<DedupeTable>,
  editorProfileId: Id<"profiles"> | undefined,
  reason: string,
): Promise<{ report: DedupeReport; next: DedupeState<DedupeTable> | null }> {
  const rows = await ctx.db.query("languages").collect();
  const { keys, survivorOf } = planDuplicates(rows);

  if (keys.length === 0) {
    return {
      report: { keys: [], keysRepaired: 0, rowsDeleted: 0, referencesRewritten: 0, isDone: true },
      next: null,
    };
  }

  const budget = newBudget();
  const { rewritten, next } = await rewriteReferences(ctx, survivorOf, from, budget);

  if (next) {
    return {
      report: { keys, keysRepaired: 0, rowsDeleted: 0, referencesRewritten: rewritten, isDone: false },
      next,
    };
  }

  const byId = new Map(rows.map((row) => [row._id, row]));
  let deleted = 0;

  for (const [loser, survivor] of survivorOf) {
    const row = byId.get(loser);

    if (!row) continue;
    await writeRevision(ctx, "language", survivor, { mergedFrom: row }, editorProfileId, reason);
    await ctx.db.delete(loser);
    deleted += 1;
  }

  return {
    report: {
      keys,
      keysRepaired: keys.length,
      rowsDeleted: deleted,
      referencesRewritten: rewritten,
      isDone: true,
    },
    next: null,
  };
}

/**
 * Merges the duplicate language rows a pre-upsert import left behind.
 *
 * Superuser only: it rewrites submissions and deletes rows, which is more than
 * `judge.change_language` is meant to buy. Safe to run twice; `isDone` false
 * means a follow-up pass has been scheduled and is finishing the job.
 */
export const dedupeByKey = mutation({
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
      await ctx.scheduler.runAfter(0, internal.admin.languages.dedupeByKeyStep, {
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
 * The scheduled continuation of `dedupeByKey`, one bounded pass per step.
 *
 * Also the way to start the repair from the command line, where there is no
 * signed in superuser for `dedupeByKey` to check: every argument defaults, so
 * `npx convex run admin/languages:dedupeByKeyStep '{}'` runs the whole thing.
 */
export const dedupeByKeyStep = internalMutation({
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
      await ctx.scheduler.runAfter(0, internal.admin.languages.dedupeByKeyStep, {
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
