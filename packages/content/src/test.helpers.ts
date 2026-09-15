import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ProblemMeta } from "./typst/statement.js";

export const FIXTURE_DIR = new URL("./__fixtures__/", import.meta.url);

export const STATEMENT_DIR = new URL("./statements/", FIXTURE_DIR);

export interface Fixture {
  readonly code: string;
  readonly source: string;
  readonly meta: ProblemMeta;
}

let cache: Fixture[] | undefined;

/** Every real MAPS statement kept under `src/__fixtures__/statements`. */
export async function loadFixtures(): Promise<Fixture[]> {
  if (cache) return cache;

  // SAFETY: problems.json is the checked-in index of the statements beside it,
  // written by the same fixture update script and keyed by problem code.
  const metas = JSON.parse(await readFile(new URL("problems.json", FIXTURE_DIR), "utf8")) as Record<
    string,
    ProblemMeta
  >;

  const files = (await readdir(fileURLToPath(STATEMENT_DIR))).filter((name) => name.endsWith(".md")).sort();
  cache = await Promise.all(
    files.map(async (file) => {
      const code = file.replace(/\.md$/, "");
      const meta = metas[code];

      if (!meta) throw new Error(`no metadata for fixture ${code}`);

      return { code, meta, source: await readFile(new URL(file, STATEMENT_DIR), "utf8") };
    }),
  );

  return cache;
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNi" +
    "UFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAABf/" +
    "EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8Aef/Z",
  "base64",
);

/**
 * A one-pixel stand-in for a statement image.
 *
 * The statement repository keeps its media outside the problem folders, so the corpus check
 * supplies placeholders for whatever the converter asks for; that still exercises the image
 * path resolution, which is the part `@moj/content` is responsible for.
 */
export function placeholderImage(path: string): Buffer {
  return /\.jpe?g$/i.test(path) ? JPEG : PNG;
}

/** Assets for a compile, keyed the way `renderPdf` wants them. */
export function placeholderAssets(paths: readonly string[]): Record<string, Buffer> {
  return Object.fromEntries(paths.map((path) => [path.replace(/^\/+/, ""), placeholderImage(path)]));
}

/** Counts the `~...~` pairs a statement contains, independently of the renderer. */
export function countTildePairs(source: string): number {
  // Fences and inline code never contain maths, and an escaped tilde is literal.
  const withoutFences = source.replace(/^```[\s\S]*?^```/gm, "\n").replace(/`[^`\n]*`/g, "``");
  let count = 0;

  for (const line of withoutFences.split("\n")) {
    let index = 0;

    while (index < line.length) {
      const character = line[index];

      if (character === "\\") {
        index += 2;
        continue;
      }

      if (character !== "~") {
        index += 1;
        continue;
      }

      if (line[index + 1] === "~") {
        // Strikethrough: skip to the closing `~~`.
        const close = line.indexOf("~~", index + 2);
        index = close < 0 ? index + 2 : close + 2;
        continue;
      }

      let scan = index + 1;
      let closed = -1;

      while (scan < line.length) {
        if (line[scan] === "\\") {
          scan += 2;
          continue;
        }

        if (line[scan] === "~") {
          closed = scan;
          break;
        }

        scan += 1;
      }

      if (closed < 0 || closed === index + 1) {
        index += 1;
        continue;
      }

      count += 1;
      index = closed + 1;
    }
  }

  return count;
}
