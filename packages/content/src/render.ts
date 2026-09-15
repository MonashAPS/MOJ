/**
 * `renderMarkdown` is MOJ's replacement for DMOJ's `markdown` Jinja filter.
 *
 * The pipeline mirrors `judge/jinja2/markdown/__init__.py` step for step:
 *
 *   remark-parse            mistune.Markdown
 *   remark-gfm              tables, strikethrough, autolinks
 *   remarkTildeMath         MathInlineGrammar (`~x~`, `\(x\)`, `\[x\]`, `$$x$$`)
 *   remark-math             `$x$`, plus block `$$`
 *   heading demotion        AwesomeRenderer.header
 *   HTML escaping           mistune `escape=True` for the `safe_mode` styles
 *   remark-rehype           -
 *   rehype-raw              mistune `parse_block_html` / `parse_inline_html`
 *   rehype-katex            MathoidMathParser, but rendered in-process
 *   Shiki                   judge.highlight_code (Pygments, `codehilite`)
 *   table wrapper           AwesomeRenderer.table
 *   nofollow                AwesomeRenderer._link_rel
 *   lazy images             judge.jinja2.markdown.lazy_load
 *   camo                    judge.utils.camo
 *   [user:] references      judge.jinja2.reference.reference
 *   rehype-sanitize         bleach.Cleaner with the style's allowlist
 */

import type { Root as HastRoot } from "hast";
import type { Root as MdastRoot } from "mdast";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { bundledLanguages, createHighlighter, type Highlighter } from "shiki";
import { type PluggableList, unified } from "unified";

import { plainTextFromMdast, type SummaryOptions, truncateSummary } from "./plain.js";
import { collectFenceLanguages, normaliseLanguage, rehypeCodehilite } from "./plugins/rehype-codehilite.js";
import {
  type CamoOptions,
  rehypeAbsolutify,
  rehypeCamo,
  rehypeLazyImages,
  rehypeNofollow,
  rehypeScrollableTables,
  rehypeTidyTables,
  rehypeUserReferences,
  type UserReference,
} from "./plugins/rehype-dmoj.js";
import { rehypeEscapeDisallowed } from "./plugins/rehype-escape-disallowed.js";
import { rehypeStyleAllowlist } from "./plugins/rehype-style-allowlist.js";
import {
  type CollectedHeading,
  emptyCollectedMeta,
  remarkCollect,
  remarkDemoteHeadings,
  remarkEscapeHtml,
} from "./plugins/remark-dmoj.js";
import remarkTildeMath from "./plugins/remark-tilde-math.js";
import { type Preset, presetConfig } from "./presets.js";
import { MATHML_TAGS } from "./sanitize/bleach-whitelist.js";
import { USER_SAFE_TAGS, userSafeSchema } from "./sanitize/schema.js";

export interface ShikiThemes {
  readonly light: string;
  readonly dark: string;
}

export interface RenderOptions {
  /** Override the preset's `rel="nofollow"` behaviour. */
  readonly nofollow?: boolean;
  /** Hosts exempt from `rel="nofollow"`, DMOJ's `NOFOLLOW_EXCLUDED`. */
  readonly nofollowExcluded?: readonly string[];
  /** Override the preset's heading demotion (DMOJ demotes every style by two). */
  readonly demoteHeadings?: number;
  /** Add `loading="lazy"` to images. On by default. */
  readonly lazyLoadImages?: boolean;
  /** Proxy remote images through camo, as DMOJ does when `DMOJ_CAMO_URL` is set. */
  readonly camo?: CamoOptions | null;
  /** Profile URL builder for `[user:name]`; defaults to `/user/<name>`. */
  readonly userHref?: (username: string) => string;
  /** Resolve relative links and images against this URL, for the printable statement. */
  readonly baseUrl?: string;
  /** Turn syntax highlighting off, e.g. for a fast preview. */
  readonly highlight?: boolean;
  readonly themes?: ShikiThemes;
  /** Extra KaTeX macros, passed straight through. */
  readonly katexMacros?: Record<string, string>;
  /** `$x$` inline maths. DMOJ has no single-dollar rule; MOJ enables it per the spec. */
  readonly singleDollarMath?: boolean;
  readonly summary?: SummaryOptions;
}

