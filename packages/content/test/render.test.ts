import { afterAll, describe, expect, it } from "vitest";
import { disposeHighlighters, renderMarkdown } from "../src/index.js";
import { countTildePairs, loadFixtures } from "./helpers.js";

const fixtures = await loadFixtures();

afterAll(async () => {
  await disposeHighlighters();
});

describe("statement fixtures", () => {
  for (const fixture of fixtures) {
    it(`renders ${fixture.code}`, async () => {
      const { html } = await renderMarkdown(fixture.source, "problem");
      await expect(html).toMatchFileSnapshot(`./__snapshots__/html/${fixture.code}.html`);
    });
  }

  for (const fixture of fixtures) {
    it(`counts every tilde pair in ${fixture.code}`, async () => {
      const { meta } = await renderMarkdown(fixture.source, "problem");
      expect(meta.math.tilde).toBe(countTildePairs(fixture.source));
    });
  }

  it("finds tilde maths in most of the corpus", async () => {
    let withTilde = 0;
    for (const fixture of fixtures) {
      if (countTildePairs(fixture.source) > 0) withTilde += 1;
    }
    expect(withTilde).toBeGreaterThan(fixtures.length / 2);
  });
});

describe("metadata", () => {
  it("reports headings, images, links and languages", async () => {
    const source = [
      "## Input",
      "",
      "Text with [a link](https://example.com) and ![a picture](/media/x.png).",
      "",
      "### Notes",
      "",
      "```python",
      "print(1)",
      "```",
    ].join("\n");
    const { meta } = await renderMarkdown(source, "problem");
    expect(meta.headings).toEqual([
      { depth: 4, text: "Input", id: "input" },
      { depth: 5, text: "Notes", id: "notes" },
    ]);
    expect(meta.images).toEqual(["/media/x.png"]);
    expect(meta.links).toEqual(["https://example.com"]);
    expect(meta.codeLanguages).toEqual(["python"]);
    expect(meta.unknownCodeLanguages).toEqual([]);
  });

  it("demotes headings by two, as AwesomeRenderer.header does", async () => {
    const { html } = await renderMarkdown("# One\n\n## Two\n\n##### Five", "problem");
    expect(html).toContain("<h3>One</h3>");
    expect(html).toContain("<h4>Two</h4>");
    // Clamped at six.
    expect(html).toContain("<h6>Five</h6>");
  });
});

describe("dmoj rewrites", () => {
  it("wraps tables in .h-scrollable-table with the .table skin", async () => {
    const { html } = await renderMarkdown("| a |\n| - |\n| 1 |", "problem");
    expect(html).toContain('<div class="h-scrollable-table"><table class="table">');
  });

  it("marks external links nofollow but leaves relative ones alone", async () => {
    const { html } = await renderMarkdown(
      "[out](https://example.com) [in](/problems/) [keep](https://judge.example.org/x)",
      "comment",
      { nofollowExcluded: ["judge.example.org"] },
    );
    expect(html).toContain('<a href="https://example.com" rel="nofollow">out</a>');
    expect(html).toContain('<a href="/problems/">in</a>');
    expect(html).toContain('<a href="https://judge.example.org/x">keep</a>');
  });

  it("lazy-loads images", async () => {
    const { html } = await renderMarkdown("![x](/media/x.png)", "problem");
    expect(html).toContain('loading="lazy"');
  });

  it("expands [user:] and [ruser:] references", async () => {
    const { html, meta } = await renderMarkdown("hi [user:alice] and [ruser:bob]", "comment");
    expect(html).toContain('<a class="user-link" href="/user/alice" data-username="alice">alice</a>');
    expect(html).toContain('data-rating="true"');
    expect(meta.userReferences).toEqual([
      { type: "user", username: "alice" },
      { type: "ruser", username: "bob" },
    ]);
  });

  it("leaves [user:] alone inside code", async () => {
    const { html } = await renderMarkdown("`[user:alice]`", "comment");
    expect(html).toContain("<code>[user:alice]</code>");
  });

  it("proxies remote images through camo", async () => {
    const { html } = await renderMarkdown("![x](http://example.com/a.png)", "problem", {
      camo: { server: "https://camo.test", key: "secret" },
    });
    expect(html).toContain('src="https://camo.test/');
    expect(html).not.toContain("http://example.com/a.png");
  });

  it("absolutifies links for the printable statement", async () => {
    const { html } = await renderMarkdown("[x](/problem/abc) ![y](/media/y.png)", "problem", {
      baseUrl: "https://judge.example.org/problem/abc/pdf",
    });
    expect(html).toContain('href="https://judge.example.org/problem/abc"');
    expect(html).toContain('src="https://judge.example.org/media/y.png"');
  });
});

describe("code highlighting", () => {
  it("wraps highlighted code in .codehilite with dual-theme variables", async () => {
    const { html } = await renderMarkdown("```cpp\nint x = 1;\n```", "problem");
    expect(html).toContain('<div class="codehilite">');
    expect(html).toContain("--shiki-light");
    expect(html).toContain("--shiki-dark");
  });

  it("falls back to a bare pre/code when there is no lexer", async () => {
    const { html } = await renderMarkdown("```notalanguage\nx\n```", "problem");
    expect(html).toContain("<pre><code>");
    expect(html).not.toContain("codehilite");
  });

  it("leaves fences without a language unhighlighted", async () => {
    const { html } = await renderMarkdown("```\nplain\n```", "problem");
    expect(html).toContain("<pre><code>plain");
  });
});

describe("maths", () => {
  it("renders KaTeX with MathML alongside the HTML", async () => {
    const { html } = await renderMarkdown("~n~", "problem");
    expect(html).toContain('class="katex-mathml"');
    expect(html).toContain("<math");
    expect(html).toContain('class="katex-html"');
  });

  it("does not throw on broken TeX", async () => {
    const { html } = await renderMarkdown("~\\frac{~", "problem");
    expect(html).toBeTypeOf("string");
    expect(html.length).toBeGreaterThan(0);
  });
});
