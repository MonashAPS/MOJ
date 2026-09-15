import { once } from "node:events";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isJsonArray, isJsonNumber, isJsonObject, isJsonText, type JsonValue, parseJson } from "./json.ts";
import type { ColumnDef } from "./parser/dump.ts";
import { readDump } from "./parser/dump.ts";
import type { SqlValue } from "./parser/values.ts";

interface ExtractedTable {
  columns: ColumnDef[];
  rows: number;
}

/** One dump row as a JSONL line carries it: column name to parsed SQL value. */
interface ExtractedRow {
  [column: string]: SqlValue;
}

export interface ExtractManifest {
  dump: { path: string; size: number; mtimeMs: number };
  extractedAt: string;
  tables: Record<string, ExtractedTable>;
}

function rawDir(outDir: string): string {
  return path.join(outDir, "raw");
}

export function rawPath(outDir: string, table: string): string {
  return path.join(rawDir(outDir), `${table}.jsonl`);
}

function manifestPath(outDir: string): string {
  return path.join(rawDir(outDir), "_manifest.json");
}

function parseColumnDef(value: JsonValue | undefined): ColumnDef | null {
  if (!isJsonObject(value)) return null;
  const { name, type, definition } = value;

  if (!isJsonText(name) || !isJsonText(type) || !isJsonText(definition)) return null;

  return { name, type, definition };
}

function parseExtractedTable(value: JsonValue | undefined): ExtractedTable | null {
  if (!isJsonObject(value)) return null;
  const { columns, rows } = value;

  if (!isJsonArray(columns) || !isJsonNumber(rows)) return null;
  const parsed: ColumnDef[] = [];

  for (const column of columns) {
    const definition = parseColumnDef(column);

    if (definition === null) return null;
    parsed.push(definition);
  }

  return { columns: parsed, rows };
}

/** A manifest that does not describe a full extraction is treated as no manifest at all. */
function parseManifest(text: string): ExtractManifest | null {
  const parsed = parseJson(text);

  if (!isJsonObject(parsed)) return null;
  const { dump, extractedAt, tables } = parsed;

  if (!isJsonObject(dump) || !isJsonText(extractedAt) || !isJsonObject(tables)) return null;
  const { path: dumpPath, size, mtimeMs } = dump;

  if (!isJsonText(dumpPath) || !isJsonNumber(size) || !isJsonNumber(mtimeMs)) return null;

  const manifest: ExtractManifest = {
    dump: { path: dumpPath, size, mtimeMs },
    extractedAt,
    tables: {},
  };

  for (const [name, table] of Object.entries(tables)) {
    const entry = parseExtractedTable(table);

    if (entry === null) return null;
    manifest.tables[name] = entry;
  }

  return manifest;
}

async function readManifest(outDir: string): Promise<ExtractManifest | null> {
  try {
    return parseManifest(await readFile(manifestPath(outDir), "utf8"));
  } catch {
    return null;
  }
}

class TableWriter {
  private streams = new Map<string, ReturnType<typeof createWriteStream>>();

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  async write(table: string, line: string): Promise<void> {
    let stream = this.streams.get(table);

    if (!stream) {
      stream = createWriteStream(path.join(this.dir, `${table}.jsonl`), { encoding: "utf8" });
      this.streams.set(table, stream);
    }

    if (!stream.write(line)) await once(stream, "drain");
  }

  async close(): Promise<void> {
    for (const stream of this.streams.values()) {
      stream.end();
      await once(stream, "close");
    }

    this.streams.clear();
  }
}

function rowToObject(columns: string[], values: SqlValue[]): ExtractedRow {
  const out: ExtractedRow = {};

  for (const [index, column] of columns.entries()) out[column] = values[index] ?? null;

  return out;
}

export interface ExtractOptions {
  dumpPath: string;
  outDir: string;
  force?: boolean;
  onProgress?: (table: string, rows: number) => void;
}

/**
 * Pass one: stream the dump into one JSONL file per MySQL table plus a
 * manifest of column names and types. Re-running with the same dump reuses the
 * previous extraction unless force is set.
 */
export async function extract(options: ExtractOptions): Promise<ExtractManifest> {
  const { dumpPath, outDir } = options;
  const stat = statSync(dumpPath);
  const existing = await readManifest(outDir);

  if (
    !options.force &&
    existing &&
    existing.dump.size === stat.size &&
    existing.dump.mtimeMs === stat.mtimeMs &&
    Object.keys(existing.tables).every((t) => existsSync(rawPath(outDir, t)))
  ) {
    return existing;
  }

  const writer = new TableWriter(rawDir(outDir));
  const tables: Record<string, ExtractedTable> = {};
  const columnNames = new Map<string, string[]>();

  try {
    for await (const event of readDump(dumpPath)) {
      if (event.kind === "table") {
        tables[event.table.name] = { columns: event.table.columns, rows: 0 };
        columnNames.set(
          event.table.name,
          event.table.columns.map((c) => c.name),
        );
        continue;
      }

      const columns = columnNames.get(event.table);

      if (!columns) continue;
      const entry = tables[event.table];

      if (!entry) continue;
      let buffer = "";

      for (const values of event.rows) {
        buffer += `${JSON.stringify(rowToObject(columns, values))}\n`;
        entry.rows++;
      }

      if (buffer.length > 0) await writer.write(event.table, buffer);
      options.onProgress?.(event.table, entry.rows);
    }
  } finally {
    await writer.close();
  }

  // Tables with no INSERT statements still need an (empty) file.
  for (const table of Object.keys(tables)) {
    if (!existsSync(rawPath(outDir, table))) await writeFile(rawPath(outDir, table), "");
  }

  const manifest: ExtractManifest = {
    dump: { path: path.resolve(dumpPath), size: stat.size, mtimeMs: stat.mtimeMs },
    extractedAt: new Date().toISOString(),
    tables,
  };

  await writeFile(manifestPath(outDir), `${JSON.stringify(manifest, null, 2)}\n`);

  return manifest;
}
