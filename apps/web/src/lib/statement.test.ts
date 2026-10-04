import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderMarkdown } from "@moj/content";
import { describe, expect, it } from "vitest";
import { decorateStatement, extractSamples } from "./statement";

/**
 * The path `/problem/[code]` renders with, and the one the console's statement
 * preview has to match: `renderMarkdown`, then `decorateStatement`. The fixture
 * is the aplusb statement a fresh deployment ships with, so a change to either
 * half shows up here as the sample boxes disappearing.
 */

const APLUSB = join(import.meta.dirname, "../../../../infra/problems/aplusb/statement.md");

async function statement(): Promise<string> {
  const { html } = await renderMarkdown(readFileSync(APLUSB, "utf8"), "problem");

  return decorateStatement(html);
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("decorateStatement", () => {
  it("frames both sample pairs of the aplusb statement", async () => {
    const html = await statement();

    expect(count(html, 'data-sample-role="input"')).toBe(2);
    expect(count(html, 'data-sample-role="output"')).toBe(2);
    expect(html).toContain(">Input 1<");
    expect(html).toContain(">Output 1<");
    expect(html).toContain(">Input 2<");
    expect(html).toContain(">Output 2<");
  });

  it("gives every framed block a copy button over its own code", async () => {
    const html = await statement();

    expect(count(html, "data-statement-copy")).toBe(4);
    expect(count(html, "data-statement-code")).toBe(4);
    expect(html).toContain('aria-label="Copy input 1"');
    expect(html).toContain('aria-label="Copy output 2"');
  });

  it("keeps the sample bodies inside the frames", async () => {
    const html = await statement();
    const first = html.slice(html.indexOf('data-sample-role="input"'));

    expect(first.slice(0, first.indexOf("</figure>"))).toContain("1 2");
  });

  it("drops the Input heading of a pair while keeping the Example above it", () => {
    const html = decorateStatement(
      "<h2>Example 1</h2><h3>Input</h3><pre>10 15</pre><h3>Output</h3><pre>25</pre>",
    );

    expect(html).toContain("<h2>Example 1</h2>");
    expect(html).not.toContain("<h3>Input</h3>");
    expect(html).not.toContain("<h3>Output</h3>");
  });

  it("keeps the Input heading of a sample that has no output beside it", () => {
    const html = decorateStatement("<h3>Input</h3><pre>10 15</pre><p>And that is all.</p>");

    expect(html).toContain("<h3>Input</h3>");
  });

  it("leaves a statement with no code blocks alone", () => {
    expect(decorateStatement("<p>No samples here.</p>")).toBe("<p>No samples here.</p>");
    expect(decorateStatement("")).toBe("");
  });
});

describe("extractSamples", () => {
  it("takes both samples of the aplusb statement as files", async () => {
    const { html } = await renderMarkdown(readFileSync(APLUSB, "utf8"), "problem");
    const samples = extractSamples(html);

    expect(samples).toHaveLength(2);
    expect(samples[0]?.input).toBe("1 2\n");
    expect(samples[0]?.output).toBe("3\n");
  });

  it("pairs across the prose a statement puts between the two halves", () => {
    const samples = extractSamples(
      "<h3>Input</h3><pre>4</pre><p>The answer is the sum.</p><h3>Output</h3><pre>7</pre>",
    );

    expect(samples).toEqual([{ input: "4\n", output: "7\n" }]);
  });

  it("decodes what the renderer escaped", () => {
    const samples = extractSamples(
      "<h3>Input</h3><pre>a &lt; b &amp;&amp; c</pre><h3>Output</h3><pre>&quot;yes&quot;</pre>",
    );

    expect(samples).toEqual([{ input: "a < b && c\n", output: '"yes"\n' }]);
  });

  it("strips the syntax highlighting the renderer wraps lines in", () => {
    const samples = extractSamples(
      '<h3>Input</h3><div class="codehilite"><pre><span class="n">5</span> <span class="n">6</span></pre></div>' +
        "<h3>Output</h3><pre>11</pre>",
    );

    expect(samples[0]?.input).toBe("5 6\n");
  });

  it("finds none where a statement shows code but no sample", () => {
    expect(extractSamples("<h3>Notes</h3><pre>int main() {}</pre>")).toEqual([]);
  });

  it("leaves an input with no output of its own unpaired", () => {
    expect(extractSamples("<h3>Input</h3><pre>1</pre>")).toEqual([]);
  });
});

it("resolves statement images and files against the standalone page while keeping fragments local", () => {
  const html =
    '<img src="diagram.png"><a href="file/data.txt?x=1&amp;y=2">File</a><a href="#sample">Sample</a><img src="/media/a.png"><a href="https://example.com">External</a>';

  const rendered = decorateStatement(html, "/problem/alpha/");
  expect(rendered).toContain('src="/problem/alpha/diagram.png"');
  expect(rendered).toContain('href="/problem/alpha/file/data.txt?x=1&amp;y=2"');
  expect(rendered).toContain('href="#sample"');
  expect(rendered).toContain('src="/media/a.png"');
  expect(rendered).toContain('href="https://example.com"');
});

it.each(["/problem/alpha/", "/problem/alpha/editorial/"])(
  "resolves sanitized media URLs against %s",
  async (basePath) => {
    const { html } = await renderMarkdown(
      '<video controls src="files/1/clip.mp4" poster="files/2/poster.png"></video>' +
        '<audio controls src="files/3/sample.wav"><source src="files/4/sample.ogg" type="audio/ogg"></audio>' +
        '<picture><source srcset="files/5/small.webp 1x, files/6/large.webp 2x"><img src="files/7/fallback.png"></picture>',
      "problem",
    );

    const rendered = decorateStatement(html, basePath);
    expect(rendered).toContain(`src="${basePath}files/1/clip.mp4"`);
    expect(rendered).toContain(`poster="${basePath}files/2/poster.png"`);
    expect(rendered).toContain(`src="${basePath}files/3/sample.wav"`);
    expect(rendered).toContain(`src="${basePath}files/4/sample.ogg"`);
    expect(rendered).toContain(`srcset="${basePath}files/5/small.webp 1x, ${basePath}files/6/large.webp 2x"`);
    expect(rendered).toContain(`src="${basePath}files/7/fallback.png"`);
  },
);

it("preserves absolute media URLs and srcset descriptors while resolving relative candidates", () => {
  const html =
    '<video src="https://example.com/clip.mp4" poster="/media/poster.png"></video>' +
    '<audio src="//example.com/sample.wav"></audio>' +
    '<source srcset="data:image/png;base64,AAAA 1x, large.png 2x, /media/wide.png 1200w, https://example.com/a,b.png 1600w">' +
    '<source srcset="small.png, large.png 2x">';

  const rendered = decorateStatement(html, "/problem/alpha/");
  expect(rendered).toContain('src="https://example.com/clip.mp4"');
  expect(rendered).toContain('poster="/media/poster.png"');
  expect(rendered).toContain('src="//example.com/sample.wav"');
  expect(rendered).toContain(
    'srcset="data:image/png;base64,AAAA 1x, /problem/alpha/large.png 2x, /media/wide.png 1200w, https://example.com/a,b.png 1600w"',
  );
  expect(rendered).toContain('srcset="/problem/alpha/small.png, /problem/alpha/large.png 2x"');
});
