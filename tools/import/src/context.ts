import { once } from "node:events";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";
import type { ExtractManifest } from "./extract.ts";
import { rawPath } from "./extract.ts";
import type { ImportDoc, Loader } from "./loader.ts";
import { loadRows, type Row, readRows } from "./rows.ts";

export const BATCH_SIZE = 200;

export interface SkipEntry {
  table: string;
  reason: string;
  count: number;
  samples: number[];
}

export interface UnresolvedEntry {
  from: string;
  field: string;
  target: string;
  count: number;
  samples: number[];
}

export interface TableCounts {
  sources: string[];
  read: number;
  written: number;
  skipped: number;
}

export class Report {
  readonly tables = new Map<string, TableCounts>();
  readonly skips = new Map<string, SkipEntry>();
  readonly warnings = new Map<string, SkipEntry>();
  readonly unresolved = new Map<string, UnresolvedEntry>();
  readonly notes: string[] = [];
  readonly columnUsage = new Map<string, Set<string>>();

  counts(table: string): TableCounts {
    let entry = this.tables.get(table);

    if (!entry) {
      entry = { sources: [], read: 0, written: 0, skipped: 0 };
      this.tables.set(table, entry);
    }

    return entry;
  }

  usage(mysqlTable: string): Set<string> {
    let set = this.columnUsage.get(mysqlTable);

    if (!set) {
      set = new Set<string>();
      this.columnUsage.set(mysqlTable, set);
    }

    return set;
  }

  skip(table: string, reason: string, legacyId: number | null): void {
    const key = `${table}\u0000${reason}`;
    let entry = this.skips.get(key);

    if (!entry) {
      entry = { table, reason, count: 0, samples: [] };
      this.skips.set(key, entry);
    }

    entry.count++;

    if (legacyId !== null && entry.samples.length < 5) entry.samples.push(legacyId);
    this.counts(table).skipped++;
  }

  /** A row that was still imported, but with a field degraded or dropped. */
  warn(table: string, reason: string, legacyId: number | null): void {
    const key = `${table} ${reason}`;
    let entry = this.warnings.get(key);

    if (!entry) {
      entry = { table, reason, count: 0, samples: [] };
      this.warnings.set(key, entry);
    }

    entry.count++;

    if (legacyId !== null && entry.samples.length < 5) entry.samples.push(legacyId);
  }

  unresolvedRef(from: string, field: string, target: string, legacyId: number | null): void {
    const key = `${from}\u0000${field}\u0000${target}`;
    let entry = this.unresolved.get(key);

    if (!entry) {
      entry = { from, field, target, count: 0, samples: [] };
      this.unresolved.set(key, entry);
    }

    entry.count++;

    if (legacyId !== null && entry.samples.length < 5) entry.samples.push(legacyId);
  }

  note(text: string): void {
    if (!this.notes.includes(text)) this.notes.push(text);
  }
}

export class IdMap {
  private readonly maps = new Map<string, Map<number, string>>();

  private table(table: string): Map<number, string> {
    let map = this.maps.get(table);

    if (!map) {
      map = new Map<number, string>();
      this.maps.set(table, map);
    }

    return map;
  }

  set(table: string, legacyId: number, id: string): void {
    this.table(table).set(legacyId, id);
  }

  get(table: string, legacyId: number): string | undefined {
    return this.maps.get(table)?.get(legacyId);
  }

  has(table: string, legacyId: number): boolean {
    return this.maps.get(table)?.has(legacyId) ?? false;
  }

  size(table: string): number {
    return this.maps.get(table)?.size ?? 0;
  }
}

class JsonlWriter {
  private stream: WriteStream | null = null;

  constructor(private readonly file: string | null) {}

  async write(line: string): Promise<void> {
    if (!this.file) return;

    if (!this.stream) {
      mkdirSync(path.dirname(this.file), { recursive: true });
      this.stream = createWriteStream(this.file, { encoding: "utf8" });
    }

    if (!this.stream.write(line)) await once(this.stream, "drain");
  }

  async close(): Promise<void> {
    if (!this.stream) return;
    this.stream.end();
    await once(this.stream, "close");
    this.stream = null;
  }
}

/**
 * Buffers documents for one Convex table, writes them to JSONL and pushes them
 * through the loader in batches, recording the legacy id to Convex id mapping
 * as it goes.
 */
export class TableEmitter {
  private batch: ImportDoc[] = [];
  private pending = new Set<number>();
  private readonly writer: JsonlWriter;
  private buffered = "";

