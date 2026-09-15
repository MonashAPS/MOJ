/**
 * The delimiter rules from DMOJ's `judge/jinja2/markdown/math.py`.
 */

import type { Root } from "mdast";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";
import { countTildePairs, loadFixtures } from "../test.helpers.js";
import remarkTildeMath from "./remark-tilde-math.js";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath, { singleDollarTextMath: true })
  .use(remarkTildeMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true });

function render(source: string): string {
  return String(processor.processSync(source));
}

interface MathNode {
  type: string;
  value: string;
  delimiter: string;
}

function mathNodes(source: string): MathNode[] {
  const tree = processor.parse(source) as Root;
  const found: MathNode[] = [];
  visit(tree, (node) => {
    if (node.type !== "inlineMath" && node.type !== "math") return;
    const data = (node as { data?: { mojDelimiter?: string } }).data;
    found.push({
      type: node.type,
      value: (node as { value: string }).value,
      delimiter: data?.mojDelimiter ?? "dollar",
    });
  });
  return found;
}

describe("delimiters", () => {
  it("reads ~x~ as inline maths", () => {
    expect(mathNodes("a ~n~ b")).toEqual([{ type: "inlineMath", value: "n", delimiter: "tilde" }]);
  });

  it("reads \\(x\\) as inline maths", () => {
    expect(mathNodes("a \\(n + 1\\) b")).toEqual([
      { type: "inlineMath", value: "n + 1", delimiter: "paren" },
    ]);
  });

  it("reads \\[x\\] as display maths", () => {
    expect(mathNodes("a \\[n\\] b")).toEqual([{ type: "math", value: "n", delimiter: "bracket" }]);
  });

  it("reads $$x$$ as display maths even inside a paragraph", () => {
    expect(mathNodes("a $$n$$ b")).toEqual([{ type: "math", value: "n", delimiter: "dollar" }]);
  });

  it("leaves $x$ to remark-math as inline maths", () => {
    expect(mathNodes("a $n$ b")).toEqual([{ type: "inlineMath", value: "n", delimiter: "dollar" }]);
  });

  it("keeps ~~strikethrough~~ working", () => {
    expect(render("~~gone~~")).toContain("<del>gone</del>");
    expect(mathNodes("~~gone~~")).toEqual([]);
  });

  it("handles strikethrough and maths in one line", () => {
    const html = render("~~gone~~ and ~n~");
    expect(html).toContain("<del>gone</del>");
    expect(html).toContain('class="language-math math-inline"');
  });

  it("keeps an escaped tilde literal", () => {
    expect(mathNodes("escaped \\~n\\~ here")).toEqual([]);
    expect(render("escaped \\~n\\~ here")).toContain("escaped ~n~ here");
  });

  it("does not let ~ span a line ending", () => {
    expect(mathNodes("one ~two\nthree~ four")).toEqual([]);
  });

  it("lets \\[...\\] span a line ending, as DMOJ's DOTALL rule does", () => {
    expect(mathNodes("a \\[x +\ny\\] b")).toEqual([{ type: "math", value: "x +\ny", delimiter: "bracket" }]);
  });

  it("ignores delimiters inside code", () => {
    expect(mathNodes("`~n~` and `$x$`")).toEqual([]);
    expect(mathNodes("```\n~n~\n```")).toEqual([]);
  });

  it("keeps backslashes inside maths", () => {
    expect(mathNodes("~a_i \\le 10^5~")[0]?.value).toBe("a_i \\le 10^5");
    expect(mathNodes("\\[\\frac{1}{2}\\]")[0]?.value).toBe("\\frac{1}{2}");
  });

  it("does not start maths on an unpaired tilde", () => {
    expect(mathNodes("a ~ b")).toEqual([]);
    expect(mathNodes("100~200 is a range")).toEqual([]);
  });

  it("handles several pairs on one line", () => {
    expect(mathNodes("~a~, ~b~ and ~c~").map((node) => node.value)).toEqual(["a", "b", "c"]);
  });

  it("still escapes other backslash escapes", () => {
    expect(render("\\*not emphasis\\*")).toContain("*not emphasis*");
  });
});

describe("corpus tilde counts", () => {
  it("matches an independent count of ~...~ pairs in every fixture", async () => {
    for (const fixture of await loadFixtures()) {
      const tilde = mathNodes(fixture.source).filter((node) => node.delimiter === "tilde").length;
      expect(tilde, fixture.code).toBe(countTildePairs(fixture.source));
    }
  });
});
