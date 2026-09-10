import { describe, expect, it } from "vitest";
import {
  booklet,
  defaultResolveImage,
  dropAllImages,
  markdownToTypst,
  normaliseForCmarker,
  renderPdf,
  typstAvailable,
  typstEscapeString,
} from "../src/index.js";
import { loadFixtures, placeholderAssets } from "./helpers.js";
import { pdfText } from "./pdf.js";

const fixtures = await loadFixtures();
const byCode = new Map(fixtures.map((fixture) => [fixture.code, fixture]));
const hasTypst = await typstAvailable();

function fixture(code: string) {
  const found = byCode.get(code);
  if (!found) throw new Error(`missing fixture ${code}`);
  return found;
}

describe("typst string escaping", () => {
  it("escapes quotes, backslashes and newlines", () => {
    expect(typstEscapeString('a "b" \\c\nd')).toBe('"a \\"b\\" \\\\c\\nd"');
  });

  it("escapes control characters", () => {
    expect(typstEscapeString("\u0007")).toBe('"\\u{7}"');
  });
});

describe("markdown normalisation", () => {
  it("rewrites every maths delimiter to dollars", () => {
    const { markdown } = normaliseForCmarker("~n~ and \\(m\\) and \\[k\\] and $$j$$ and $i$");
    expect(markdown).toContain("$n$");
    expect(markdown).toContain("$m$");
    expect(markdown).toContain("$$\nk\n$$");
    expect(markdown).toContain("$$\nj\n$$");
    expect(markdown).toContain("$i$");
    expect(markdown).not.toContain("~n~");
  });

  it("drops the title heading and lifts the sections", () => {
    const { markdown, title } = normaliseForCmarker("# The Name\n\n## Input\n\n### Note");
    expect(title).toBe("The Name");
    expect(markdown).not.toContain("# The Name");
    expect(markdown).toContain("## Input");
    expect(markdown).toContain("### Note");
  });

  it("lifts legacy statements written entirely at level one", () => {
    const { markdown } = normaliseForCmarker("Prose.\n\n# Input\n\n# Output");
    expect(markdown).toContain("## Input");
    expect(markdown).toContain("## Output");
  });

  it("keeps `~~strikethrough~~` out of the maths", () => {
    const { markdown } = normaliseForCmarker("~~gone~~ and ~n~");
    expect(markdown).toContain("~~gone~~");
    expect(markdown).toContain("$n$");
  });

  it("turns an HTML image into a markdown image", () => {
    const { markdown, images } = normaliseForCmarker('<img src="/media/x.png" alt="a picture" width="180"/>');
    expect(markdown).toContain("![a picture](/media/x.png)");
    expect(images).toEqual(["/media/x.png"]);
  });

  it("escapes other raw HTML into literal text", () => {
    const { markdown } = normaliseForCmarker("Output <name> defeats <other>.");
    expect(markdown).toContain("\\<name>");
    expect(markdown).toContain("\\<other>");
  });

  it("drops HTML comments", () => {
    const { markdown } = normaliseForCmarker("<!-- hidden -->\n\nProse.");
    expect(markdown.trim()).toBe("Prose.");
  });

  it("drops remote images, which Typst cannot fetch", () => {
    const { markdown, droppedImages } = normaliseForCmarker("![x](https://example.com/a.png)");
    expect(droppedImages).toEqual(["https://example.com/a.png"]);
    expect(markdown).not.toContain("example.com");
  });

  it("makes local image paths root-absolute", () => {
    expect(defaultResolveImage("example.png")).toBe("/example.png");
    expect(defaultResolveImage("/media/x.png")).toBe("/media/x.png");
    expect(defaultResolveImage("https://x/y.png")).toBe(null);
    expect(defaultResolveImage("data:image/png;base64,AAA")).toBe(null);
    expect(dropAllImages()).toBe(null);
  });

  it("keeps fenced code untouched", () => {
    const { markdown } = normaliseForCmarker("```cpp\nint a = ~b~;\n```");
    expect(markdown).toContain("int a = ~b~;");
  });
});

