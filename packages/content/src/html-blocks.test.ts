import { afterAll, describe, expect, it } from "vitest";
import { loosenHtmlBlocks } from "./html-blocks.js";
import { disposeHighlighters, renderMarkdown } from "./index.js";

afterAll(async () => {
  await disposeHighlighters();
});

async function html(source: string, preset = "solution"): Promise<string> {
  return (await renderMarkdown(source, preset, { highlight: false })).html;
}

describe("markdown inside a disclosure", () => {
  it("is parsed even with no blank line to separate it", async () => {
    const source = [
      "<details>",
      "<summary>View solution</summary>",
      "Sort, then **scan**.",
      "</details>",
    ].join("\n");

    expect(await html(source)).toBe(
      [
        "<details>",
        "<summary>View solution</summary>",
        "<p>Sort, then <strong>scan</strong>.</p>",
        "</details>",
      ].join("\n"),
    );
  });

  it("is parsed when the disclosure opens and titles itself on one line", async () => {
    const source = ["<details><summary>View solution</summary>", "- one", "- two", "</details>"].join("\n");
    const rendered = await html(source);

    expect(rendered).toContain("<li>one</li>");
    expect(rendered).toContain("<details><summary>View solution</summary>");
  });

  it("renders the same as it always did when the blank lines are already there", async () => {
    const loose = [
      "<details>",
      "<summary>View solution</summary>",
      "",
      "Sort, then **scan**.",
      "",
      "</details>",
    ];

    const tight = ["<details>", "<summary>View solution</summary>", "Sort, then **scan**.", "</details>"];

    expect(await html(tight.join("\n"))).toBe(await html(loose.join("\n")));
  });

  it("is left as written where the preset escapes raw HTML", async () => {
    // A comment prints its HTML back to the reader, so a blank line inserted
    // here would be one the writer never typed.
    const source = [
      "<details>",
      "<summary>View solution</summary>",
      "Sort, then **scan**.",
      "</details>",
    ].join("\n");

    expect(await html(source, "comment")).not.toContain("<strong>");
  });
});

describe("loosenHtmlBlocks", () => {
  it("leaves a source with no disclosure in it untouched", () => {
    const source = "# Title\n\nA paragraph with <span>markup</span> in it.\n";

    expect(loosenHtmlBlocks(source)).toBe(source);
  });

  it("leaves a disclosure written inside a fenced code block alone", () => {
    const source = ["```html", "<details>", "<summary>x</summary>", "</details>", "```"].join("\n");

    expect(loosenHtmlBlocks(source)).toBe(source);
  });

  it("leaves prose that happens to mention a tag alone", () => {
    // The tag has to open the line, or a sentence ending in one would be split
    // into two paragraphs.
    const source = "Wrap the solution in a <details>";

    expect(loosenHtmlBlocks(source)).toBe(source);
  });

  it("leaves a disclosure written on one line alone", () => {
    const source = "<details><summary>x</summary> the answer </details>";

    expect(loosenHtmlBlocks(source)).toBe(source);
  });

  it("keeps the attributes on an open disclosure", () => {
    expect(loosenHtmlBlocks("<details open>\ntext\n</details>")).toBe("<details open>\n\ntext\n\n</details>");
  });

  it("adds no second blank line where one is already there", () => {
    const source = "<details>\n\ntext\n\n</details>";

    expect(loosenHtmlBlocks(source)).toBe(source);
  });
});
