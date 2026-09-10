import { once } from "node:events";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ColumnDef } from "./parser/dump.ts";
import { readDump } from "./parser/dump.ts";
import type { SqlValue } from "./parser/values.ts";

export interface ExtractedTable {
  columns: ColumnDef[];
  rows: number;
}

export interface ExtractManifest {
  dump: { path: string; size: number; mtimeMs: number };
  extractedAt: string;
  tables: Record<string, ExtractedTable>;
}

export function rawDir(outDir: string): string {
  return path.join(outDir, "raw");
}

export function rawPath(outDir: string, table: string): string {
  return path.join(rawDir(outDir), `${table}.jsonl`);
}

function manifestPath(outDir: string): string {
  return path.join(rawDir(outDir), "_manifest.json");
}

export async function readManifest(outDir: string): Promise<ExtractManifest | null> {
  try {
    return JSON.parse(await readFile(manifestPath(outDir), "utf8")) as ExtractManifest;
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

function rowToObject(columns: string[], values: SqlValue[]): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {};
  for (let i = 0; i < columns.length; i++)
    out[columns[i] as string] = i < values.length ? (values[i] as SqlValue) : null;
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
