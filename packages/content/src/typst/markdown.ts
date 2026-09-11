/**
 * Normalises a DMOJ statement into the CommonMark dialect `cmarker` understands.
 *
 * `cmarker` runs pulldown-cmark, which knows `$x$` and `$$x$$` maths (handed to `mitex`) but
 * reads `~x~` as strikethrough, treats HTML as HTML, and cannot fetch a remote image. So the
 * statement is reparsed with MOJ's own pipeline and written back out with:
 *
 *   - every maths node serialised as `$...$` / `$$...$$`, whatever delimiter it came in as;
 *   - the leading `# Title` dropped, since the canonical name lives in `config.json`, and the
 *     remaining headings shifted so the top section is `##` (`h1-level: 0` in `cmarker` then
 *     maps it onto Typst's first heading level);
 *   - raw HTML either turned into a real image node or escaped into literal text, so an
 *     `<name>` placeholder in an output-format section survives instead of being eaten;
 *   - images resolved through a caller-supplied hook, dropping the ones Typst cannot read.
 */

import type { Heading, Image, Nodes as MdastNodes, Paragraph, Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import remarkTildeMath from "../plugins/remark-tilde-math.js";

export interface NormaliseOptions {
  /**
   * Maps an image source onto a path Typst can read. Return `null` to drop the image. The
   * default makes local paths root-absolute and drops remote ones, because Typst has no
   * network access.
   */
  readonly resolveImage?: (src: string) => string | null;
  /** Called for every image, so the caller knows which assets the compile will need. */
  readonly onImage?: (image: { original: string; resolved: string | null }) => void;
  /** Drop the leading `# Title` heading. On by default. */
  readonly dropTitleHeading?: boolean;
  /** The heading level the top-most section should end up at. Two by default. */
  readonly topHeadingLevel?: number;
  readonly singleDollarMath?: boolean;
}

export interface NormaliseResult {
  readonly markdown: string;
  /** Images that were dropped, so callers can warn or fetch them. */
  readonly droppedImages: readonly string[];
  /** Raw HTML that became literal text. */
  readonly escapedHtml: readonly string[];
  /** Images kept, as the paths Typst will look for under the compile root. */
  readonly images: readonly string[];
  readonly title: string | null;
}

const REMOTE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

/**
 * Local images are rewritten to be root-absolute.
 *
 * `cmarker` emits `#image(path)` from inside its own package, so a relative path would be
 * looked up next to `cmarker/lib.typ` rather than next to the statement. A leading slash makes
 * Typst resolve it against the `--root` directory that `renderPdf` sets up instead.
 */
export function defaultResolveImage(src: string): string | null {
  if (!src) return null;
  if (src.startsWith("data:")) return null;
  if (REMOTE.test(src)) return null;
  const cleaned = src.replace(/^\.\//, "").replace(/^\/+/, "");
  if (!cleaned || cleaned.startsWith("../")) return null;
  return `/${cleaned}`;
}

/** A resolver for callers with no media directory to hand. */
export function dropAllImages(): null {
  return null;
}

const IMG_TAG = /<img\b([^>]*)>/gi;
const ATTRIBUTE = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const COMMENT = /^\s*<!--[\s\S]*?-->\s*$/;

function attributesOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTRIBUTE.lastIndex = 0;
  let match = ATTRIBUTE.exec(raw);
  while (match) {
    const [, name, doubleQuoted, singleQuoted, bare] = match;
    out[(name as string).toLowerCase()] = doubleQuoted ?? singleQuoted ?? bare ?? "";
    match = ATTRIBUTE.exec(raw);
  }
  return out;
}

function htmlToNodes(value: string): RootContent[] {
  if (COMMENT.test(value)) return [];

  const nodes: RootContent[] = [];
  let last = 0;
  IMG_TAG.lastIndex = 0;
  let match = IMG_TAG.exec(value);
  while (match) {
    if (match.index > last) {
      nodes.push({ type: "text", value: value.slice(last, match.index) });
    }
    const attributes = attributesOf(match[1] as string);
    const src = attributes.src;
    if (src) {
      const image: Image = { type: "image", url: src, alt: attributes.alt ?? "" };
      if (attributes.title) image.title = attributes.title;
      nodes.push(image);
    }
    last = match.index + match[0].length;
    match = IMG_TAG.exec(value);
  }
  if (last < value.length) nodes.push({ type: "text", value: value.slice(last) });
  return nodes;
}

function isBlockish(nodes: readonly RootContent[]): boolean {
  return nodes.some((node) => node.type === "image");
}

export function normaliseForCmarker(source: string, options: NormaliseOptions = {}): NormaliseResult {
  const resolveImage = options.resolveImage ?? defaultResolveImage;
  const topLevel = options.topHeadingLevel ?? 2;
  const droppedImages: string[] = [];
  const escapedHtml: string[] = [];
  const images: string[] = [];
  let title: string | null = null;

  const parser = unified()
    .use(remarkParse)
    .use(remarkGfm, { singleTilde: false })
    .use(remarkMath, { singleDollarTextMath: options.singleDollarMath ?? true })
    .use(remarkTildeMath);
  const tree = parser.parse(source) as Root;

  // 1. The leading `# Title`, which duplicates `config.json`'s `title`.
  const first = tree.children[0];
  if (first && first.type === "heading" && first.depth === 1) {
    title = plainHeading(first);
    if (options.dropTitleHeading !== false) tree.children.shift();
  }

  // 2. Shift the remaining headings so the top section lands on `topLevel`.
  let minDepth = 7;
  visit(tree, "heading", (node: Heading) => {
    minDepth = Math.min(minDepth, node.depth);
  });
  if (minDepth < topLevel && minDepth <= 6) {
    const shift = topLevel - minDepth;
    visit(tree, "heading", (node: Heading) => {
      node.depth = Math.min(6, node.depth + shift) as Heading["depth"];
    });
  }

  // 3. Raw HTML: images become images, comments go, everything else becomes literal text.
  visit(tree, "html", (node, index, parent) => {
    if (!parent || index === undefined) return;
    const replacement = htmlToNodes(node.value);
    if (replacement.length === 0) {
      parent.children.splice(index, 1);
      return index;
    }
    escapedHtml.push(node.value);
    if (parent.type === "root" && isBlockish(replacement)) {
      const wrapped: Paragraph = {
        type: "paragraph",
        children: replacement as Paragraph["children"],
      };
      parent.children.splice(index, 1, wrapped);
    } else {
      parent.children.splice(index, 1, ...(replacement as never[]));
    }
    return index;
  });

  // 4. Images Typst cannot read.
  visit(tree, "image", (node: Image, index, parent) => {
    if (!parent || index === undefined) return;
    const resolved = resolveImage(node.url);
    options.onImage?.({ original: node.url, resolved });
    if (resolved === null) {
      droppedImages.push(node.url);
      parent.children.splice(index, 1);
      return index;
    }
    node.url = resolved;
    images.push(resolved);
  });

  // 5. Empty paragraphs left behind by a dropped image.
  tree.children = tree.children.filter((node) => !(node.type === "paragraph" && node.children.length === 0));

  const markdown = unified()
    .use(remarkStringify, {
      bullet: "-",
      emphasis: "_",
      strong: "*",
      fences: true,
      rule: "-",
      listItemIndent: "one",
      resourceLink: true,
    })
    .use(remarkGfm, { singleTilde: false })
    .use(remarkMath)
    .stringify(tree);

  return { markdown, droppedImages, escapedHtml, images, title };
}

function plainHeading(node: Heading): string {
  let out = "";
  const walk = (current: MdastNodes): void => {
    if ("value" in current && typeof current.value === "string") out += current.value;
    const children = (current as { children?: MdastNodes[] }).children;
    if (children) for (const child of children) walk(child);
  };
  walk(node);
  return out.trim();
}
