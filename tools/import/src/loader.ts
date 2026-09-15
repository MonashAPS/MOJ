import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { makeFunctionReference } from "convex/server";
import { isJsonNumber, isJsonObject, type JsonValue, parseJson } from "./json.ts";

/** A field of a document bound for Convex: any JSON value, or absent. */
type DocValue = JsonValue | undefined;

/** One document for a Convex table. `legacyId` carries the DMOJ primary key it came from. */
export interface ImportDoc {
  legacyId?: number;
  [field: string]: DocValue;
}

export interface DocPatch {
  id: string;
  fields: ImportDoc;
}

export interface InsertedId {
  legacyId: number | null;
  id: string;
}

export interface ClearResult {
  deleted: number;
  isDone: boolean;
}

export interface MappingPage {
  page: InsertedId[];
  continueCursor: string | null;
  isDone: boolean;
}

export interface Loader {
  readonly name: string;
  insert(table: string, docs: ImportDoc[]): Promise<InsertedId[]>;
  patch(table: string, patches: DocPatch[]): Promise<number>;
  clear(table: string): Promise<number>;
  mapping(table: string): Promise<InsertedId[]>;
}

const insertBatchRef = makeFunctionReference<"mutation", { table: string; docs: ImportDoc[] }, InsertedId[]>(
  "importer:insertBatch",
);

const patchBatchRef = makeFunctionReference<"mutation", { table: string; patches: DocPatch[] }, number>(
  "importer:patchBatch",
);

const clearTableRef = makeFunctionReference<"mutation", { table: string; limit?: number }, ClearResult>(
  "importer:clearTable",
);

const mappingRef = makeFunctionReference<
  "query",
  { table: string; cursor: string | null; numItems?: number },
  MappingPage
>("importer:mapping");

/**
 * The part of ConvexHttpClient the loader uses. Every call carries the argument
 * and return types its function reference declares, so a response never has to
 * be narrowed by hand.
 */
export interface ConvexClientLike {
  mutation<Mutation extends FunctionReference<"mutation">>(
    reference: Mutation,
    args: FunctionArgs<Mutation>,
  ): Promise<FunctionReturnType<Mutation>>;
  query<Query extends FunctionReference<"query">>(
    reference: Query,
    args: FunctionArgs<Query>,
  ): Promise<FunctionReturnType<Query>>;
}

/**
 * Writes into a self-hosted Convex deployment through the admin key. Every
 * call goes to convex/importer.ts, which validates the table name against the
 * schema before touching the database.
 */
export class ConvexLoader implements Loader {
  readonly name = "convex";

  constructor(
    private readonly client: ConvexClientLike,
    private readonly retries = 8,
  ) {}

  /**
   * A self hosted deployment caps how much can be written per second, and a
   * batch that trips the cap comes back as TooManyWrites. Back off and retry:
   * the batch is a single transaction, so nothing was written.
   */
  private async withRetry<T>(what: string, run: () => Promise<T>): Promise<T> {
    let wait = 250;

    for (let attempt = 0; ; attempt++) {
      try {
        return await run();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);

        const transient =
          message.includes("TooManyWrites") ||
          message.includes("Too many writes") ||
          message.includes("TooManyReads") ||
          message.includes("OptimisticConcurrencyControlFailure") ||
          message.includes("Transient") ||
          message.includes("ECONNRESET") ||
          message.includes("fetch failed");

        if (!transient || attempt >= this.retries) throw cause;
        process.stderr.write(`  ${what}: ${message.split("\n")[0]}, retrying in ${wait}ms\n`);
        await new Promise((resolve) => setTimeout(resolve, wait));
        wait = Math.min(wait * 2, 8000);
      }
    }
  }

  static fromAdminKey(url: string, adminKey: string): ConvexLoader {
    // SAFETY: setAdminAuth is how the self-hosted admin key reaches internal
    // functions. It exists on the client but is not part of its published
    // typings, so the intersection only names a method that is already there.
    const client = new ConvexHttpClient(url) as ConvexHttpClient & {
      setAdminAuth(key: string): void;
    };

    client.setAdminAuth(adminKey);

    return new ConvexLoader(client);
  }

  async insert(table: string, docs: ImportDoc[]): Promise<InsertedId[]> {
    return await this.withRetry(
      `insert ${table}`,
      async () => await this.client.mutation(insertBatchRef, { table, docs }),
    );
  }

  async patch(table: string, patches: DocPatch[]): Promise<number> {
    return await this.withRetry(
      `patch ${table}`,
      async () => await this.client.mutation(patchBatchRef, { table, patches }),
    );
  }

  async clear(table: string): Promise<number> {
    let deleted = 0;

    for (;;) {
      const result = await this.withRetry(
        `clear ${table}`,
        async () => await this.client.mutation(clearTableRef, { table, limit: 2000 }),
      );

      deleted += result.deleted;

      if (result.isDone) return deleted;
    }
  }

  async mapping(table: string): Promise<InsertedId[]> {
    const out: InsertedId[] = [];
    let cursor: string | null = null;

    for (;;) {
      const page = await this.withRetry(
        `mapping ${table}`,
        async () => await this.client.query(mappingRef, { table, cursor, numItems: 512 }),
      );

      out.push(...page.page);

      if (page.isDone || !page.continueCursor) return out;
      cursor = page.continueCursor;
    }
  }
}

/** The legacy id a written document carries, or null when it never had one. */
function docLegacyId(line: string): number | null {
  const parsed = parseJson(line);

  if (!isJsonObject(parsed)) return null;
  const legacyId = parsed.legacyId;

  return isJsonNumber(legacyId) ? legacyId : null;
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
      const legacyId = doc.legacyId ?? null;
      out.push({ legacyId, id: DryRunLoader.fakeId(table, legacyId, ordinal) });
      ordinal++;
    }

    this.inserted.set(table, ordinal);

    return out;
  }

  async patch(table: string, patches: DocPatch[]): Promise<number> {
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
    const stream = createReadStream(file, { encoding: "utf8" });
    const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

    for await (const line of lines) {
      if (line.trim() === "") continue;
      const legacyId = docLegacyId(line);
      out.push({ legacyId, id: DryRunLoader.fakeId(table, legacyId, ordinal) });
      ordinal++;
    }

    this.inserted.set(table, ordinal);

    return out;
  }
}
