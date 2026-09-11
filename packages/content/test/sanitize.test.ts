/**
 * Parity with DMOJ's own `judge/jinja2/markdown/test_markdown.py`, plus the checks the spec
 * asks for: nothing script-shaped survives the comment preset, and the KaTeX and Shiki output
 * the pipeline generates itself is not eaten by the allowlist.
 */

import { afterAll, describe, expect, it } from "vitest";
import { disposeHighlighters, PRESET_NAMES, presetAllowsRawHtml, renderMarkdown } from "../src/index.js";
import { filterStyle } from "../src/plugins/rehype-style-allowlist.js";
import { loadFixtures } from "./helpers.js";

afterAll(async () => {
  await disposeHighlighters();
});

/** A real tag carrying an inline event handler. */
const EVENT_ATTRIBUTE = /<[a-z][^>]*\son[a-z]+\s*=/i;
/** A real tag pointing an URL attribute at a script. */
const SCRIPT_URL = /<[a-z][^>]*(?:href|src|data|poster)\s*=\s*"?\s*javascript:/i;

const MATHML_N = `<math xmlns="http://www.w3.org/1998/Math/MathML">
<semantics>
<mi>N</mi>
<annotation encoding="application/x-tex">N</annotation>
</semantics>
</math>`;

describe("bleach parity", () => {
  it("escapes a script tag for the bleached styles", async () => {
    const { html } = await renderMarkdown("<script>void(0)</script>", "problem");
    expect(html).not.toContain("<script");
    // `rehype-stringify` escapes `<` and leaves `>` alone; the text is inert either way.
    expect(html).toBe("&#x3C;script>void(0)&#x3C;/script>");
  });

  it("keeps a script tag for the admin-editable styles", async () => {
    const { html } = await renderMarkdown("<script>void(0)</script>", "problem-full");
    expect(html).toContain("<script>void(0)</script>");
  });

  it("keeps allowed inline styles and drops the rest", async () => {
    const { html } = await renderMarkdown('<img style="display: block; margin: 0 auto">', "problem");
    expect(html).toContain('style="display: block; margin: 0 auto;"');
  });

  it("keeps a style element, which DMOJ's allowlist permits", async () => {
    const { html } = await renderMarkdown("<style>a { color: red; }</style>", "problem");
    expect(html).toContain("<style>a { color: red; }</style>");
  });

  it("keeps MathML", async () => {
    const { html } = await renderMarkdown(MATHML_N, "problem");
    expect(html).toContain("<math");
    expect(html).toContain('encoding="application/x-tex"');
    expect(html).toContain("<mi>N</mi>");
  });
});

describe("comment preset", () => {
  const attacks = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    '<a href="javascript:alert(1)">x</a>',
    "<iframe src=https://evil.test></iframe>",
    "<svg><script>alert(1)</script></svg>",
    "<style>@import url(https://evil.test)</style>",
    "<div onclick=alert(1)>x</div>",
    "<math><mtext><script>alert(1)</script></mtext></math>",
    "<!-- <script>alert(1)</script> -->",
    "<object data=https://evil.test></object>",
  ];

  for (const attack of attacks) {
    it(`neutralises ${attack.slice(0, 32)}`, async () => {
      const { html } = await renderMarkdown(attack, "comment");
      // Every `<` that survives escaping is `&#x3C;`, so a literal `<` means a real tag.
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<iframe/i);
      expect(html).not.toMatch(EVENT_ATTRIBUTE);
      expect(html).not.toMatch(SCRIPT_URL);
    });
  }

  it("escapes raw HTML into text rather than dropping it", async () => {
    const { html } = await renderMarkdown("before <b>bold</b> after", "comment");
    expect(html).toContain("&#x3C;b>bold&#x3C;/b>");
    expect(html).not.toContain("<b>");
  });

  it("still renders markdown, maths and code", async () => {
    const { html } = await renderMarkdown("**bold** ~n~ `code`", "comment");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('class="katex"');
    expect(html).toContain("<code>code</code>");
  });
});

describe("no script survives any user preset", () => {
  const userPresets = PRESET_NAMES.filter((preset) => preset !== "problem-full" && preset !== "flatpage");
  for (const preset of userPresets) {
    it(preset, async () => {
      const { html } = await renderMarkdown(
        '<script>alert(1)</script>\n\n<a href="javascript:alert(1)">x</a>',
        preset,
      );
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(SCRIPT_URL);
    });
  }
});

describe("presets", () => {
  it("allows raw HTML exactly where DMOJ's safe_mode is off", () => {
    const allowed = PRESET_NAMES.filter(presetAllowsRawHtml);
    expect([...allowed].sort()).toEqual([
      "blog",
      "contest",
      "contest-tag",
      "flatpage",
      "judge",
      "language",
      "license",
      "problem",
      "problem-full",
      "solution",
    ]);
  });
});

describe("style allowlist", () => {
  it("keeps known properties", () => {
    expect(filterStyle("color: red; margin: 0 auto")).toBe("color: red; margin: 0 auto;");
  });

  it("drops unknown properties and dangerous values", () => {
    expect(filterStyle("behavior: url(x)")).toBe("");
    expect(filterStyle("background: url(javascript:alert(1))")).toBe("");
    expect(filterStyle("width: expression(alert(1))")).toBe("");
  });

  it("keeps Shiki's dual-theme custom properties", () => {
    expect(filterStyle("--shiki-light: #24292e;--shiki-dark:#e1e4e8")).toBe(
      "--shiki-light: #24292e; --shiki-dark: #e1e4e8;",
    );
  });
});

describe("generated markup survives sanitising", () => {
  it("keeps KaTeX and Shiki output intact", async () => {
    const { html } = await renderMarkdown("~\\frac{a}{b}~\n\n```cpp\nint x;\n```", "problem");
    expect(html).toContain('class="katex"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<mfrac>");
    expect(html).toContain('<div class="codehilite">');
    expect(html).toContain("--shiki-dark");
  });

  it("leaves no script anywhere in the rendered corpus", async () => {
    for (const fixture of await loadFixtures()) {
      const { html } = await renderMarkdown(fixture.source, "problem");
      expect(html, fixture.code).not.toMatch(/<script/i);
      expect(html, fixture.code).not.toMatch(EVENT_ATTRIBUTE);
    }
  });
});
