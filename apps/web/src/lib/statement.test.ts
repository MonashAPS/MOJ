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
