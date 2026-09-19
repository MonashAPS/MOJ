import { afterAll, describe, expect, it } from "vitest";
import { disposeHighlighters, renderMarkdown } from "../index.js";

afterAll(async () => {
  await disposeHighlighters();
});

async function html(source: string, preset = "solution"): Promise<string> {
  return (await renderMarkdown(source, preset, { highlight: false })).html;
}

const SPOILER = '<span class="spoiler" tabindex="0">';

describe("||spoilers||", () => {
  it("hides what is written between the markers", async () => {
    expect(await html("The answer is ||42||.")).toBe(`<p>The answer is ${SPOILER}42</span>.</p>`);
  });

  it("keeps the markdown inside it markdown", async () => {
    // The reason this is a tree transform: a construct that swallowed the run
    // would hand KaTeX and the bold back as the characters they were typed as.
    expect(await html("||the answer is **7**||")).toBe(
      `<p>${SPOILER}the answer is <strong>7</strong></span></p>`,
    );
  });

  it("hides a code span's box as well as its text", async () => {
    expect(await html("Use ||`std::sort`||.")).toBe(`<p>Use ${SPOILER}<code>std::sort</code></span>.</p>`);
  });

  it("works in a comment, where raw HTML does not", async () => {
    expect(await html("Try ||binary search||.", "comment")).toBe(
      `<p>Try ${SPOILER}binary search</span>.</p>`,
    );
  });
});

describe("markers that are not spoilers", () => {
  it("leaves a C++ or in a code block alone", async () => {
    expect(await html("```cpp\nif (a || b) return;\n```")).toContain("if (a || b) return;");
  });

  it("leaves a C++ or in a code span alone", async () => {
    expect(await html("The operator `a || b` is fine.")).toBe(
      "<p>The operator <code>a || b</code> is fine.</p>",
    );
  });

  it("leaves a marker with no partner as the characters it was written as", async () => {
    expect(await html("One marker only ||here.")).toBe("<p>One marker only ||here.</p>");
  });

  it("does not pair across a paragraph break", async () => {
    expect(await html("First ||para.\n\nSecond|| para.")).toBe("<p>First ||para.</p>\n<p>Second|| para.</p>");
  });

  it("hides nothing for an empty pair", async () => {
    expect(await html("Nothing to see: ||||")).toBe("<p>Nothing to see: ||||</p>");
  });
});

describe("more than two markers on a line", () => {
  it("pairs each opener with the next marker", async () => {
    // Discord's reading, and the only one that does not need lookahead.
    expect(await html("||a ||b|| c||")).toBe(`<p>${SPOILER}a </span>b${SPOILER} c</span></p>`);
  });
});

describe("what a spoiler is worth off the page", () => {
  it("reads as its content in the plain-text projection", async () => {
    // og:description and the search index want the words, not the markers.
    const { meta } = await renderMarkdown("The answer is ||42||.", "solution", { highlight: false });

    expect(meta.plain).toBe("The answer is 42.");
  });
});
