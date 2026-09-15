import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import {
  type CompilerCase,
  type CompilerData,
  compileInit,
  dumpYaml,
  listZipNames,
  makeInit,
} from "../problems/data";
import schema from "../schema";
import { seedProblem, seedProfile, seedTaxonomy } from "./problems.fixtures";

const modules = import.meta.glob("../**/*.ts");

const EMPTY_DATA: CompilerData = {
  zipfile: null,
  generator: null,
  outputPrefix: null,
  outputLimit: null,
  checker: null,
  checkerArgs: "",
  unicode: false,
  nobigmath: false,
};

function normalCase(overrides: Partial<CompilerCase> & { order: number }): CompilerCase {
  return {
    type: "C",
    inputFile: "",
    outputFile: "",
    generatorArgs: "",
    points: null,
    isPretest: false,
    outputPrefix: null,
    outputLimit: null,
    checker: null,
    checkerArgs: "",
    batchDependencies: [],
    ...overrides,
  };
}

describe("dumpYaml", () => {
  /**
   * Golden test against `yaml.safe_dump`, which is what
   * `ProblemDataCompiler.compile` writes. The expected text below was produced
   * by PyYAML 6 for the same mapping: block style, keys sorted, two space
   * indent, block sequences flush with their parent key.
   */
  test("matches PyYAML's safe_dump", () => {
    const init = {
      archive: "aplusb.zip",
      checker: "standard",
      hints: ["unicode", "nobigmath"],
      output_prefix_length: 64,
      pretest_test_cases: [{ in: "p.in", out: "p.out", points: 5 }],
      test_cases: [
        { points: 0, batched: [{ in: "00.in", out: "00.out" }], dependencies: [] },
        {
          points: 100,
          batched: [{ in: "02.in", out: "02.out" }],
          dependencies: [1],
          checker: { name: "floatsabs", args: { precision: 6 } },
        },
      ],
    };

    expect(dumpYaml(init)).toBe(
      [
        "archive: aplusb.zip",
        "checker: standard",
        "hints:",
        "- unicode",
        "- nobigmath",
        "output_prefix_length: 64",
        "pretest_test_cases:",
        "- in: p.in",
        "  out: p.out",
        "  points: 5",
        "test_cases:",
        "- batched:",
        "  - in: 00.in",
        "    out: 00.out",
        "  dependencies: []",
        "  points: 0",
        "- batched:",
        "  - in: 02.in",
        "    out: 02.out",
        "  checker:",
        "    args:",
        "      precision: 6",
        "    name: floatsabs",
        "  dependencies:",
        "  - 1",
        "  points: 100",
        "",
      ].join("\n"),
    );
  });

  test("quotes the scalars PyYAML quotes", () => {
    expect(dumpYaml({ a: [], b: {}, c: "yes", d: "1.5", e: "tests/1.in" })).toBe(
      ["a: []", "b: {}", "c: 'yes'", "d: '1.5'", "e: tests/1.in", ""].join("\n"),
    );
  });
});

