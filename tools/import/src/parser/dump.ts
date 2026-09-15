import { createReadStream } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { createGunzip } from "node:zlib";
import { StatementSplitter } from "./statements.ts";
import { readTuples, type SqlValue } from "./values.ts";

export interface ColumnDef {
  name: string;
  type: string;
  definition: string;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
}

export type DumpEvent =
  | { kind: "table"; table: TableDef }
  | { kind: "rows"; table: string; rows: SqlValue[][] };

const CREATE_RE = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`\s*\(/i;

const INSERT_RE = /^INSERT\s+(?:IGNORE\s+)?INTO\s+`([^`]+)`\s*(?:\(([^)]*)\))?\s*VALUES/i;

export function parseCreateTable(stmt: string): TableDef | null {
  const head = CREATE_RE.exec(stmt);
  const tableName = head?.[1];

  if (!head || tableName === undefined) return null;
  const columns: ColumnDef[] = [];
  const body = stmt.slice(head[0].length);

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();

    if (!line.startsWith("`")) continue;
    const end = line.indexOf("`", 1);

    if (end < 0) continue;
    const name = line.slice(1, end);

    const definition = line
      .slice(end + 1)
      .replace(/,$/, "")
      .trim();

    const type = (/^[a-z]+(\([^)]*\))?(\s+unsigned)?/i.exec(definition)?.[0] ?? "").toLowerCase();
    columns.push({ name, type, definition });
  }

  return { name: tableName, columns };
}

export interface InsertHead {
  table: string;
  columns: string[] | null;
  at: number;
}

export function parseInsert(stmt: string): InsertHead | null {
  const head = INSERT_RE.exec(stmt);
  const table = head?.[1];

  if (!head || table === undefined) return null;
  const columns = head[2] ? head[2].split(",").map((c) => c.trim().replace(/`/g, "")) : null;

  return { table, columns, at: head[0].length };
}

function openStream(path: string): NodeJS.ReadableStream {
  const file = createReadStream(path);

  if (path.endsWith(".gz")) return file.pipe(createGunzip());

  return file;
}

/**
 * Streams a mysqldump file and yields one event per CREATE TABLE and one event
 * per INSERT statement. The file is never held in memory: only the statement
 * being parsed is.
 */
export async function* readDump(path: string): AsyncGenerator<DumpEvent> {
  const stream = openStream(path);
  const splitter = new StatementSplitter();
  const decoder = new StringDecoder("utf8");

  const handle = function* (statements: string[]): Generator<DumpEvent> {
    for (const stmt of statements) {
      const upper = stmt.slice(0, 16).toUpperCase();

      if (upper.startsWith("CREATE TABLE") || upper.startsWith("CREATE  TABLE")) {
        const table = parseCreateTable(stmt);

        if (table) yield { kind: "table", table };
        continue;
      }

      if (upper.startsWith("INSERT")) {
        const insert = parseInsert(stmt);

        if (!insert) continue;
        const rows: SqlValue[][] = [];

        for (const row of readTuples(stmt, insert.at)) rows.push(row);
        yield { kind: "rows", table: insert.table, rows };
      }
    }
  };

  for await (const chunk of stream) {
    // A stream opened without an encoding yields buffers; a decoded one needs no decoding.
    const text = Buffer.isBuffer(chunk) ? decoder.write(chunk) : String(chunk);

    if (text.length === 0) continue;
    yield* handle(splitter.push(text));
  }

  const tail = decoder.end();

  if (tail.length > 0) yield* handle(splitter.push(tail));
  yield* handle(splitter.end());
}
