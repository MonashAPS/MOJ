import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { isJsonObject, type JsonValue, parseJson } from "./json.ts";
import { blobToBuffer, isSqlNumber, isSqlText, type SqlValue, sqlValueFromJson } from "./parser/values.ts";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?)?/;

function parseSqlDate(value: SqlValue): number | undefined {
  if (value === null) return undefined;

  if (isSqlNumber(value)) return value;

  if (!isSqlText(value)) return undefined;
  const m = DATE_RE.exec(value.trim());

  if (!m) return undefined;
  const [, y, mo, d, h, mi, s, frac] = m;
  const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;

  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0), ms);
}

/** Turns one line of a raw JSONL file back into the columns extract() wrote. */
function parseSqlRow(line: string): Map<string, SqlValue> {
  const columns = new Map<string, SqlValue>();
  const parsed = parseJson(line);

  if (!isJsonObject(parsed)) return columns;

  for (const [column, value] of Object.entries(parsed)) columns.set(column, sqlValueFromJson(value));

  return columns;
}

/**
 * One row of a MySQL table. Every accessor records the column it read so that
 * the report can list columns the importer never looked at.
 */
export class Row {
  constructor(
    private readonly columns: Map<string, SqlValue>,
    private readonly seen: Set<string>,
  ) {}

  raw(column: string): SqlValue {
    this.seen.add(column);

    return this.columns.get(column) ?? null;
  }

  has(column: string): boolean {
    return this.columns.has(column);
  }

  id(): number {
    return this.n("id");
  }

  s(column: string): string {
    const value = this.raw(column);

    if (value === null) return "";

    if (isSqlText(value)) return value;

    if (isSqlNumber(value)) return String(value);

    return blobToBuffer(value)?.toString("utf8") ?? "";
  }

  sOpt(column: string): string | undefined {
    const value = this.s(column);

    return value === "" ? undefined : value;
  }

  n(column: string): number {
    return this.nOpt(column) ?? 0;
  }

  nOpt(column: string): number | undefined {
    const value = this.raw(column);

    if (value === null) return undefined;

    if (isSqlNumber(value)) return value;

    if (isSqlText(value) && value.trim() !== "") {
      const num = Number(value);

      if (!Number.isNaN(num)) return num;
    }

    return undefined;
  }

  b(column: string): boolean {
    const value = this.raw(column);

    if (value === null) return false;

    if (isSqlNumber(value)) return value !== 0;

    if (isSqlText(value)) return value !== "" && value !== "0";

    return true;
  }

  t(column: string): number {
    return parseSqlDate(this.raw(column)) ?? 0;
  }

  tOpt(column: string): number | undefined {
    return parseSqlDate(this.raw(column));
  }

  blob(column: string): Buffer | null {
    return blobToBuffer(this.raw(column));
  }

  json(column: string): JsonValue {
    const text = this.s(column);

    if (text.trim() === "") return null;

    return parseJson(text);
  }
}

export async function* readRows(file: string, seen: Set<string>): AsyncGenerator<Row> {
  if (!existsSync(file)) return;
  const stream = createReadStream(file, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

  for await (const line of lines) {
    if (line.trim() === "") continue;
    yield new Row(parseSqlRow(line), seen);
  }
}

export async function loadRows(file: string, seen: Set<string>): Promise<Row[]> {
  const out: Row[] = [];

  for await (const row of readRows(file, seen)) out.push(row);

  return out;
}
