import { getFormatOrDefault } from "@moj/core";
import type { GenericDatabaseWriter, GenericDataModel } from "convex/server";
import type { Value } from "convex/values";
import { v } from "convex/values";
import type { Doc, TableNames } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { isJsonNumber, isJsonObject, isJsonString, type JsonObject, type JsonValue } from "./lib/json";
import { deleteProfileAggregates, insertProfileAggregates } from "./rankings";
import schema from "./schema";

const tableNames = new Set(Object.keys(schema.tables));

function isTableName(table: string): table is TableNames {
  return tableNames.has(table);
}

function assertTable(table: string): TableNames {
  if (!isTableName(table)) {
    throw new Error(`unknown table ${table}; expected one of ${[...tableNames].sort().join(", ")}`);
  }

  return table;
}

const idResult = v.object({
  legacyId: v.union(v.number(), v.null()),
  id: v.string(),
});

/**
 * The reference tables `seed.ts` also writes, and the field that identifies a
 * row in each. `npm run setup` seeds them and an import fills them from the
 * dump, so inserting blindly left a seeded site with two rows for every key:
 * the judge handshake then failed because a lookup by key was no longer
 * unique. A row whose key is already there is patched instead, and its id is
 * what the legacy id maps to, so every later table resolves to the same row.
 *
 * Extending this is one line: add the table, the field that names a row and the
 * index that covers it.
 */
const NATURAL_KEYS = new Map<TableNames, { field: string; index: string }>([
  ["languages", { field: "key", index: "by_key" }],
  ["problemTypes", { field: "name", index: "by_name" }],
  ["problemGroups", { field: "name", index: "by_name" }],
  ["licenses", { field: "key", index: "by_key" }],
  ["navigationBar", { field: "key", index: "by_key" }],
  ["miscConfig", { field: "key", index: "by_key" }],
  ["flatPages", { field: "url", index: "by_url" }],
]);

/** A `GenericDocument` is keyed by string, so `_id` arrives untyped. */
function isIdString(value: Value | undefined): value is string {
  return typeof value === "string";
}

/**
 * The id of the row this document belongs to, if the table has a natural key
 * and a row already carries it. First match, not `unique`: a deployment
 * duplicated by an earlier import must still be importable;
 * `admin/languages.dedupeByKey` and `admin/dedupe.dedupeNaturalKeys` are what
 * clear the duplicates up afterwards.
 */
async function existingIdByNaturalKey(
  db: GenericDatabaseWriter<GenericDataModel>,
  table: TableNames,
  doc: JsonValue,
): Promise<string | null> {
  const natural = NATURAL_KEYS.get(table);

  if (!natural || !isJsonObject(doc)) return null;
  const key = doc[natural.field];

  if (!isJsonString(key)) return null;

  const row = await db
    .query(table)
    .withIndex(natural.index, (q) => q.eq(natural.field, key))
    .first();

  const id = row === null ? undefined : row._id;

  return isIdString(id) ? id : null;
}

/** `legacyId` is the DMOJ primary key; a row the dump invented has none. */
function legacyIdOf(doc: JsonValue): number | null {
  if (!isJsonObject(doc)) return null;
  const value = doc.legacyId;

  return isJsonNumber(value) ? value : null;
}

/**
 * Writes a batch of imported documents and returns the legacy id to Convex id
 * pairs, so tools/import can resolve foreign keys for the tables it imports
 * next.
 *
 * A table in `NATURAL_KEYS` is upserted: the row that already carries the key
 * is patched and its id is the mapping for the legacy id. Every other table is
 * inserted, as before.
 */
export const insertBatch = internalMutation({
  args: {
    table: v.string(),
    docs: v.array(v.any()),
  },
  returns: v.array(idResult),
  handler: async (ctx, args) => {
    const table = assertTable(args.table);
    const db: GenericDatabaseWriter<GenericDataModel> = ctx.db;
    const out: { legacyId: number | null; id: string }[] = [];

    for (const doc of args.docs) {
      const existing = await existingIdByNaturalKey(db, table, doc);
      const existingId = existing === null ? null : ctx.db.normalizeId(table, existing);
      let id: string;

      if (existingId) {
        await ctx.db.patch(existingId, doc);
        id = existingId;
      } else {
        id = await db.insert(table, doc);

        // The leaderboard aggregates have no triggers, so a straight insert has
        // to add the profile itself. `rankings.rebuildAggregates` repairs the
        // tree if an import is interrupted part way through.
        if (table === "profiles") {
          const profileId = ctx.db.normalizeId("profiles", id);
          const inserted = profileId === null ? null : await ctx.db.get(profileId);

          if (inserted) await insertProfileAggregates(ctx, inserted);
        }
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
    const table = assertTable(args.table);

    for (const patch of args.patches) {
      const id = ctx.db.normalizeId(table, patch.id);

      if (id === null) throw new Error(`${patch.id} is not an id of ${table}`);
      await ctx.db.patch(id, patch.fields);
    }

    return args.patches.length;
  },
});

/**
 * Deletes up to `limit` documents from a table. The importer calls this in a
 * loop until isDone, so a large table clears without one huge transaction.
 *
 * A profile is also in three leaderboard aggregates, which are their own
 * component and are not swept by deleting the row. Clearing the table without
 * them left every cleared profile still counted: re-importing over a loaded
 * deployment doubled the leaderboard's total and gave it pages of nothing.
 */
export const clearTable = internalMutation({
  args: {
    table: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({ deleted: v.number(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const table = assertTable(args.table);
    // Fewer at a time for profiles: each one is three trees to walk as well.
    const limit = args.limit ?? (table === "profiles" ? 200 : 2000);
    const docs = await ctx.db.query(table).take(limit);

    for (const doc of docs) {
      if (table === "profiles") {
        // SAFETY: the query above read this document out of `profiles`, so it
        // is a profile; the table name is a string here only because this
        // mutation clears any of them.
        await deleteProfileAggregates(ctx, doc as Doc<"profiles">);
      }

      await ctx.db.delete(doc._id);
    }

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

    const result = await ctx.db
      .query(table)
      .paginate({ cursor: args.cursor, numItems: args.numItems ?? 512 });

    return {
      page: result.page.map((doc) => ({
        legacyId: "legacyId" in doc ? (doc.legacyId ?? null) : null,
        id: doc._id,
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

      if (!isJsonObject(data)) continue;

      const entries = Object.entries(data);
      const numeric = entries.filter(([key]) => /^\d+$/.test(key));

      if (numeric.length === 0) continue;

      const next: JsonObject = {};

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