export interface RenderMeta {
  readonly headings: readonly CollectedHeading[];
  readonly images: readonly string[];
  readonly links: readonly string[];
  readonly userReferences: readonly UserReference[];
  readonly math: {
    readonly inline: number;
    readonly display: number;
    readonly tilde: number;
    readonly paren: number;
    readonly bracket: number;
    readonly dollar: number;
  };
  readonly codeLanguages: readonly string[];
  readonly unknownCodeLanguages: readonly string[];
  readonly hasRawHtml: boolean;
  readonly wordCount: number;
  readonly plain: string;
  readonly summary: string;
}

export interface RenderResult {
  readonly html: string;
  readonly meta: RenderMeta;
}

export const DEFAULT_THEMES: ShikiThemes = { light: "github-light", dark: "github-dark" };

const highlighters = new Map<string, Promise<Highlighter>>();

async function getHighlighter(themes: ShikiThemes): Promise<Highlighter> {
  const key = `${themes.light}|${themes.dark}`;
  let existing = highlighters.get(key);

  if (!existing) {
    existing = createHighlighter({ themes: [themes.light, themes.dark], langs: [] });
    highlighters.set(key, existing);
  }

  return existing;
}

function isBundled(language: string): boolean {
  return Object.hasOwn(bundledLanguages, language);
}

/** Releases the cached Shiki highlighters; useful at the end of a test run or a CLI. */
export async function disposeHighlighters(): Promise<void> {
  const pending = [...highlighters.values()];
  highlighters.clear();

  for (const promise of pending) (await promise).dispose();
}

/**
 * Runs a list of transformers over a tree.
 *
 * The pipeline is assembled from optional pieces and crosses the mdast/hast boundary in the
 * middle, which unified's generic `Processor` type cannot follow, so the trees are typed at
 * the call site instead.
 */
async function runPlugins<T>(plugins: PluggableList, tree: unknown): Promise<T> {
  return (await unified()
    .use(plugins)
    .run(tree as never)) as unknown as T;
}

function parseMdast(source: string, singleDollar: boolean): MdastRoot {
  return (
    unified()
      .use(remarkParse)
      .use(remarkGfm, { singleTilde: false })
      // `remark-math` first: micromark tries extension constructs newest-first, so registering
      // `remarkTildeMath` afterwards is what puts its `$$` rule ahead of `remark-math`'s.
      .use(remarkMath, { singleDollarTextMath: singleDollar })
      .use(remarkTildeMath)
      .parse(source)
  );
}

