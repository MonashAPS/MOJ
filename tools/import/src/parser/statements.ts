type State = "normal" | "single" | "double" | "backtick" | "line-comment" | "block-comment";

/**
 * Splits a stream of SQL text into complete statements without ever holding
 * more than the current statement in memory. Quoting, backslash escapes and
 * both comment styles are respected so that a semicolon inside a string never
 * ends a statement. Chunk boundaries are safe: a pending escape or a half seen
 * two character token is carried over to the next chunk.
 */
export class StatementSplitter {
  private buf = "";
  private scan = 0;
  private state: State = "normal";
  private escaped = false;

  push(chunk: string): string[] {
    this.buf += chunk;
    return this.drain(false);
  }

  end(): string[] {
    const out = this.drain(true);
    const rest = this.buf.trim();
    this.buf = "";
    this.scan = 0;
    if (rest.length > 0 && rest !== ";") out.push(rest);
    return out;
  }

  private drain(final: boolean): string[] {
    const out: string[] = [];
    const buf = this.buf;
    let i = this.scan;
    let start = 0;
    let stop = false;

    while (i < buf.length && !stop) {
      const ch = buf[i];
      const last = i === buf.length - 1;
      switch (this.state) {
        case "normal":
          if (ch === "'") this.state = "single";
          else if (ch === '"') this.state = "double";
          else if (ch === "`") this.state = "backtick";
          else if (ch === "#") this.state = "line-comment";
          else if (ch === "-" || ch === "/") {
            if (last && !final) {
              stop = true;
              break;
            }
            if (ch === "-" && buf[i + 1] === "-") {
              this.state = "line-comment";
              i++;
            } else if (ch === "/" && buf[i + 1] === "*") {
              this.state = "block-comment";
              i++;
            }
          } else if (ch === ";") {
            const stmt = buf.slice(start, i + 1).trim();
            if (stmt.length > 1) out.push(stmt);
            start = i + 1;
          }
          break;
        case "single":
        case "double":
          if (this.escaped) this.escaped = false;
          else if (ch === "\\") this.escaped = true;
          else if (this.state === "single" && ch === "'") this.state = "normal";
          else if (this.state === "double" && ch === '"') this.state = "normal";
          break;
        case "backtick":
          if (ch === "`") this.state = "normal";
          break;
        case "line-comment":
          if (ch === "\n") this.state = "normal";
          break;
        case "block-comment":
          if (ch === "*") {
            if (last && !final) {
              stop = true;
              break;
            }
            if (buf[i + 1] === "/") {
              this.state = "normal";
              i++;
            }
          }
          break;
      }
      if (stop) break;
      i++;
    }

    if (start > 0) {
      this.buf = buf.slice(start);
      this.scan = i - start;
    } else {
      this.scan = i;
    }
    return out;
  }
}
