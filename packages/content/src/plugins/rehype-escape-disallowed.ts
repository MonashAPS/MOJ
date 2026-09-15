/**
 * Turns elements outside the allowlist into literal text, the way bleach does with
 * `strip=False`.
 *
 * `hast-util-sanitize` unwraps an element it does not know, keeping the children and losing
 * the markup; bleach escapes the start and end tags instead, which is why DMOJ's own test
 * expects `<script>void(0)</script>` to come back as `&lt;script&gt;void(0)&lt;/script&gt;`
 * for the bleached styles. This runs before `rehype-sanitize` and reproduces that.
 */

import type { Element, ElementContent, Parent, Root, RootContent } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

export interface EscapeDisallowedOptions {
  /** Element names that stay as elements. */
  readonly tagNames: readonly string[];
}

/**
 * Elements whose closing tag is worth printing back.
 *
 * bleach escapes a *token stream*, so it prints an end tag only where the author wrote one.
 * parse5 gives us a tree instead, where `<name1>` in "the form `<name1> defeats <name2>`" has
 * silently adopted the rest of the paragraph as its children; printing `</name1>` there would
 * add text DMOJ never shows. Real HTML elements are almost always written with their closing
 * tag, so those keep it and made-up ones do not.
 */
const KNOWN_HTML = new Set([
  "a",
  "abbr",
  "address",
  "area",
  "article",
  "aside",
  "audio",
  "b",
  "base",
  "bdi",
  "bdo",
  "big",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "center",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "embed",
  "fieldset",
  "figcaption",
  "figure",
  "font",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "link",
  "main",
  "map",
  "mark",
  "marquee",
  "menu",
  "meta",
  "meter",
  "nav",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "param",
  "picture",
  "pre",
  "progress",
  "q",
  "rb",
  "rp",
  "rt",
  "rtc",
  "ruby",
  "s",
  "samp",
  "script",
  "search",
  "section",
  "select",
  "slot",
  "small",
  "source",
  "span",
  "strike",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "svg",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "track",
  "tt",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
]);

function serialiseAttributes(node: Element): string {
  const parts: string[] = [];

  for (const [name, value] of Object.entries(node.properties ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    const attribute = name === "className" ? "class" : name;

    if (value === true) {
      parts.push(` ${attribute}`);
      continue;
    }

    const text = Array.isArray(value) ? value.join(" ") : String(value);
    parts.push(` ${attribute}="${text.replaceAll('"', "&quot;")}"`);
  }

  return parts.join("");
}

const rehypeEscapeDisallowed: Plugin<[EscapeDisallowedOptions], Root> = function rehypeEscapeDisallowed(
  options,
) {
  const allowed = new Set(options.tagNames);

  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent: Parent | undefined) => {
      if (!parent || index === undefined) return;

      if (allowed.has(node.tagName)) return;

      const replacement: ElementContent[] = [
        { type: "text", value: `<${node.tagName}${serialiseAttributes(node)}>` },
        ...node.children,
      ];

      if (KNOWN_HTML.has(node.tagName)) {
        replacement.push({ type: "text", value: `</${node.tagName}>` });
      }

      parent.children.splice(index, 1, ...(replacement as RootContent[]));

      return index;
    });
  };
};

export default rehypeEscapeDisallowed;

export { rehypeEscapeDisallowed };
