import { existsSync } from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { readRows } from "./rows.ts";

export type ImportDoc = Record<string, unknown>;

export interface InsertedId {
  legacyId: number | null;
  id: string;
}

export interface Loader {
  readonly name: string;
  insert(table: string, docs: ImportDoc[]): Promise<InsertedId[]>;
  patch(table: string, patches: { id: string; fields: ImportDoc }[]): Promise<number>;
  clear(table: string): Promise<number>;
  mapping(table: string): Promise<InsertedId[]>;
}

const insertBatchRef = makeFunctionReference<"mutation", { table: string; docs: ImportDoc[] }, InsertedId[]>(
  "importer:insertBatch",
);

const patchBatchRef = makeFunctionReference<
  "mutation",
  { table: string; patches: { id: string; fields: ImportDoc }[] },
  number
>("importer:patchBatch");

const clearTableRef = makeFunctionReference<
  "mutation",
  { table: string; limit?: number },
  { deleted: number; isDone: boolean }
>("importer:clearTable");

const mappingRef = makeFunctionReference<
  "query",
  { table: string; cursor: string | null; numItems?: number },
  { page: InsertedId[]; continueCursor: string | null; isDone: boolean }
>("importer:mapping");

export interface ConvexClientLike {
  mutation(reference: unknown, args: unknown): Promise<unknown>;
  query(reference: unknown, args: unknown): Promise<unknown>;
}

/**
 * Writes into a self-hosted Convex deployment through the admin key. Every
 * call goes to convex/importer.ts, which validates the table name against the
 * schema before touching the database.
 */
export class ConvexLoader implements Loader {
  readonly name = "convex";

  constructor(private readonly client: ConvexClientLike) {}

  static fromAdminKey(url: string, adminKey: string): ConvexLoader {
    // setAdminAuth is how the self-hosted admin key reaches internal functions.
    // It exists on the client but is not part of its published typings.
    const client = new ConvexHttpClient(url) as ConvexHttpClient & {
      setAdminAuth(key: string): void;
    };
    client.setAdminAuth(adminKey);
    return new ConvexLoader(client as unknown as ConvexClientLike);
  }

  async insert(table: string, docs: ImportDoc[]): Promise<InsertedId[]> {
    return (await this.client.mutation(insertBatchRef, { table, docs })) as InsertedId[];
  }

  async patch(table: string, patches: { id: string; fields: ImportDoc }[]): Promise<number> {
    return (await this.client.mutation(patchBatchRef, { table, patches })) as number;
  }

  async clear(table: string): Promise<number> {
    let deleted = 0;
    for (;;) {
      const result = (await this.client.mutation(clearTableRef, { table, limit: 2000 })) as {
        deleted: number;
        isDone: boolean;
      };
      deleted += result.deleted;
      if (result.isDone) return deleted;
    }
  }

  async mapping(table: string): Promise<InsertedId[]> {
    const out: InsertedId[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page = (await this.client.query(mappingRef, { table, cursor, numItems: 512 })) as {
        page: InsertedId[];
        continueCursor: string | null;
        isDone: boolean;
      };
      out.push(...page.page);
      if (page.isDone || !page.continueCursor) return out;
      cursor = page.continueCursor;
    }
  }
}

/**
 * Used by --dry-run and by the unit tests. Ids are deterministic so that a
 * resumed dry run rebuilds exactly the same references.
 */
export class DryRunLoader implements Loader {
  readonly name = "dry-run";
  readonly inserted = new Map<string, number>();
  readonly patched = new Map<string, number>();
  readonly cleared: string[] = [];

  constructor(private readonly docsDir?: string) {}

  static fakeId(table: string, legacyId: number | null, ordinal: number): string {
    return legacyId === null ? `dry_${table}_x${ordinal}` : `dry_${table}_${legacyId}`;
  }

  async insert(table: string, docs: ImportDoc[]): Promise<InsertedId[]> {
    let ordinal = this.inserted.get(table) ?? 0;
    const out: InsertedId[] = [];
    for (const doc of docs) {
      const legacyId = typeof doc.legacyId === "number" ? doc.legacyId : null;
      out.push({ legacyId, id: DryRunLoader.fakeId(table, legacyId, ordinal) });
      ordinal++;
    }
    this.inserted.set(table, ordinal);
    return out;
  }

  async patch(table: string, patches: { id: string; fields: ImportDoc }[]): Promise<number> {
    this.patched.set(table, (this.patched.get(table) ?? 0) + patches.length);
    return patches.length;
  }

  async clear(table: string): Promise<number> {
    this.cleared.push(table);
    this.inserted.set(table, 0);
    return 0;
  }

  async mapping(table: string): Promise<InsertedId[]> {
    if (!this.docsDir) return [];
    const file = path.join(this.docsDir, `${table}.jsonl`);
    if (!existsSync(file)) return [];
    const out: InsertedId[] = [];
    let ordinal = 0;
    const seen = new Set<string>();
    for await (const row of readRows(file, seen)) {
      const legacyId = typeof row.data.legacyId === "number" ? (row.data.legacyId as number) : null;
      out.push({ legacyId, id: DryRunLoader.fakeId(table, legacyId, ordinal) });
      ordinal++;
    }
    this.inserted.set(table, ordinal);
    return out;
  }
}