describe("ProblemDataCompiler.make_init", () => {
  test("builds the aplusb archive's two batches", () => {
    const cases: CompilerCase[] = [
      normalCase({ order: 0, type: "S", points: 0 }),
      normalCase({ order: 1, inputFile: "00.in", outputFile: "00.out" }),
      normalCase({ order: 2, inputFile: "01.in", outputFile: "01.out" }),
      normalCase({ order: 3, type: "E" }),
      normalCase({ order: 4, type: "S", points: 100 }),
      normalCase({ order: 5, inputFile: "02.in", outputFile: "02.out" }),
      normalCase({ order: 6, inputFile: "03.in", outputFile: "03.out" }),
      normalCase({ order: 7, type: "E" }),
    ];
    const files = ["00.in", "00.out", "01.in", "01.out", "02.in", "02.out", "03.in", "03.out"];

    const { init } = makeInit(EMPTY_DATA, cases, files);
    expect(init).toEqual({
      test_cases: [
        {
          points: 0,
          batched: [
            { in: "00.in", out: "00.out" },
            { in: "01.in", out: "01.out" },
          ],
          dependencies: [],
        },
        {
          points: 100,
          batched: [
            { in: "02.in", out: "02.out" },
            { in: "03.in", out: "03.out" },
          ],
          dependencies: [],
        },
      ],
    });
  });

  test("splits pretests out and drops is_pretest from the entries", () => {
    const cases: CompilerCase[] = [
      normalCase({ order: 0, inputFile: "s.in", outputFile: "s.out", points: 0, isPretest: true }),
      normalCase({ order: 1, inputFile: "1.in", outputFile: "1.out", points: 100 }),
    ];
    const { init } = makeInit(EMPTY_DATA, cases, ["s.in", "s.out", "1.in", "1.out"]);
    expect(init).toEqual({
      pretest_test_cases: [{ in: "s.in", out: "s.out", points: 0 }],
      test_cases: [{ in: "1.in", out: "1.out", points: 100 }],
    });
  });

  test("carries hints, limits, the archive and the checker", () => {
    const data: CompilerData = {
      ...EMPTY_DATA,
      zipfile: "aplusb.zip",
      outputPrefix: 32,
      outputLimit: 4096,
      unicode: true,
      nobigmath: true,
      checker: "floatsabs",
      checkerArgs: '{"precision": 6}',
    };
    const cases = [normalCase({ order: 0, inputFile: "1.in", outputFile: "1.out", points: 100 })];
    const { init } = makeInit(data, cases, ["1.in", "1.out"]);
    expect(init).toEqual({
      archive: "aplusb.zip",
      test_cases: [{ in: "1.in", out: "1.out", points: 100 }],
      output_limit_length: 4096,
      output_prefix_length: 32,
      hints: ["unicode", "nobigmath"],
      checker: { name: "floatsabs", args: { precision: 6 } },
    });
  });

  test("reproduces DMOJ's validation errors", () => {
    const missingPoints = [normalCase({ order: 0, inputFile: "1.in", outputFile: "1.out" })];
    expect(compileInit(EMPTY_DATA, missingPoints, ["1.in", "1.out"])).toEqual({
      yaml: null,
      feedback: "Points must be defined for non-batch case #1.",
      fixups: [],
    });

    const emptyBatch = [normalCase({ order: 0, type: "S", points: 10 }), normalCase({ order: 1, type: "E" })];
    expect(compileInit(EMPTY_DATA, emptyBatch, []).feedback).toBe("Empty batches not allowed.");

    const orphanEnd = [normalCase({ order: 0, type: "E" })];
    expect(compileInit(EMPTY_DATA, orphanEnd, []).feedback).toBe(
      "Attempt to end batch outside of one in case #1.",
    );

    const batchNoPoints = [
      normalCase({ order: 0, type: "S" }),
      normalCase({ order: 1, inputFile: "1.in", outputFile: "1.out" }),
      normalCase({ order: 2, type: "E" }),
    ];
    expect(compileInit(EMPTY_DATA, batchNoPoints, ["1.in", "1.out"]).feedback).toBe(
      "Batch start case #1 requires points.",
    );

    const missingFile = [normalCase({ order: 0, inputFile: "nope.in", outputFile: "1.out", points: 5 })];
    expect(compileInit(EMPTY_DATA, missingFile, ["1.out"]).feedback).toBe(
      "Input file for case 1 does not exist: nope.in",
    );

    const forwardDependency = [
      normalCase({ order: 0, type: "S", points: 10, batchDependencies: [2] }),
      normalCase({ order: 1, inputFile: "1.in", outputFile: "1.out" }),
      normalCase({ order: 2, type: "E" }),
    ];
    expect(compileInit(EMPTY_DATA, forwardDependency, ["1.in", "1.out"]).feedback).toBe(
      "Dependencies must depend on previous batches for batch start case #1.",
    );

    const badChecker = [
      normalCase({
        order: 0,
        inputFile: "1.in",
        outputFile: "1.out",
        points: 5,
        checker: "floats",
        checkerArgs: "not json",
      }),
    ];
    expect(compileInit(EMPTY_DATA, badChecker, ["1.in", "1.out"]).feedback).toBe(
      "Checker arguments is invalid JSON.",
    );
  });

  test("an empty init means no init.yml at all", () => {
    expect(compileInit(EMPTY_DATA, [], []).yaml).toBeNull();
  });

  test("a generator turns off the file existence check", () => {
    const data: CompilerData = { ...EMPTY_DATA, generator: "gen.py" };
    const cases = [normalCase({ order: 0, inputFile: "1.in", outputFile: "1.out", points: 100 })];
    const { init } = makeInit(data, cases, []);
    expect(init.generator).toBe("gen.py");
  });
});

