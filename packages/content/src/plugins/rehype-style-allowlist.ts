/**
 * Filters `style` attributes down to the CSS properties bleach's `CSSSanitizer` allows.
 *
 * `rehype-sanitize` treats `style` as an opaque string, so this runs just before it and does
 * what DMOJ's `CSSSanitizer(allowed_css_properties=all_styles)` does: keep known properties,
 * drop everything else, and refuse values that could smuggle a URL or an expression.
 */

import type { Element, Root } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import { ALLOWED_STYLE_PREFIXES, ALLOWED_STYLE_PROPERTIES } from "../sanitize/schema.js";

const DANGEROUS_VALUE = /url\s*\(|expression\s*\(|javascript\s*:|@import|\\/i;

export function filterStyle(value: string): string {
  const kept: string[] = [];

  for (const declaration of value.split(";")) {
    const index = declaration.indexOf(":");

    if (index < 0) continue;
    const property = declaration.slice(0, index).trim();
    const propertyValue = declaration.slice(index + 1).trim();

    if (!property || !propertyValue) continue;

    if (DANGEROUS_VALUE.test(propertyValue)) continue;

    const allowed =
      ALLOWED_STYLE_PROPERTIES.has(property.toLowerCase()) ||
      ALLOWED_STYLE_PREFIXES.some((prefix) => property.startsWith(prefix));

    if (!allowed) continue;
    kept.push(`${property}: ${propertyValue}`);
  }

  return kept.length > 0 ? `${kept.join("; ")};` : "";
}

const rehypeStyleAllowlist: Plugin<[], Root> = function rehypeStyleAllowlist() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const style = node.properties?.style;

      if (typeof style !== "string") return;
      const filtered = filterStyle(style);

      if (filtered) node.properties.style = filtered;
      else delete node.properties.style;
    });
  };
};

export default rehypeStyleAllowlist;

export { rehypeStyleAllowlist };