describe("markdownToTypst", () => {
  it("emits a document that imports the template", () => {
    const problem = fixture("coconutpairs");
    const source = markdownToTypst(problem.source, problem.meta);
    expect(source).toContain('#import "statement.typ": moj-markdown, statement-page');
    expect(source).toContain('name: "Coconut Pairs"');
    expect(source).toContain('code: "coconutpairs"');
    expect(source).toContain("#moj-markdown(");
  });

  it("passes the label through for booklet statements", () => {
    const problem = fixture("coconutpairs");
    const source = markdownToTypst(problem.source, { ...problem.meta, label: "C" });
    expect(source).toContain('label: "C"');
  });

  it("emits none for a missing Python time limit", () => {
    const problem = fixture("coconutpairs");
    expect(markdownToTypst(problem.source, problem.meta)).toContain("python-time-limit: none");
    expect(markdownToTypst(problem.source, { ...problem.meta, pythonTimeLimit: 3 })).toContain(
      "python-time-limit: 3",
    );
  });
});

describe("booklet", () => {
  const problems = ["coconutpairs", "kthsum", "warden"].map((code) => {
    const found = fixture(code);
    return { meta: found.meta, statement: found.source };
  });

  it("labels the problems and breaks the pages", () => {
    const source = booklet(problems, { title: "MAPS Beginner 2026", date: "March 2026" });
    expect(source).toContain('#import "booklet.typ": booklet-doc, cover, problem-footer');
    expect(source).toContain('title: "MAPS Beginner 2026"');
    expect(source).toContain('("A", "Coconut Pairs"),');
    expect(source).toContain('("B", "Kth Largest Subarray Sum"),');
    expect(source).toContain('("C", "Warden"),');
    expect(source.match(/#pagebreak\(\)/g)?.length).toBe(3);
    expect(source.match(/#problem-header\(/g)?.length).toBe(3);
  });

  it("can leave the cover out", () => {
    const source = booklet(problems, { title: "Division 2" }, { cover: false });
    expect(source).not.toContain("#cover(");
    expect(source.match(/#pagebreak\(\)/g)?.length).toBe(2);
  });

  it("carries on past Z", () => {
    const many = Array.from({ length: 28 }, (_, index) => ({
      meta: { ...problems[0]!.meta, code: `p${index}`, name: `Problem ${index}` },
      statement: "Body.",
    }));
    const source = booklet(many, { title: "Long" });
    expect(source).toContain('("Z", "Problem 25"),');
    expect(source).toContain('("AA", "Problem 26"),');
    expect(source).toContain('("AB", "Problem 27"),');
  });
});

describe.skipIf(!hasTypst)("pdf compilation", () => {
  for (const code of ["coconutpairs", "kthsum", "gptdarkdown", "tenniscomp2"]) {
    it(`compiles ${code} and prints its name`, async () => {
      const problem = fixture(code);
      const images: string[] = [];
      const source = markdownToTypst(problem.source, problem.meta, {
        onImage: (image) => {
          if (image.resolved) images.push(image.resolved);
        },
      });
      const pdf = await renderPdf(source, { assets: placeholderAssets(images) });
      expect(pdf.length).toBeGreaterThan(1000);
      expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      const text = await pdfText(pdf);
      expect(text).toContain(problem.meta.name);
      expect(text).toContain("time limit per test");
      expect(text).toContain("memory limit per test");
    });
  }

  it("compiles a booklet with a cover and one page per problem", async () => {
    const problems = ["coconutpairs", "kthsum", "warden"].map((code) => {
      const found = fixture(code);
      return { meta: found.meta, statement: found.source };
    });
    const source = booklet(problems, {
      title: "MAPS Beginner Competition",
      subtitle: "Division 2",
      date: "March 2026",
      note: "You may submit as many times as you like. Ties are broken by penalty time.",
    });
    const pdf = await renderPdf(source);
    const text = await pdfText(pdf);
    expect(text).toContain("MAPS Beginner Competition");
    expect(text).toContain("Division 2");
    for (const problem of problems) expect(text).toContain(problem.meta.name);
    expect(text).toContain("A. Coconut Pairs");
    expect(text).toContain("C. Warden");
  });

  it("reports a compile failure with the Typst diagnostics", async () => {
    await expect(renderPdf('#panic("boom")')).rejects.toMatchObject({
      name: "TypstCompileError",
    });
  });

  it("refuses to write an asset outside the work directory", async () => {
    await expect(renderPdf("Hello.", { assets: { "../escape.png": Buffer.from("x") } })).rejects.toThrow(
      /escapes the work directory/,
    );
  });
});
