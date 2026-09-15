import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { blobToBuffer, type SqlValue } from "./parser/values.ts";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?)?/;

export function parseSqlDate(value: SqlValue): number | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "number") return value;

  if (typeof value !== "string") return undefined;
  const m = DATE_RE.exec(value.trim());

  if (!m) return undefined;
  const [, y, mo, d, h, mi, s, frac] = m;
  const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;

  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0), ms);
}

/**
 * One row of a MySQL table. Every accessor records the column it read so that
 * the report can list columns the importer never looked at.
 */
export class Row {
  constructor(
    readonly data: Record<string, SqlValue>,
    private readonly seen: Set<string>,
  ) {}

  raw(column: string): SqlValue {
    this.seen.add(column);

    return this.data[column] ?? null;
  }

  has(column: string): boolean {
    return column in this.data;
  }

  id(): number {
    return this.n("id");
  }

  s(column: string): string {
    const value = this.raw(column);

    if (value === null) return "";

    if (typeof value === "string") return value;

    if (typeof value === "number") return String(value);

    return blobToBuffer(value)?.toString("utf8") ?? "";
  }

  sOpt(column: string): string | undefined {
    const value = this.s(column);

    return value === "" ? undefined : value;
  }

  n(column: string): number {
    const value = this.raw(column);

    if (typeof value === "number") return value;

    if (typeof value === "string" && value.trim() !== "") {
      const num = Number(value);

      if (!Number.isNaN(num)) return num;
    }

    return 0;
  }

  nOpt(column: string): number | undefined {
    const value = this.raw(column);

    if (value === null) return undefined;

    if (typeof value === "number") return value;

    if (typeof value === "string" && value.trim() !== "") {
      const num = Number(value);

      if (!Number.isNaN(num)) return num;
    }

    return undefined;
  }

  b(column: string): boolean {
    const value = this.raw(column);

    if (value === null) return false;

    if (typeof value === "number") return value !== 0;

    if (typeof value === "string") return value !== "" && value !== "0";

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

  json(column: string): unknown {
    const text = this.s(column);

    if (text.trim() === "") return null;

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}

export async function* readRows(file: string, seen: Set<string>): AsyncGenerator<Row> {
  if (!existsSync(file)) return;
  const stream = createReadStream(file, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

  for await (const line of lines) {
    if (line.trim() === "") continue;
    yield new Row(JSON.parse(line) as Record<string, SqlValue>, seen);
  }
}

export async function loadRows(file: string, seen: Set<string>): Promise<Row[]> {
  const out: Row[] = [];

  for await (const row of readRows(file, seen)) out.push(row);

  return out;
}
