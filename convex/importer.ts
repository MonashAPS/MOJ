import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericDocument,
} from "convex/server";
import type { GenericId, Value } from "convex/values";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
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
