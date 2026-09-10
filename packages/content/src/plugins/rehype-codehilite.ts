/**
 * Syntax highlighting with Shiki, wrapped the way DMOJ's Pygments formatter wraps it.
 *
 * DMOJ calls `highlight_code(code, lang)`, which is
 * `pygments.formatters.HtmlFormatter(cssclass='codehilite', wrapcode=True)`, so the markup is
 * `<div class="codehilite"><pre><code>...</code></pre></div>`; when the language is missing or
 * Pygments has no lexer for it the block falls back to a bare `<pre><code>`. Both behaviours
 * are reproduced here, with Shiki's dual `github-light` / `github-dark` themes emitted as CSS
 * custom properties so one document works in both colour schemes.
 */

import type { Element, Root } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { Highlighter } from "shiki";

export interface CodehiliteOptions {
  readonly highlighter: Highlighter;
  readonly themes: { readonly light: string; readonly dark: string };
  readonly isSupported: (language: string) => boolean;
  /** Called with every fence language seen, resolved or not. */
  readonly onLanguage?: (language: string, highlighted: boolean) => void;
}

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  "c++": "cpp",
  "c#": "csharp",
  cc: "cpp",
  cxx: "cpp",
  py: "python",
  py3: "python",
  python3: "python",
  pypy: "python",
  pypy3: "python",
  js: "javascript",
  ts: "typescript",
  sh: "bash",
  shell: "bash",
  console: "bash",
  plain: "text",
  plaintext: "text",
  output: "text",
  input: "text",
  none: "text",
};

export function normaliseLanguage(language: string): string {
  const lower = language.trim().toLowerCase();
  return LANGUAGE_ALIASES[lower] ?? lower;
}

function languageOf(code: Element): string | undefined {
  const classes = code.properties?.className;
  const list = Array.isArray(classes) ? classes.map(String) : [];
  for (const name of list) {
    if (name.startsWith("language-")) return name.slice("language-".length);
  }
  return undefined;
}

function textOf(code: Element): string {
  let out = "";
  visit(code, "text", (node) => {
    out += node.value;
  });
  return out;
}

/** Collects the fence languages in a tree so the caller can preload them. */
export function collectFenceLanguages(tree: Root): string[] {
  const languages = new Set<string>();
  visit(tree, "element", (node: Element) => {
    if (node.tagName !== "pre") return;
    const code = node.children.find(
      (child): child is Element => child.type === "element" && child.tagName === "code",
    );
    if (!code) return;
    const language = languageOf(code);
    if (!language || language === "math") return;
    languages.add(normaliseLanguage(language));
  });
  return [...languages];
}

const rehypeCodehilite: Plugin<[CodehiliteOptions], Root> = function rehypeCodehilite(options) {
  const { highlighter, themes, isSupported, onLanguage } = options;

  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || !parent || index === undefined) return;
      const code = node.children.find(
        (child): child is Element => child.type === "element" && child.tagName === "code",
      );
      if (!code) return;

      const raw = languageOf(code);
      // `language-math` blocks belong to KaTeX, which has already had its turn.
      if (!raw || raw === "math") return;

      const language = normaliseLanguage(raw);
      if (!isSupported(language)) {
        onLanguage?.(language, false);
        // Pygments with no lexer: a plain `<pre><code>` and no `codehilite` wrapper.
        delete code.properties.className;
        return;
      }
      onLanguage?.(language, true);

      const highlighted = highlighter.codeToHast(textOf(code).replace(/\n$/, ""), {
        lang: language,
        themes: { light: themes.light, dark: themes.dark },
        defaultColor: false,
        cssVariablePrefix: "--shiki-",
      });

      const wrapper: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["codehilite"] },
        children: highlighted.children.filter(
          (child): child is Element => child.type === "element",
        ),
      };
      parent.children.splice(index, 1, wrapper);
      return index + 1;
    });
  };
};

export default rehypeCodehilite;
export { rehypeCodehilite };
