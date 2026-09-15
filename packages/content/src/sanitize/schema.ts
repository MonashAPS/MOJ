/**
 * `rehype-sanitize` schemas equal to DMOJ's bleach allowlists.
 *
 * DMOJ builds its cleaner in `judge.jinja2.markdown.get_cleaner` from the `bleach` dict on the
 * markdown style: `tags` (BLEACH_USER_SAFE_TAGS), `attributes` (BLEACH_USER_SAFE_ATTRS),
 * `styles: True` (every CSS property in `bleach_whitelist.all_styles`) and `mathml: True`
 * (`mathml_tags` and `mathml_attrs` are merged in).
 *
 * `hast-util-sanitize` matches on hast *property* names rather than attribute names, so every
 * allowed attribute is registered under both spellings.
 */

import type { Schema } from "hast-util-sanitize";
import { ALL_STYLES, MATHML_ATTRS, MATHML_TAGS } from "./bleach-whitelist.js";

/** dmoj/settings.py BLEACH_USER_SAFE_TAGS. */
export const USER_SAFE_TAGS: readonly string[] = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "b",
  "i",
  "strong",
  "em",
  "tt",
  "del",
  "kbd",
  "s",
  "abbr",
  "cite",
  "mark",
  "q",
  "samp",
  "small",
  "u",
  "var",
  "wbr",
  "dfn",
  "ruby",
  "rb",
  "rp",
  "rt",
  "rtc",
  "sub",
  "sup",
  "time",
  "data",
  "p",
  "br",
  "pre",
  "span",
  "div",
  "blockquote",
  "code",
  "hr",
  "ul",
  "ol",
  "li",
  "dd",
  "dl",
  "dt",
  "address",
  "section",
  "details",
  "summary",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  "img",
  "audio",
  "video",
  "source",
  "a",
  "style",
  "noscript",
  "center",
];

/** An attribute allowlist: a tag name (or `*` for every element) to the attributes it keeps. */
interface AttributeAllowlist {
  readonly [tagName: string]: readonly string[];
}

/** dmoj/settings.py BLEACH_USER_SAFE_ATTRS. */
export const USER_SAFE_ATTRS = {
  "*": ["id", "class", "style"],
  img: ["src", "alt", "title", "width", "height", "data-src", "align"],
  a: ["href", "alt", "title"],
  abbr: ["title"],
  dfn: ["title"],
  time: ["datetime"],
  data: ["value"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  audio: ["autoplay", "controls", "crossorigin", "muted", "loop", "preload", "src"],
  video: [
    "autoplay",
    "controls",
    "crossorigin",
    "height",
    "muted",
    "loop",
    "poster",
    "preload",
    "src",
    "width",
  ],
  source: ["src", "srcset", "type"],
  li: ["value"],
} satisfies AttributeAllowlist;

/**
 * Attributes MOJ needs that DMOJ's list predates.
 *
 *   - `rel` on `a`: DMOJ adds `rel="nofollow"` in the renderer and then strips it again in
 *     bleach for the staff-editable styles. Keeping it is what the renderer intended.
 *   - `loading` on `img`: MOJ lazy-loads with the platform attribute instead of DMOJ's
 *     `blank.gif` + `unveil` JavaScript.
 *   - `data-username` / `data-rating` on `a`: the `[user:]` reference anchors the web app
 *     hydrates with rating colours.
 *   - `aria-hidden` everywhere and `tabindex` on `pre`: emitted by KaTeX and Shiki.
 */
export const MOJ_EXTRA_ATTRS = {
  "*": ["aria-hidden"],
  a: ["rel", "data-username", "data-rating"],
  img: ["loading", "decoding"],
  pre: ["tabindex"],
  span: ["data-line"],
} satisfies AttributeAllowlist;

const PROPERTY_NAMES = new Map<string, string>([
  ["class", "className"],
  ["for", "htmlFor"],
  ["colspan", "colSpan"],
  ["rowspan", "rowSpan"],
  ["crossorigin", "crossOrigin"],
  ["datetime", "dateTime"],
  ["srcset", "srcSet"],
  ["autoplay", "autoPlay"],
  ["tabindex", "tabIndex"],
  ["accesskey", "accessKey"],
  ["maxlength", "maxLength"],
  ["aria-hidden", "ariaHidden"],
]);

function camelise(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Every spelling `hast-util-sanitize` might see for one attribute. */
export function propertyNames(attribute: string): string[] {
  const names = new Set<string>([attribute]);
  const known = PROPERTY_NAMES.get(attribute);

  if (known) names.add(known);

  if (attribute.includes("-")) names.add(camelise(attribute));

  return [...names];
}

function mergeAttributeMaps(...maps: readonly AttributeAllowlist[]): Record<string, string[]> {
  const out = new Map<string, Set<string>>();

  for (const map of maps) {
    for (const [tag, attrs] of Object.entries(map)) {
      let set = out.get(tag);

      if (!set) {
        set = new Set();
        out.set(tag, set);
      }

      for (const attr of attrs) for (const name of propertyNames(attr)) set.add(name);
    }
  }

  return Object.fromEntries([...out].map(([tag, set]) => [tag, [...set]]));
}

/**
 * The `user-safe` schema: DMOJ's MARKDOWN_STAFF_EDITABLE_STYLE bleach parameters.
 *
 * MathML tags and attributes are merged in, which is also what lets KaTeX's `htmlAndMathml`
 * output through; the `katex*` and `codehilite` class names ride on the wildcard `class`
 * allowance that DMOJ grants every element.
 */
export function userSafeSchema(): Schema {
  return {
    tagNames: [...USER_SAFE_TAGS, ...MATHML_TAGS],
    attributes: mergeAttributeMaps(USER_SAFE_ATTRS, MOJ_EXTRA_ATTRS, MATHML_ATTRS),
    protocols: {
      // bleach's ALLOWED_PROTOCOLS, which DMOJ does not override.
      href: ["http", "https", "mailto"],
      src: ["http", "https"],
      cite: ["http", "https"],
      poster: ["http", "https"],
      srcSet: ["http", "https"],
    },
    ancestors: {},
    clobber: [],
    clobberPrefix: "",
    strip: ["script"],
    allowComments: false,
    allowDoctypes: false,
    required: {},
  };
}

/** CSS properties bleach's CSSSanitizer keeps when `styles: True`. */
export const ALLOWED_STYLE_PROPERTIES: ReadonlySet<string> = new Set(ALL_STYLES);

/** Custom properties Shiki writes for its dual-theme output. */
export const ALLOWED_STYLE_PREFIXES: readonly string[] = ["--shiki-"];
