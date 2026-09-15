import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderMarkdown } from "@moj/content";
import { describe, expect, it } from "vitest";
import { decorateStatement } from "./statement";

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

  it("leaves a statement with no code blocks alone", () => {
    expect(decorateStatement("<p>No samples here.</p>")).toBe("<p>No samples here.</p>");
    expect(decorateStatement("")).toBe("");
  });
});
