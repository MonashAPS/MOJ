import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, SITE_LANGUAGES } from "@/lib/language";
import { isMessages, type Messages, NAMESPACES } from "./messages";

/**
 * The catalogue's own guard rails.
 *
 * A translation is a few thousand strings written by someone who cannot run the
 * site, so the failures are the ones nobody notices until a page throws: a
 * placeholder renamed on the way through, an angle bracket read as markup, a
 * plural category that does not exist in that language. Each of those is caught
 * here rather than in production.
 */

const ROOT = join(import.meta.dirname, "../../messages");

function read(locale: string, namespace: string): Messages | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(ROOT, locale, `${namespace}.json`), "utf8"));

    return isMessages(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Every message in a catalogue, flattened to `a.b.c` keys. */
function flatten(messages: Messages, prefix = ""): Map<string, string> {
  const flat = new Map<string, string>();

  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isMessages(value)) {
      for (const [inner, text] of flatten(value, path)) flat.set(inner, text);
    } else {
      flat.set(path, value);
    }
  }

  return flat;
}

/** The `{name}` arguments a message substitutes, and the `<tag>`s it carries. */
function placeholders(message: string): Set<string> {
  const found = new Set<string>();

  const walk = (nodes: MessageFormatElement[]): void => {
    for (const node of nodes) {
      if (node.type === TYPE.tag) {
        found.add(`<${node.value}>`);
        found.add(`{${node.value}}`);
        walk(node.children);
      } else if (node.type === TYPE.argument) {
        found.add(`{${node.value}}`);
      } else if (node.type === TYPE.select || node.type === TYPE.plural) {
        found.add(`{${node.value}}`);

        for (const option of Object.values(node.options)) walk(option.value);
      }
    }
  };

  walk(parse(message));

  return found;
}

const english = new Map<string, Map<string, string>>();

for (const namespace of NAMESPACES) {
  const messages = read(DEFAULT_LANGUAGE, namespace);

  if (messages) english.set(namespace, flatten(messages));
}

describe("the English catalogue", () => {
  it("covers every namespace the loader expects", () => {
    expect([...english.keys()].sort()).toEqual([...NAMESPACES].sort());
  });

  it("has no empty messages", () => {
    for (const [namespace, messages] of english) {
      for (const [key, text] of messages) {
        expect(text.trim(), `${namespace}.${key} is empty`).not.toBe("");
      }
    }
  });

  it("parses as ICU", () => {
    // An angle bracket reads as a tag, so a help string mentioning `<key>`
    // throws at render unless it is quoted. Better to fail here.
    for (const [namespace, messages] of english) {
      for (const [key, text] of messages) {
        expect(() => parse(text), `${namespace}.${key}: ${text}`).not.toThrow();
      }
    }
  });
});

const translations = SITE_LANGUAGES.map((l) => l.code).filter((code) => code !== DEFAULT_LANGUAGE);

describe.each(translations)("the %s catalogue", (locale) => {
  const present = readdirSync(join(ROOT, locale), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/, ""));

  it("is complete", () => {
    // A missing key falls back to English, which is the thing this release
    // exists to stop, so a gap is a failure rather than a warning.
    const missing: string[] = [];

    for (const [namespace, messages] of english) {
      const translated = flatten(read(locale, namespace) ?? {});

      for (const key of messages.keys()) {
        if (!translated.has(key)) missing.push(`${namespace}.${key}`);
      }
    }

    expect(missing, `${missing.length} untranslated`).toEqual([]);
  });

  it("parses as ICU", () => {
    for (const namespace of present) {
      for (const [key, text] of flatten(read(locale, namespace) ?? {})) {
        expect(() => parse(text), `${namespace}.${key}: ${text}`).not.toThrow();
      }
    }
  });

  it("keeps every placeholder the English has", () => {
    // Word order can move a placeholder and usually must; renaming or dropping
    // one leaves a hole in the sentence at run time.
    const wrong: string[] = [];

    for (const [namespace, messages] of english) {
      const translated = flatten(read(locale, namespace) ?? {});

      for (const [key, text] of messages) {
        const other = translated.get(key);

        if (other === undefined) continue;
        let mine: Set<string>;
        let theirs: Set<string>;

        try {
          mine = placeholders(text);
          theirs = placeholders(other);
        } catch {
          continue; // the parse test reports this one
        }

        for (const name of mine) {
          if (!theirs.has(name)) wrong.push(`${namespace}.${key} lost ${name}`);
        }
      }
    }

    expect(wrong, wrong.slice(0, 10).join("; ")).toEqual([]);
  });
});
