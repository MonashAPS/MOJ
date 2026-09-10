/**
 * Remark-side rewrites: heading demotion, `safe_mode` HTML escaping, and the metadata sweep.
 */

import type { Heading, Html, Root, RootContent } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import { toString as mdastToString } from "mdast-util-to-string";
import type { MathDelimiter } from "./remark-tilde-math.js";

/* ---------------------------------------------------------------- heading demotion ----- */

export interface DemoteHeadingsOptions {
  readonly by: number;
}

/**
 * `AwesomeRenderer.header` renders every markdown heading two levels down, so a statement's
 * `##` lands under the page's own `h2` title.
 */
const remarkDemoteHeadings: Plugin<[DemoteHeadingsOptions], Root> =
  function remarkDemoteHeadings(options) {
    const by = options.by;
    if (!by) return;
    return (tree: Root) => {
      visit(tree, "heading", (node: Heading) => {
        node.depth = Math.min(6, Math.max(1, node.depth + by)) as Heading["depth"];
      });
    };
  };

/* ------------------------------------------------------------------- safe_mode HTML ----- */

/**
 * DMOJ's `safe_mode` styles run mistune with `escape=True`, which prints raw HTML as text
 * rather than parsing it. Turning `html` nodes into `text` nodes reproduces that: the markup
 * shows up in the page escaped, instead of silently disappearing.
 */
const remarkEscapeHtml: Plugin<[], Root> = function remarkEscapeHtml() {
  return (tree: Root) => {
    visit(tree, "html", (node: Html, index, parent) => {
      if (!parent || index === undefined) return;
      const replacement: RootContent = { type: "text", value: node.value };
      parent.children.splice(index, 1, replacement);
    });
  };
};

/* ------------------------------------------------------------------------ metadata ----- */

export interface CollectedHeading {
  readonly depth: number;
  readonly text: string;
  readonly id: string;
}

export interface CollectedMeta {
  headings: CollectedHeading[];
  images: string[];
  links: string[];
  math: Record<MathDelimiter | "inline" | "display", number>;
  hasRawHtml: boolean;
  plain: string;
}

export function emptyCollectedMeta(): CollectedMeta {
  return {
    headings: [],
    images: [],
    links: [],
    math: { inline: 0, display: 0, tilde: 0, paren: 0, bracket: 0, dollar: 0 },
    hasRawHtml: false,
    plain: "",
  };
}

/** GitHub's heading slug, matching what `cmarker` produces for its Typst labels. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

export interface CollectOptions {
  readonly into: CollectedMeta;
  readonly demoteBy: number;
}

const remarkCollect: Plugin<[CollectOptions], Root> = function remarkCollect(options) {
  const { into, demoteBy } = options;

  return (tree: Root) => {
    const seen = new Map<string, number>();

    visit(tree, (node) => {
      switch (node.type) {
        case "heading": {
          const heading = node as Heading;
          const text = mdastToString(heading);
          const base = slugify(text);
          const count = seen.get(base) ?? 0;
          seen.set(base, count + 1);
          into.headings.push({
            depth: Math.min(6, Math.max(1, heading.depth + demoteBy)),
            text,
            id: count === 0 ? base : `${base}-${count}`,
          });
          break;
        }
        case "image": {
          const url = (node as { url?: string }).url;
          if (url) into.images.push(url);
          break;
        }
        case "link": {
          const url = (node as { url?: string }).url;
          if (url) into.links.push(url);
          break;
        }
        case "html": {
          into.hasRawHtml = true;
          break;
        }
        case "inlineMath":
        case "math": {
          const display = node.type === "math";
          into.math[display ? "display" : "inline"] += 1;
          const data = (node as { data?: { mojDelimiter?: MathDelimiter } }).data;
          const delimiter: MathDelimiter = data?.mojDelimiter ?? "dollar";
          into.math[delimiter] += 1;
          break;
        }
        default:
          break;
      }
    });

    into.plain = mdastToString(tree, { includeImageAlt: false });
  };
};

export { remarkCollect, remarkDemoteHeadings, remarkEscapeHtml };