  constructor(
    private readonly ctx: ImportContext,
    readonly table: string,
    docsFile: string | null,
  ) {
    this.writer = new JsonlWriter(docsFile);
  }

  isPending(legacyId: number): boolean {
    return this.pending.has(legacyId);
  }

  async emit(doc: ImportDoc): Promise<void> {
    this.batch.push(doc);

    if (doc.legacyId !== undefined) this.pending.add(doc.legacyId);
    this.buffered += `${JSON.stringify(doc)}\n`;

    if (this.buffered.length > 1 << 20) {
      const text = this.buffered;
      this.buffered = "";
      await this.writer.write(text);
    }

    if (this.batch.length >= BATCH_SIZE) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.batch.length === 0) return;
    const docs = this.batch;
    this.batch = [];
    this.pending.clear();
    const inserted = await this.ctx.loader.insert(this.table, docs);

    for (const entry of inserted) {
      if (entry.legacyId !== null) this.ctx.ids.set(this.table, entry.legacyId, entry.id);
    }

    this.ctx.report.counts(this.table).written += docs.length;
  }

  async close(): Promise<void> {
    await this.flush();

    if (this.buffered.length > 0) {
      const text = this.buffered;
      this.buffered = "";
      await this.writer.write(text);
    }

    await this.writer.close();
  }
}

export interface ImportOptions {
  outDir: string;
  dryRun: boolean;
  tables?: Set<string>;
  clear: boolean;
}

export class ImportContext {
  readonly ids = new IdMap();
  readonly report = new Report();
  private readonly emitters = new Map<string, TableEmitter>();

  constructor(
    readonly manifest: ExtractManifest,
    readonly loader: Loader,
    readonly options: ImportOptions,
  ) {}

  docsDir(): string {
    return path.join(this.options.outDir, "docs");
  }

  selected(table: string): boolean {
    return !this.options.tables || this.options.tables.has(table);
  }

  rows(mysqlTable: string): AsyncGenerator<Row> {
    this.report.usage(mysqlTable);

    return readRows(rawPath(this.options.outDir, mysqlTable), this.report.usage(mysqlTable));
  }

  async all(mysqlTable: string): Promise<Row[]> {
    return await loadRows(rawPath(this.options.outDir, mysqlTable), this.report.usage(mysqlTable));
  }

  emitter(table: string): TableEmitter {
    let emitter = this.emitters.get(table);

    if (!emitter) {
      emitter = new TableEmitter(this, table, path.join(this.docsDir(), `${table}.jsonl`));
      this.emitters.set(table, emitter);
    }

    return emitter;
  }

  async closeEmitter(table: string): Promise<void> {
    const emitter = this.emitters.get(table);

    if (!emitter) return;
    await emitter.close();
    this.emitters.delete(table);
  }

  async closeEmitters(): Promise<void> {
    for (const emitter of this.emitters.values()) await emitter.close();
    this.emitters.clear();
  }

  /** Resolves a legacy foreign key to a Convex id, recording misses. */
  ref(
    target: string,
    legacyId: number | null | undefined,
    from: string,
    field: string,
    rowId: number | null = null,
  ): string | undefined {
    if (legacyId === null || legacyId === undefined) return undefined;
    const id = this.ids.get(target, legacyId);

    if (id === undefined) this.report.unresolvedRef(from, field, target, rowId);

    return id;
  }

  refs(
    target: string,
    legacyIds: number[] | undefined,
    from: string,
    field: string,
    rowId: number | null = null,
  ): string[] {
    if (!legacyIds) return [];
    const out: string[] = [];

    for (const legacyId of legacyIds) {
      const id = this.ref(target, legacyId, from, field, rowId);

      if (id !== undefined) out.push(id);
    }

    return out;
  }
}

export async function groupM2M(
  ctx: ImportContext,
  mysqlTable: string,
  keyColumn: string,
  valueColumn: string,
  orderColumn?: string,
): Promise<Map<number, number[]>> {
  const grouped = new Map<number, { value: number; order: number }[]>();

  for await (const row of ctx.rows(mysqlTable)) {
    const key = row.n(keyColumn);
    const value = row.n(valueColumn);
    const order = orderColumn ? row.n(orderColumn) : row.id();
    const list = grouped.get(key);

    if (list) list.push({ value, order });
    else grouped.set(key, [{ value, order }]);
  }

  const out = new Map<number, number[]>();

  for (const [key, list] of grouped) {
    list.sort((a, b) => a.order - b.order);
    out.set(
      key,
      list.map((entry) => entry.value),
    );
  }

  return out;
}
