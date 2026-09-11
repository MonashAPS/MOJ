import { getFormatOrDefault } from "@moj/core";
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericDocument,
} from "convex/server";
import type { GenericId, Value } from "convex/values";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { insertProfileAggregates } from "./rankings";
import schema from "./schema";

const tableNames = new Set(Object.keys(schema.tables));

function assertTable(table: string): string {
  if (!tableNames.has(table)) {
    throw new Error(`unknown table ${table}; expected one of ${[...tableNames].sort().join(", ")}`);
  }
  return table;
}

/**
 * The importer addresses tables by name, so these functions use the loose
 * generic database types rather than the generated per table ones. The schema
 * still validates every document on insert.
 */
function writer(db: unknown): GenericDatabaseWriter<GenericDataModel> {
  return db as GenericDatabaseWriter<GenericDataModel>;
}

function reader(db: unknown): GenericDatabaseReader<GenericDataModel> {
  return db as GenericDatabaseReader<GenericDataModel>;
}

const idResult = v.object({
  legacyId: v.union(v.number(), v.null()),
  id: v.string(),
});

function legacyIdOf(doc: unknown): number | null {
  const value = (doc as { legacyId?: unknown }).legacyId;
  return typeof value === "number" ? value : null;
}

/** The importer sends plain JSON, which the schema validates on insert. */
function asDocument(doc: unknown): Record<string, Value> {
  return doc as Record<string, Value>;
}

/**
 * Inserts a batch of imported documents and returns the legacy id to Convex id
 * pairs, so tools/import can resolve foreign keys for the tables it imports
 * next.
 */
export const insertBatch = internalMutation({
  args: {
    table: v.string(),
    docs: v.array(v.any()),
  },
  returns: v.array(idResult),
  handler: async (ctx, args) => {
    const table = assertTable(args.table);
    const db = writer(ctx.db);
    const out: { legacyId: number | null; id: string }[] = [];
    for (const doc of args.docs) {
      const id = await db.insert(table, asDocument(doc));
      // The leaderboard aggregates have no triggers, so a straight insert has
      // to add the profile itself. `rankings.rebuildAggregates` repairs the
      // tree if an import is interrupted part way through.
      if (table === "profiles") {
        const inserted = await ctx.db.get(id as unknown as Doc<"profiles">["_id"]);
        if (inserted) await insertProfileAggregates(ctx, inserted as Doc<"profiles">);
      }
      out.push({ legacyId: legacyIdOf(doc), id });
    }
    return out;
  },
});

/** Applies deferred references such as profiles.currentParticipationId. */
export const patchBatch = internalMutation({
  args: {
    table: v.string(),
    patches: v.array(v.object({ id: v.string(), fields: v.any() })),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    assertTable(args.table);
    const db = writer(ctx.db);
    for (const patch of args.patches) {
      await db.patch(patch.id as GenericId<string>, asDocument(patch.fields));
    }
    return args.patches.length;
  },
});

/**
 * Deletes up to `limit` documents from a table. The importer calls this in a
 * loop until isDone, so a large table clears without one huge transaction.
 */
export const clearTable = internalMutation({
  args: {
    table: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({ deleted: v.number(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const table = assertTable(args.table);
    const db = writer(ctx.db);
    const limit = args.limit ?? 2000;
    const docs = await db.query(table).take(limit);
    for (const doc of docs) await db.delete(doc._id as GenericId<string>);
    return { deleted: docs.length, isDone: docs.length < limit };
  },
});

/**
 * Pages through a table's legacy id to Convex id mapping so a resumed import
 * can resolve references into tables that are already loaded.
 */
export const mapping = internalQuery({
  args: {
    table: v.string(),
    cursor: v.union(v.string(), v.null()),
    numItems: v.optional(v.number()),
  },
  returns: v.object({
    page: v.array(idResult),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const table = assertTable(args.table);
    const db = reader(ctx.db);
    const result = await db.query(table).paginate({ cursor: args.cursor, numItems: args.numItems ?? 512 });
    return {
      page: result.page.map((doc: GenericDocument) => ({
        legacyId: legacyIdOf(doc),
        id: doc._id as string,
      })),
      continueCursor: result.isDone ? null : result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/**
 * Repairs an import made before the format data rekey.
 *
 * DMOJ keys `ContestParticipation.format_data` by `ContestProblem.id`, and an
 * early import copied those numbers through verbatim, so every scoreboard cell
 * looked up a key that no longer existed. Rewrites the numeric keys to the
 * Convex ids of the contest problems with the matching `legacyId`. Idempotent:
 * a participation whose keys are already ids is left alone.
 */
export const backfillFormatDataKeys = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    rewritten: v.number(),
    droppedKeys: v.number(),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("contestParticipations")
      .paginate({ cursor: args.cursor, numItems: args.numItems ?? 200 });

    let rewritten = 0;
    let droppedKeys = 0;
    for (const participation of page.page) {
      const data = participation.formatData;
      if (data === null || typeof data !== "object" || Array.isArray(data)) continue;

      const entries = Object.entries(data as Record<string, unknown>);
      const numeric = entries.filter(([key]) => /^\d+$/.test(key));
      if (numeric.length === 0) continue;

      const next: Record<string, unknown> = {};
      for (const [key, value] of entries) {
        if (!/^\d+$/.test(key)) {
          next[key] = value;
          continue;
        }
        const contestProblem = await ctx.db
          .query("contestProblems")
          .withIndex("by_legacyId", (q) => q.eq("legacyId", Number(key)))
          .unique();
        if (contestProblem && contestProblem.contestId === participation.contestId) {
          next[contestProblem._id] = value;
        } else {
          droppedKeys++;
        }
      }
      await ctx.db.patch(participation._id, { formatData: next });
      rewritten++;
    }

    return {
      scanned: page.page.length,
      rewritten,
      droppedKeys,
      continueCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * Repairs an import made before the contest label fix.
 *
 * DMOJ has no label column: with no `problem_label_script` the format class
 * decides, and only `icpc` letters its problems while every other format
 * inherits `DefaultContestFormat.get_label_for_problem`, which is
 * `str(index + 1)`. An early import wrote `letters` for every contest. Rewrites
 * only that exact mistake: a contest still on `letters`, with no custom labels,
 * whose format would have numbered its problems.
 */
export const backfillLabelScheme = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    rewritten: v.number(),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("contests")
      .paginate({ cursor: args.cursor, numItems: args.numItems ?? 200 });

    let rewritten = 0;
    for (const contest of page.page) {
      if (contest.labelScheme !== "letters") continue;
      if (contest.customLabels.length > 0) continue;
      const scheme = getFormatOrDefault(contest.formatName).defaultLabelScheme;
      if (scheme === "letters") continue;
      await ctx.db.patch(contest._id, { labelScheme: scheme });
      rewritten++;
    }

    return {
      scanned: page.page.length,
      rewritten,
      continueCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    };
  },
});
