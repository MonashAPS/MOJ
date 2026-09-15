import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function parseDotEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf("=");

    if (eq < 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

/** Walks up from `from` looking for .env.local and .env, without overriding real env vars. */
export function loadEnvFiles(from: string): Record<string, string> {
  const found: Record<string, string> = {};
  let dir = path.resolve(from);

  for (;;) {
    for (const name of [".env.local", ".env"]) {
      const file = path.join(dir, name);

      if (existsSync(file)) {
        for (const [key, value] of Object.entries(parseDotEnv(readFileSync(file, "utf8")))) {
          if (!(key in found)) found[key] = value;
        }
      }
    }

    const parent = path.dirname(dir);

    if (parent === dir) break;
    dir = parent;
  }

  return { ...found, ...(process.env as Record<string, string>) };
}
