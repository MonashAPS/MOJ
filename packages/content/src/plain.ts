/**
 * Plain-text projections of a statement, for `og:description`, search indexing and the
 * `problems.summary` column.
 */

import type { Nodes as MdastNodes, Root } from "mdast";

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "list",
  "listItem",
  "table",
  "tableRow",
  "thematicBreak",
  "code",
  "html",
  "footnoteDefinition",
  "definition",
]);

export interface PlainTextOptions {
  /** Keep fenced and indented code blocks. Off by default: sample IO is noise in a summary. */
  readonly includeCode?: boolean;
  /** Keep the TeX source of maths. On by default; `~n~` reads as `n`. */
  readonly includeMath?: boolean;
  /** Keep image alt text. Off by default, matching `mdast-util-to-string`'s conservative mode. */
  readonly includeImageAlt?: boolean;
}

/** Flattens an mdast tree to prose, with one blank line between blocks. */
export function plainTextFromMdast(root: Root, options: PlainTextOptions = {}): string {
  const includeCode = options.includeCode ?? false;
  const includeMath = options.includeMath ?? true;
  const includeImageAlt = options.includeImageAlt ?? false;
  const chunks: string[] = [];

  const walk = (node: MdastNodes): void => {
    switch (node.type) {
      case "text":
      case "inlineCode":
        chunks.push(node.value);
        return;
      case "code":
        if (includeCode) {
          chunks.push("\n\n", node.value, "\n\n");
        } else {
          chunks.push("\n\n");
        }
        return;
      case "inlineMath":
      case "math":
        if (includeMath) chunks.push((node as { value: string }).value);
        return;
      case "image":
        if (includeImageAlt && node.alt) chunks.push(node.alt);
        return;
      case "break":
        chunks.push(" ");
        return;
      case "html":
        return;
      default:
        break;
    }

    const block = BLOCK_TYPES.has(node.type);
    if (block) chunks.push("\n\n");
    const children = (node as { children?: MdastNodes[] }).children;
    if (children) for (const child of children) walk(child);
    if (block) chunks.push("\n\n");
  };

  walk(root);

  return chunks
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

export interface SummaryOptions extends PlainTextOptions {
  /** Hard cap in characters. DMOJ's og:description is cut at 200. */
  readonly maxLength?: number;
  readonly ellipsis?: string;
}

/** Truncates on a word boundary, appending an ellipsis when anything was dropped. */
export function truncateSummary(text: string, options: SummaryOptions = {}): string {
  const maxLength = options.maxLength ?? 200;
  const ellipsis = options.ellipsis ?? "…";
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxLength) return flat;

  const cut = flat.slice(0, maxLength);
  const space = cut.lastIndexOf(" ");
  const head = (space > maxLength * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, "");
  return head + ellipsis;
}