export async function renderMarkdown(
  source: string,
  preset: Preset | string = "default",
  options: RenderOptions = {},
): Promise<RenderResult> {
  const config = presetConfig(preset);
  const collected = emptyCollectedMeta();
  const userReferences: UserReference[] = [];
  const codeLanguages = new Set<string>();
  const unknownCodeLanguages = new Set<string>();

  const demoteBy = options.demoteHeadings ?? config.demoteHeadings;
  const nofollow = options.nofollow ?? config.nofollow;
  const lazy = options.lazyLoadImages ?? true;
  const themes = options.themes ?? DEFAULT_THEMES;
  const highlight = options.highlight ?? true;
  const singleDollar = options.singleDollarMath ?? true;

  const mdast = parseMdast(source, singleDollar);

  const toHast: PluggableList = [[remarkCollect, { into: collected, demoteBy }]];

  // `safe_mode` styles print raw HTML instead of parsing it.
  if (!config.rawHtml) toHast.push(remarkEscapeHtml);
  toHast.push([remarkDemoteHeadings, { by: demoteBy }]);
  toHast.push([remarkRehype, { allowDangerousHtml: config.rawHtml }]);
  toHast.push(rehypeTidyTables);

  if (config.rawHtml) toHast.push(rehypeRaw);

  const tree = await runPlugins<HastRoot>(toHast, mdast);

  let highlighter: Highlighter | undefined;

  if (highlight) {
    const wanted = collectFenceLanguages(tree).filter(isBundled);
    highlighter = await getHighlighter(themes);
    const loaded = new Set(highlighter.getLoadedLanguages());
    const missing = wanted.filter((language) => !loaded.has(language));

    if (missing.length > 0) await highlighter.loadLanguage(...(missing as never[]));
  }

  const toHtml: PluggableList = [
    [
      rehypeKatex,
      {
        output: "htmlAndMathml",
        strict: "ignore",
        ...(options.katexMacros ? { macros: options.katexMacros } : {}),
      },
    ],
  ];

  if (highlighter) {
    const active = highlighter;
    toHtml.push([
      rehypeCodehilite,
      {
        highlighter: active,
        themes,
        isSupported: (language: string) =>
          isBundled(language) && active.getLoadedLanguages().includes(language),
        onLanguage: (language: string, ok: boolean) => {
          codeLanguages.add(language);

          if (!ok) unknownCodeLanguages.add(language);
        },
      },
    ]);
  }

  toHtml.push(rehypeScrollableTables);

  if (nofollow) toHtml.push([rehypeNofollow, { excluded: options.nofollowExcluded ?? [] }]);

  if (lazy) toHtml.push(rehypeLazyImages);

  if (config.camo && options.camo) toHtml.push([rehypeCamo, options.camo]);
  toHtml.push([
    rehypeUserReferences,
    {
      ...(options.userHref ? { href: options.userHref } : {}),
      onReference: (reference: UserReference) => userReferences.push(reference),
    },
  ]);

  if (options.baseUrl) toHtml.push([rehypeAbsolutify, { base: options.baseUrl }]);

  if (config.sanitise === "user-safe") {
    toHtml.push([rehypeEscapeDisallowed, { tagNames: [...USER_SAFE_TAGS, ...MATHML_TAGS] }]);
    toHtml.push(rehypeStyleAllowlist);
    toHtml.push([rehypeSanitize, userSafeSchema()]);
  }

  const finalTree = await runPlugins<HastRoot>(toHtml, tree);
  const output = unified().use(rehypeStringify).stringify(finalTree);

  const plain = plainTextFromMdast(mdast);

  return {
    html: output,
    meta: {
      headings: collected.headings,
      images: collected.images,
      links: collected.links,
      userReferences,
      math: collected.math,
      codeLanguages: [...codeLanguages],
      unknownCodeLanguages: [...unknownCodeLanguages],
      hasRawHtml: collected.hasRawHtml,
      wordCount: plain ? plain.split(/\s+/).length : 0,
      plain,
      summary: truncateSummary(plain, options.summary),
    },
  };
}

export interface PlainOptions extends SummaryOptions {
  readonly singleDollarMath?: boolean;
}

/** Statement prose with the markup removed, for `og:description` and search. */
export function renderPlain(source: string, options: PlainOptions = {}): string {
  const mdast = parseMdast(source, options.singleDollarMath ?? true);

  return plainTextFromMdast(mdast, options);
}

/** The first prose of a statement, truncated on a word boundary. DMOJ cuts at 200. */
export function extractSummary(source: string, options: SummaryOptions = {}): string {
  const mdast = parseMdast(source, true);
  const firstParagraph = mdast.children.find((node) => node.type === "paragraph");

  const text = firstParagraph
    ? plainTextFromMdast({ type: "root", children: [firstParagraph] }, options)
    : plainTextFromMdast(mdast, options);

  return truncateSummary(text, options);
}

export function normaliseCodeLanguage(language: string): string {
  return normaliseLanguage(language);
}

export type { CamoOptions, CollectedHeading, UserReference };

export { presetConfig };