describe("listZipNames", () => {
  test("reads the central directory of a stored zip", () => {
    // A minimal zip with one stored (uncompressed) entry, built by hand so the
    // test has no dependency on a zip library.
    const name = "tests/1.in";
    const content = "1 2\n";
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(name);
    const contentBytes = encoder.encode(content);

    const local = new Uint8Array(30 + nameBytes.length + contentBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x0403_4b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true); // stored
    localView.setUint32(18, contentBytes.length, true);
    localView.setUint32(22, contentBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(contentBytes, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x0201_4b50, true);
    centralView.setUint32(20, contentBytes.length, true);
    centralView.setUint32(24, contentBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    central.set(nameBytes, 46);

    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x0605_4b50, true);
    eocdView.setUint16(8, 1, true);
    eocdView.setUint16(10, 1, true);
    eocdView.setUint32(12, central.length, true);
    eocdView.setUint32(16, local.length, true);

    const zip = new Uint8Array(local.length + central.length + eocd.length);
    zip.set(local, 0);
    zip.set(central, local.length);
    zip.set(eocd, local.length + central.length);

    expect(listZipNames(zip.buffer)).toEqual([
      { name: "tests/1.in", compressedSize: 4, size: 4, isDirectory: false },
    ]);
  });

  test("rejects something that is not a zip", () => {
    const bytes = new TextEncoder().encode("this is not a zip file at all, not even close");
    expect(() => listZipNames(bytes.buffer)).toThrow(/invalid/i);
  });
});

describe("problemData.initYaml", () => {
  test("compiles from the stored rows for an editor", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      const staff = await seedProfile(ctx, {
        username: "staff",
        isStaff: true,
        permissions: ["judge.edit_own_problem", "judge.edit_all_problem"],
      });
      const problemId = await seedProblem(ctx, {
        code: "aplusb",
        groupId,
        authorProfileIds: [staff],
      });
      await ctx.db.insert("problemData", {
        problemId,
        zipfile: "aplusb.zip",
        feedback: "",
        unicode: false,
        nobigmath: false,
      });
      const rows: [number, "C" | "S" | "E", string, string, number | null][] = [
        [0, "S", "", "", 100],
        [1, "C", "00.in", "00.out", null],
        [2, "E", "", "", null],
      ];
      for (const [order, type, inputFile, outputFile, points] of rows) {
        await ctx.db.insert("problemTestCases", {
          problemId,
          order,
          type,
          inputFile,
          outputFile,
          generatorArgs: "",
          points,
          isPretest: false,
          checkerArgs: "",
          batchDependencies: [],
        });
      }
    });

    const asStaff = t.withIdentity({ subject: "user_staff" });
    const result = await asStaff.query(api.problems.data.initYaml, {
      code: "aplusb",
      files: ["00.in", "00.out"],
    });
    expect(result.feedback).toBe("");
    expect(result.yaml).toBe(
      [
        "archive: aplusb.zip",
        "test_cases:",
        "- batched:",
        "  - in: 00.in",
        "    out: 00.out",
        "  dependencies: []",
        "  points: 100",
        "",
      ].join("\n"),
    );
  });

  test("refuses non-editors and manually managed problems", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      await seedProfile(ctx, { username: "nobody" });
      const staff = await seedProfile(ctx, {
        username: "staff",
        isStaff: true,
        permissions: ["judge.edit_own_problem", "judge.edit_all_problem"],
      });
      await seedProblem(ctx, { code: "aplusb", groupId, authorProfileIds: [staff] });
      const managedId = await seedProblem(ctx, { code: "managed", groupId });
      await ctx.db.patch(managedId, { isManuallyManaged: true });
    });

    await expect(
      t.withIdentity({ subject: "user_nobody" }).query(api.problems.data.initYaml, { code: "aplusb" }),
    ).rejects.toThrow();

    await expect(
      t.withIdentity({ subject: "user_staff" }).query(api.problems.data.initYaml, { code: "managed" }),
    ).rejects.toThrow(/managed by hand/);
  });
});
