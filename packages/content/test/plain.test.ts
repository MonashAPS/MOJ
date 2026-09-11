import { describe, expect, it } from "vitest";
import { extractSummary, renderPlain } from "../src/index.js";
import { loadFixtures } from "./helpers.js";

describe("renderPlain", () => {
  it("strips markup and keeps the maths source", () => {
    expect(renderPlain("**Bold** and ~n \\le 10~ and `code`.")).toBe("Bold and n \\le 10 and code.");
  });

  it("leaves sample IO out", () => {
    expect(renderPlain("Prose.\n\n```\n1 2 3\n```\n\nMore prose.")).toBe("Prose.\nMore prose.");
  });

  it("keeps code when asked", () => {
    expect(renderPlain("Prose.\n\n```\n1 2\n```", { includeCode: true })).toContain("1 2");
  });

  it("puts a line break between blocks", () => {
    expect(renderPlain("One.\n\nTwo.")).toBe("One.\nTwo.");
  });

  it("drops raw HTML", () => {
    expect(renderPlain('<img src="x.png">\n\nProse.')).toBe("Prose.");
  });
});

describe("extractSummary", () => {
  it("takes the first paragraph", () => {
    expect(extractSummary("First paragraph.\n\nSecond paragraph.")).toBe("First paragraph.");
  });

  it("skips a leading heading", () => {
    expect(extractSummary("# Title\n\nThe description.")).toBe("The description.");
  });

  it("truncates on a word boundary", () => {
    const summary = extractSummary("alpha beta gamma delta epsilon", { maxLength: 16 });
    expect(summary).toBe("alpha beta…");
  });

  it("leaves short text alone", () => {
    expect(extractSummary("Short.", { maxLength: 200 })).toBe("Short.");
  });

  it("produces something for every fixture", async () => {
    for (const fixture of await loadFixtures()) {
      const summary = extractSummary(fixture.source);
      expect(summary.length, fixture.code).toBeGreaterThan(0);
      expect(summary.length, fixture.code).toBeLessThanOrEqual(201);
      expect(summary, fixture.code).not.toContain("\n");
    }
  });
});
