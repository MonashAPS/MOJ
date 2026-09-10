export interface HexBlob {
  $hex: string;
}

export type SqlValue = string | number | null | HexBlob;

export function isHexBlob(value: unknown): value is HexBlob {
  return typeof value === "object" && value !== null && typeof (value as HexBlob).$hex === "string";
}

export function blobToBuffer(value: SqlValue): Buffer | null {
  if (value === null) return null;
  if (isHexBlob(value)) return Buffer.from(value.$hex, "hex");
  if (typeof value === "string") return Buffer.from(value, "utf8");
  return null;
}

export function bufferToBlob(buf: Buffer): HexBlob {
  return { $hex: buf.toString("hex") };
}

const HEX = /^[0-9a-fA-F]+$/;

class Cursor {
  constructor(
    readonly text: string,
    public pos: number,
  ) {}

  skipSpace(): void {
    while (this.pos < this.text.length) {
      const c = this.text.charCodeAt(this.pos);
      // space, tab, newline, carriage return
      if (c === 32 || c === 9 || c === 10 || c === 13) this.pos++;
      else break;
    }
  }
}

function readQuoted(cur: Cursor): string {
  // cur.pos points at the opening quote.
  const text = cur.text;
  const quote = text[cur.pos];
  let i = cur.pos + 1;
  let out = "";
  let run = i;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      out += text.slice(run, i);
      const next = text[i + 1];
      switch (next) {
        case "0":
          out += "\0";
          break;
        case "'":
          out += "'";
          break;
        case '"':
          out += '"';
          break;
        case "b":
          out += "\b";
          break;
        case "n":
          out += "\n";
          break;
        case "r":
          out += "\r";
          break;
        case "t":
          out += "\t";
          break;
        case "Z":
          out += "\u001a";
          break;
        case "\\":
          out += "\\";
          break;
        case "%":
          out += "\\%";
          break;
        case "_":
          out += "\\_";
          break;
        case undefined:
          out += "\\";
          break;
        default:
          // MySQL drops the backslash for every other escape sequence.
          out += next;
          break;
      }
      i += 2;
      run = i;
      continue;
    }
    if (ch === quote) {
      if (text[i + 1] === quote) {
        // Doubled quote, some dumps use this instead of a backslash escape.
        out += text.slice(run, i + 1);
        i += 2;
        run = i;
        continue;
      }
      out += text.slice(run, i);
      cur.pos = i + 1;
      return out;
    }
    i++;
  }
  throw new Error("unterminated string literal in dump");
}

function readBareToken(cur: Cursor): string {
  const text = cur.text;
  const start = cur.pos;
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "," || ch === ")") break;
    i++;
  }
  cur.pos = i;
  return text.slice(start, i).trim();
}

function readValue(cur: Cursor): SqlValue {
  cur.skipSpace();
  const text = cur.text;
  const ch = text[cur.pos];
  if (ch === "'" || ch === '"') return readQuoted(cur);

  if (ch === "_" && text.startsWith("_binary", cur.pos)) {
    cur.pos += "_binary".length;
    cur.skipSpace();
    const raw = readQuoted(cur);
    return bufferToBlob(Buffer.from(raw, "latin1"));
  }

  if (ch === "0" && (text[cur.pos + 1] === "x" || text[cur.pos + 1] === "X")) {
    const token = readBareToken(cur);
    const digits = token.slice(2);
    if (HEX.test(digits) && digits.length % 2 === 0) return { $hex: digits.toLowerCase() };
    return token;
  }

  if ((ch === "x" || ch === "X" || ch === "b" || ch === "B") && text[cur.pos + 1] === "'") {
    const kind = ch.toLowerCase();
    cur.pos++;
    const raw = readQuoted(cur);
    if (kind === "x" && HEX.test(raw) && raw.length % 2 === 0) return { $hex: raw.toLowerCase() };
    if (kind === "b" && /^[01]+$/.test(raw)) return Number.parseInt(raw, 2);
    return raw;
  }

  const token = readBareToken(cur);
  const upper = token.toUpperCase();
  if (upper === "NULL") return null;
  if (upper === "TRUE") return 1;
  if (upper === "FALSE") return 0;
  if (token === "") return null;
  const num = Number(token);
  if (!Number.isNaN(num)) return num;
  return token;
}

export function readTuple(text: string, pos: number): { values: SqlValue[]; next: number } | null {
  const cur = new Cursor(text, pos);
  cur.skipSpace();
  if (cur.text[cur.pos] !== "(") return null;
  cur.pos++;
  const values: SqlValue[] = [];
  for (;;) {
    cur.skipSpace();
    if (cur.text[cur.pos] === ")") {
      cur.pos++;
      break;
    }
    values.push(readValue(cur));
    cur.skipSpace();
    const ch = cur.text[cur.pos];
    if (ch === ",") {
      cur.pos++;
      continue;
    }
    if (ch === ")") {
      cur.pos++;
      break;
    }
    throw new Error(`unexpected character ${JSON.stringify(ch ?? "<eof>")} in VALUES tuple`);
  }
  return { values, next: cur.pos };
}

export function* readTuples(text: string, pos: number): Generator<SqlValue[]> {
  let at = pos;
  for (;;) {
    const tuple = readTuple(text, at);
    if (!tuple) return;
    yield tuple.values;
    at = tuple.next;
    // Skip the separator between tuples, and stop at the statement terminator.
    let i = at;
    while (i < text.length && /\s/.test(text[i] as string)) i++;
    if (text[i] === ",") {
      at = i + 1;
      continue;
    }
    return;
  }
}
