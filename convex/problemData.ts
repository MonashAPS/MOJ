/**
 * DMOJ's test data editor, ported from judge/views/problem_data.py and
 * judge/utils/problem_data.py.
 *
 * MAPS does not use this page: its problem repos ship a hand written init.yml
 * and rsync it to the judge. Only one imported problem carries
 * `isManuallyManaged` (`multiplication`), so for the other 312 the editor opens
 * exactly as it does on DMOJ, and saving would replace the hand written file the
 * next time the judge reads the problem. That is DMOJ's behaviour too, and the
 * guard below is DMOJ's guard. It exists because the spec asks for feature
 * parity, and because `initYaml` is a useful read-only view of what the compiler
 * would produce for an imported problem.
 */

import { problemIsEditableBy } from "@moj/core";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { requireViewer } from "./lib/auth";
import { forbidden, invalid, notFound } from "./lib/errors";
import { loadViewerContext, problemByCode, toCoreProblem } from "./problems";

/* -------------------------------------------------------------------------- */
/* init.yml compiler                                                          */
/* -------------------------------------------------------------------------- */

export type CompilerCase = {
  order: number;
  type: "C" | "S" | "E";
  inputFile: string;
  outputFile: string;
  generatorArgs: string;
  points: number | null;
  isPretest: boolean;
  outputPrefix: number | null;
  outputLimit: number | null;
  checker: string | null;
  checkerArgs: string;
  batchDependencies: number[];
};

export type CompilerData = {
  zipfile: string | null;
  generator: string | null;
  outputPrefix: number | null;
  outputLimit: number | null;
  checker: string | null;
  checkerArgs: string;
  unicode: boolean;
  nobigmath: boolean;
};

/** A normalisation `ProblemDataCompiler.make_init` writes back onto a case. */
export type CaseFixup = {
  order: number;
  checkerArgs?: string;
  isPretest?: boolean;
  inputFile?: string;
  outputFile?: string;
  generatorArgs?: string;
  checker?: string | null;
};

export class ProblemDataError extends Error {}

type InitValue = string | number | boolean | InitValue[] | { [key: string]: InitValue };

function makeChecker(source: { checker: string | null; checkerArgs: string }): InitValue | undefined {
  if (!source.checker) return undefined;
  if (source.checkerArgs) {
    let args: unknown;
    try {
      args = JSON.parse(source.checkerArgs);
    } catch {
      throw new ProblemDataError("Checker arguments is invalid JSON.");
    }
    if (args === null || typeof args !== "object" || Array.isArray(args)) {
      throw new ProblemDataError("Checker arguments must be a JSON object.");
    }
    return { name: source.checker, args: args as Record<string, InitValue> };
  }
  return source.checker;
}

/**
 * `ProblemDataCompiler.make_init`, statement for statement.
 *
 * Returns the init mapping plus the write-backs DMOJ performs on the case rows
 * while it walks them, so a mutation can apply them and a query can ignore them.
 */
export function makeInit(
  data: CompilerData,
  cases: readonly CompilerCase[],
  files: readonly string[],
): { init: Record<string, InitValue>; fixups: CaseFixup[] } {
  const fileSet = new Set(files);
  const built: Record<string, InitValue>[] = [];
  const fixups: CaseFixup[] = [];
  let batch: Record<string, InitValue> | null = null;
  let batchCount = 0;

  const endBatch = () => {
    const current = batch as Record<string, InitValue>;
    if ((current.batched as InitValue[]).length === 0) {
      throw new ProblemDataError("Empty batches not allowed.");
    }
    built.push(current);
  };

  for (const [index, original] of cases.entries()) {
    const i = index + 1;
    const testCase = { ...original };

    if (testCase.type === "C") {
      const entry: Record<string, InitValue> = {};
      if (batch) {
        testCase.points = null;
        testCase.isPretest = batch.is_pretest as boolean;
      } else {
        if (testCase.points === null) {
          throw new ProblemDataError(`Points must be defined for non-batch case #${i}.`);
        }
        entry.is_pretest = testCase.isPretest;
      }

      if (!data.generator) {
        if (!fileSet.has(testCase.inputFile)) {
          throw new ProblemDataError(`Input file for case ${i} does not exist: ${testCase.inputFile}`);
        }
        if (!fileSet.has(testCase.outputFile)) {
          throw new ProblemDataError(`Output file for case ${i} does not exist: ${testCase.outputFile}`);
        }
      }

      if (testCase.inputFile) entry.in = testCase.inputFile;
      if (testCase.outputFile) entry.out = testCase.outputFile;
      if (testCase.points !== null) entry.points = testCase.points;
      if (testCase.generatorArgs) entry.generator_args = testCase.generatorArgs.split(/\r?\n/);
      if (testCase.outputLimit !== null) entry.output_limit_length = testCase.outputLimit;
      if (testCase.outputPrefix !== null) entry.output_prefix_length = testCase.outputPrefix;
      const checker = makeChecker(testCase);
      if (checker !== undefined) {
        entry.checker = checker;
      } else {
        testCase.checkerArgs = "";
      }
      fixups.push({
        order: original.order,
        checkerArgs: testCase.checkerArgs,
        isPretest: testCase.isPretest,
      });

      if (batch) (batch.batched as InitValue[]).push(entry);
      else built.push(entry);
    } else if (testCase.type === "S") {
      batchCount += 1;
      if (batch) endBatch();
      if (testCase.points === null) {
        throw new ProblemDataError(`Batch start case #${i} requires points.`);
      }
      const dependencies: number[] = [];
      for (const dependency of testCase.batchDependencies) {
        if (!Number.isInteger(dependency)) {
          throw new ProblemDataError(
            `Dependencies must be a comma-separated list of integers for batch start case #${i}.`,
          );
        }
        if (dependency >= batchCount) {
          throw new ProblemDataError(
            `Dependencies must depend on previous batches for batch start case #${i}.`,
          );
        }
        if (dependency < 1) {
          throw new ProblemDataError(`Dependencies must be positive for batch start case #${i}.`);
        }
        dependencies.push(dependency);
      }

      batch = {
        points: testCase.points,
        batched: [],
        is_pretest: testCase.isPretest,
        dependencies,
      };
      if (testCase.generatorArgs) batch.generator_args = testCase.generatorArgs.split(/\r?\n/);
      if (testCase.outputLimit !== null) batch.output_limit_length = testCase.outputLimit;
      if (testCase.outputPrefix !== null) batch.output_prefix_length = testCase.outputPrefix;
      const checker = makeChecker(testCase);
      if (checker !== undefined) {
        batch.checker = checker;
      } else {
        testCase.checkerArgs = "";
      }
      fixups.push({
        order: original.order,
        checkerArgs: testCase.checkerArgs,
        inputFile: "",
        outputFile: "",
      });
    } else if (testCase.type === "E") {
      if (!batch) {
        throw new ProblemDataError(`Attempt to end batch outside of one in case #${i}.`);
      }
      fixups.push({
        order: original.order,
        isPretest: batch.is_pretest as boolean,
        inputFile: "",
        outputFile: "",
        generatorArgs: "",
        checker: null,
        checkerArgs: "",
      });
      endBatch();
      batch = null;
    }
  }
  if (batch) endBatch();

  const init: Record<string, InitValue> = {};
  if (data.zipfile) init.archive = data.zipfile;
  if (data.generator) init.generator = data.generator;

  const pretestCases: Record<string, InitValue>[] = [];
  const testCases: Record<string, InitValue>[] = [];
  const hints: string[] = [];

  for (const entry of built) {
    if (entry.is_pretest) pretestCases.push(entry);
    else testCases.push(entry);
    delete entry.is_pretest;
  }

  if (pretestCases.length > 0) init.pretest_test_cases = pretestCases;
  if (testCases.length > 0) init.test_cases = testCases;
  if (data.outputLimit !== null) init.output_limit_length = data.outputLimit;
  if (data.outputPrefix !== null) init.output_prefix_length = data.outputPrefix;
  if (data.unicode) hints.push("unicode");
  if (data.nobigmath) hints.push("nobigmath");
  const checker = makeChecker(data);
  if (checker !== undefined) init.checker = checker;
  if (hints.length > 0) init.hints = hints;

  return { init, fixups };
}

/* -------------------------------------------------------------------------- */
/* YAML                                                                       */
/* -------------------------------------------------------------------------- */

const PLAIN_SCALAR = /^[A-Za-z0-9_./][A-Za-z0-9_./ +-]*$/;
const YAML_RESERVED = new Set([
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "true",
  "True",
  "TRUE",
  "false",
  "False",
  "FALSE",
  "on",
  "On",
  "ON",
  "off",
  "Off",
  "OFF",
  "null",
  "Null",
  "NULL",
  "~",
  "",
]);

function yamlScalar(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (YAML_RESERVED.has(value) || !PLAIN_SCALAR.test(value) || /^\d+(\.\d+)?$/.test(value)) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return value;
}

/**
 * `yaml.safe_dump` with PyYAML's defaults: block style, keys sorted, two-space
 * indent, block sequences flush with their parent key.
 */
export function dumpYaml(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);

  if (value === null || value === undefined) return `${pad}null\n`;

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]\n`;
    let out = "";
    for (const item of value) {
      if (item !== null && typeof item === "object") {
        const body = dumpYaml(item, indent + 2);
        out += `${pad}-${body.slice(indent + 1)}`;
      } else {
        out += `${pad}- ${yamlScalar(item as string | number | boolean)}\n`;
      }
    }
    return out;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    if (keys.length === 0) return `${pad}{}\n`;
    let out = "";
    for (const key of keys) {
      const child = record[key];
      if (Array.isArray(child)) {
        if (child.length === 0) {
          out += `${pad}${yamlScalar(key)}: []\n`;
        } else {
          out += `${pad}${yamlScalar(key)}:\n${dumpYaml(child, indent)}`;
        }
      } else if (child !== null && typeof child === "object") {
        out +=
          Object.keys(child).length === 0
            ? `${pad}${yamlScalar(key)}: {}\n`
            : `${pad}${yamlScalar(key)}:\n${dumpYaml(child, indent + 2)}`;
      } else {
        out += `${pad}${yamlScalar(key)}: ${yamlScalar(child as string | number | boolean)}\n`;
      }
    }
    return out;
  }

  return `${pad}${yamlScalar(value as string | number | boolean)}\n`;
}

/** `ProblemDataCompiler.compile`: the yaml text, or the feedback it would set. */
export function compileInit(
  data: CompilerData,
  cases: readonly CompilerCase[],
  files: readonly string[],
): { yaml: string | null; feedback: string; fixups: CaseFixup[] } {
  try {
    const { init, fixups } = makeInit(data, cases, files);
    // DMOJ deletes init.yml rather than writing an empty one, so judge-server
    // falls back to the manually managed directory (judge-server#670).
    const yaml = Object.keys(init).length > 0 ? dumpYaml(init) : null;
    return { yaml, feedback: "", fixups };
  } catch (error) {
    if (error instanceof ProblemDataError) {
      return { yaml: null, feedback: error.message, fixups: [] };
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Zip central directory                                                      */
/* -------------------------------------------------------------------------- */

export type ZipEntry = { name: string; compressedSize: number; size: number; isDirectory: boolean };

const EOCD_SIGNATURE = 0x0605_4b50;
const EOCD64_LOCATOR_SIGNATURE = 0x0706_4b50;
const EOCD64_SIGNATURE = 0x0606_4b50;
const CENTRAL_SIGNATURE = 0x0201_4b50;

/**
 * `ZipFile(...).namelist()` without unpacking anything: walk the central
 * directory at the end of the archive and read the file names out of it.
 */
export function listZipNames(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const length = bytes.length;
  if (length < 22) throw new ProblemDataError("Your zip file is invalid!");

  // The end-of-central-directory record sits in the last 64 KiB + 22 bytes.
  let eocd = -1;
  const floor = Math.max(0, length - 0x1_0000 - 22);
  for (let i = length - 22; i >= floor; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ProblemDataError("Your zip file is invalid!");

  let entryCount = view.getUint16(eocd + 10, true);
  let directoryOffset = view.getUint32(eocd + 16, true);

  if (entryCount === 0xffff || directoryOffset === 0xffff_ffff) {
    // ZIP64: the locator sits immediately before the EOCD record.
    const locator = eocd - 20;
    if (locator < 0 || view.getUint32(locator, true) !== EOCD64_LOCATOR_SIGNATURE) {
      throw new ProblemDataError("Your zip file is invalid!");
    }
    const eocd64 = Number(view.getBigUint64(locator + 8, true));
    if (eocd64 < 0 || eocd64 + 56 > length || view.getUint32(eocd64, true) !== EOCD64_SIGNATURE) {
      throw new ProblemDataError("Your zip file is invalid!");
    }
    entryCount = Number(view.getBigUint64(eocd64 + 32, true));
    directoryOffset = Number(view.getBigUint64(eocd64 + 48, true));
  }

  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > length || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new ProblemDataError("Your zip file is invalid!");
    }
    const compressedSize = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    entries.push({ name, compressedSize, size, isDirectory: name.endsWith("/") });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/* -------------------------------------------------------------------------- */
/* Access                                                                     */
/* -------------------------------------------------------------------------- */

/** `ProblemManagerMixin.get_object`. */
async function requireDataManager(
  ctx: QueryCtx,
  code: string,
): Promise<{ problem: Doc<"problems">; profileId: Id<"profiles"> }> {
  const problem = await problemByCode(ctx, code);
  if (!problem) throw notFound("Problem");
  if (problem.isManuallyManaged) {
    throw forbidden("This problem's data is managed by hand on the judge.");
  }
  const viewer = await loadViewerContext(ctx);
  if (!viewer.profile) throw forbidden("You must be logged in to do that.");
  if (!viewer.profile.isSuperuser && !problemIsEditableBy(toCoreProblem(problem), viewer.core)) {
    throw forbidden("You may not edit this problem's test data.");
  }
  return { problem, profileId: viewer.profile._id };
}

async function dataRow(ctx: QueryCtx, problemId: Id<"problems">) {
  return await ctx.db
    .query("problemData")
    .withIndex("by_problem", (q) => q.eq("problemId", problemId))
    .unique();
}

async function ensureDataRow(ctx: MutationCtx, problemId: Id<"problems">) {
  const existing = await dataRow(ctx, problemId);
  if (existing) return existing;
  const id = await ctx.db.insert("problemData", {
    problemId,
    feedback: "",
    unicode: false,
    nobigmath: false,
  });
  return (await ctx.db.get(id)) as Doc<"problemData">;
}

async function casesFor(ctx: QueryCtx, problemId: Id<"problems">) {
  const rows = await ctx.db
    .query("problemTestCases")
    .withIndex("by_problem_order", (q) => q.eq("problemId", problemId))
    .collect();
  rows.sort((a, b) => a.order - b.order);
  return rows;
}

function toCompilerData(row: Doc<"problemData"> | null): CompilerData {
  return {
    zipfile: row?.zipfile ?? null,
    generator: row?.generator ?? null,
    outputPrefix: row?.outputPrefix ?? null,
    outputLimit: row?.outputLimit ?? null,
    checker: row?.checker ?? null,
    checkerArgs: row?.checkerArgs ?? "",
    unicode: row?.unicode ?? false,
    nobigmath: row?.nobigmath ?? false,
  };
}

function toCompilerCase(row: Doc<"problemTestCases">): CompilerCase {
  return {
    order: row.order,
    type: row.type,
    inputFile: row.inputFile,
    outputFile: row.outputFile,
    generatorArgs: row.generatorArgs,
    points: row.points,
    isPretest: row.isPretest,
    outputPrefix: row.outputPrefix ?? null,
    outputLimit: row.outputLimit ?? null,
    checker: row.checker ?? null,
    checkerArgs: row.checkerArgs ?? "",
    batchDependencies: row.batchDependencies,
  };
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

export const get = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const { problem } = await requireDataManager(ctx, code);
    const row = await dataRow(ctx, problem._id);
    const cases = await casesFor(ctx, problem._id);
    return {
      problemCode: problem.code,
      problemName: problem.name,
      data: row
        ? {
            zipfile: row.zipfile ?? null,
            zipfileStorageId: row.zipfileStorageId ?? null,
            generator: row.generator ?? null,
            outputPrefix: row.outputPrefix ?? null,
            outputLimit: row.outputLimit ?? null,
            feedback: row.feedback,
            checker: row.checker ?? null,
            checkerArgs: row.checkerArgs ?? "",
            unicode: row.unicode,
            nobigmath: row.nobigmath,
          }
        : null,
      cases: cases.map((testCase) => ({
        id: testCase._id,
        order: testCase.order,
        type: testCase.type,
        inputFile: testCase.inputFile,
        outputFile: testCase.outputFile,
        generatorArgs: testCase.generatorArgs,
        points: testCase.points,
        isPretest: testCase.isPretest,
        outputPrefix: testCase.outputPrefix ?? null,
        outputLimit: testCase.outputLimit ?? null,
        checker: testCase.checker ?? null,
        checkerArgs: testCase.checkerArgs ?? "",
        batchDependencies: testCase.batchDependencies,
      })),
    };
  },
});

/** `problem_init_view`: the generated init.yml, or the compiler's complaint. */
export const initYaml = query({
  args: { code: v.string(), files: v.optional(v.array(v.string())) },
  handler: async (ctx, { code, files }) => {
    const { problem } = await requireDataManager(ctx, code);
    const row = await dataRow(ctx, problem._id);
    const cases = await casesFor(ctx, problem._id);
    const result = compileInit(
      toCompilerData(row),
      cases.map(toCompilerCase),
      // The compiler only checks file existence when there is no generator; an
      // empty list plus a generator is the manually-managed shape.
      files ?? [],
    );
    return {
      problemCode: problem.code,
      yaml: result.yaml,
      feedback: result.feedback || (row?.feedback ?? ""),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

function checkCheckerArgs(value: string | undefined): string {
  const raw = value ?? "";
  if (!raw || raw.trim().length === 0) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid("Checker arguments is invalid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalid("Checker arguments must be a JSON object.");
  }
  return raw;
}

export const generateUploadUrl = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    await requireDataManager(ctx, code);
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateData = mutation({
  args: {
    code: v.string(),
    zipfile: v.optional(v.union(v.string(), v.null())),
    zipfileStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    generator: v.optional(v.union(v.string(), v.null())),
    generatorStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    outputPrefix: v.optional(v.union(v.number(), v.null())),
    outputLimit: v.optional(v.union(v.number(), v.null())),
    checker: v.optional(v.union(v.string(), v.null())),
    checkerArgs: v.optional(v.string()),
    unicode: v.optional(v.boolean()),
    nobigmath: v.optional(v.boolean()),
    files: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { problem } = await requireDataManager(ctx, args.code);
    const row = await ensureDataRow(ctx, problem._id);

    if (args.zipfile !== undefined && args.zipfile && !args.zipfile.endsWith(".zip")) {
      throw invalid("Zip files must end in '.zip'");
    }
    if (args.generator !== undefined && args.generator === "init.yml") {
      throw invalid("Generators must not be named init.yml.");
    }

    const patch: Partial<Doc<"problemData">> = {};
    if (args.zipfile !== undefined) patch.zipfile = args.zipfile ?? undefined;
    if (args.zipfileStorageId !== undefined) {
      patch.zipfileStorageId = args.zipfileStorageId ?? undefined;
    }
    if (args.generator !== undefined) patch.generator = args.generator ?? undefined;
    if (args.generatorStorageId !== undefined) {
      patch.generatorStorageId = args.generatorStorageId ?? undefined;
    }
    if (args.outputPrefix !== undefined) patch.outputPrefix = args.outputPrefix ?? undefined;
    if (args.outputLimit !== undefined) patch.outputLimit = args.outputLimit ?? undefined;
    if (args.checker !== undefined) patch.checker = args.checker ?? undefined;
    if (args.checkerArgs !== undefined) patch.checkerArgs = checkCheckerArgs(args.checkerArgs);
    if (args.unicode !== undefined) patch.unicode = args.unicode;
    if (args.nobigmath !== undefined) patch.nobigmath = args.nobigmath;

    await ctx.db.patch(row._id, patch);
    return await recompile(ctx, problem, args.files ?? []);
  },
});

const caseInput = v.object({
  order: v.number(),
  type: v.union(v.literal("C"), v.literal("S"), v.literal("E")),
  inputFile: v.optional(v.string()),
  outputFile: v.optional(v.string()),
  generatorArgs: v.optional(v.string()),
  points: v.optional(v.union(v.number(), v.null())),
  isPretest: v.optional(v.boolean()),
  outputPrefix: v.optional(v.union(v.number(), v.null())),
  outputLimit: v.optional(v.union(v.number(), v.null())),
  checker: v.optional(v.union(v.string(), v.null())),
  checkerArgs: v.optional(v.string()),
  batchDependencies: v.optional(v.array(v.number())),
});

/** The formset's save: the posted list replaces the stored one wholesale. */
export const saveCases = mutation({
  args: { code: v.string(), cases: v.array(caseInput), files: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const { problem } = await requireDataManager(ctx, args.code);
    await ensureDataRow(ctx, problem._id);

    for (const existing of await casesFor(ctx, problem._id)) {
      await ctx.db.delete(existing._id);
    }
    for (const testCase of args.cases) {
      await ctx.db.insert("problemTestCases", {
        problemId: problem._id,
        order: testCase.order,
        type: testCase.type,
        inputFile: testCase.inputFile ?? "",
        outputFile: testCase.outputFile ?? "",
        generatorArgs: testCase.generatorArgs ?? "",
        points: testCase.points ?? null,
        isPretest: testCase.isPretest ?? false,
        outputPrefix: testCase.outputPrefix ?? undefined,
        outputLimit: testCase.outputLimit ?? undefined,
        checker: testCase.checker ?? undefined,
        checkerArgs: checkCheckerArgs(testCase.checkerArgs),
        batchDependencies: testCase.batchDependencies ?? [],
      });
    }
    return await recompile(ctx, problem, args.files ?? []);
  },
});

export const upsertCase = mutation({
  args: {
    code: v.string(),
    caseId: v.optional(v.id("problemTestCases")),
    testCase: caseInput,
    files: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { problem } = await requireDataManager(ctx, args.code);
    await ensureDataRow(ctx, problem._id);
    const testCase = args.testCase;
    const fields = {
      problemId: problem._id,
      order: testCase.order,
      type: testCase.type,
      inputFile: testCase.inputFile ?? "",
      outputFile: testCase.outputFile ?? "",
      generatorArgs: testCase.generatorArgs ?? "",
      points: testCase.points ?? null,
      isPretest: testCase.isPretest ?? false,
      outputPrefix: testCase.outputPrefix ?? undefined,
      outputLimit: testCase.outputLimit ?? undefined,
      checker: testCase.checker ?? undefined,
      checkerArgs: checkCheckerArgs(testCase.checkerArgs),
      batchDependencies: testCase.batchDependencies ?? [],
    };
    if (args.caseId) {
      const existing = await ctx.db.get(args.caseId);
      if (!existing || existing.problemId !== problem._id) throw notFound("Test case");
      await ctx.db.patch(args.caseId, fields);
    } else {
      await ctx.db.insert("problemTestCases", fields);
    }
    return await recompile(ctx, problem, args.files ?? []);
  },
});

export const deleteCase = mutation({
  args: {
    code: v.string(),
    caseId: v.id("problemTestCases"),
    files: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { problem } = await requireDataManager(ctx, args.code);
    const existing = await ctx.db.get(args.caseId);
    if (!existing || existing.problemId !== problem._id) throw notFound("Test case");
    await ctx.db.delete(args.caseId);
    return await recompile(ctx, problem, args.files ?? []);
  },
});

/** `ProblemDataCompiler.generate`: apply the write-backs, then store or clear. */
async function recompile(ctx: MutationCtx, problem: Doc<"problems">, files: readonly string[]) {
  const row = await ensureDataRow(ctx, problem._id);
  const cases = await casesFor(ctx, problem._id);
  const result = compileInit(toCompilerData(row), cases.map(toCompilerCase), files);

  const byOrder = new Map(cases.map((testCase) => [testCase.order, testCase]));
  for (const fixup of result.fixups) {
    const target = byOrder.get(fixup.order);
    if (!target) continue;
    const patch: Partial<Doc<"problemTestCases">> = {};
    if (fixup.checkerArgs !== undefined) patch.checkerArgs = fixup.checkerArgs;
    if (fixup.isPretest !== undefined) patch.isPretest = fixup.isPretest;
    if (fixup.inputFile !== undefined) patch.inputFile = fixup.inputFile;
    if (fixup.outputFile !== undefined) patch.outputFile = fixup.outputFile;
    if (fixup.generatorArgs !== undefined) patch.generatorArgs = fixup.generatorArgs;
    if (fixup.checker !== undefined) patch.checker = fixup.checker ?? undefined;
    if (Object.keys(patch).length > 0) await ctx.db.patch(target._id, patch);
  }

  await ctx.db.patch(row._id, { feedback: result.feedback });
  return { yaml: result.yaml, feedback: result.feedback };
}

export const compile = mutation({
  args: { code: v.string(), files: v.optional(v.array(v.string())) },
  handler: async (ctx, { code, files }) => {
    const { problem } = await requireDataManager(ctx, code);
    return await recompile(ctx, problem, files ?? []);
  },
});

export const clearFeedback = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    await requireViewer(ctx);
    const { problem } = await requireDataManager(ctx, code);
    const row = await dataRow(ctx, problem._id);
    if (row) await ctx.db.patch(row._id, { feedback: "" });
    return { ok: true };
  },
});

/* -------------------------------------------------------------------------- */
/* Zip listing                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The names the data editor validates cases against, read straight out of the
 * uploaded archive's central directory. Only an action can read a stored blob.
 */
export const zipContents = action({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<{ files: string[]; entries: ZipEntry[]; error: string | null }> => {
    const data: { storageId: Id<"_storage"> | null } = await ctx.runQuery(api.problemData.zipStorageId, {
      code,
    });
    if (!data.storageId) return { files: [], entries: [], error: null };

    const blob = await ctx.storage.get(data.storageId);
    if (!blob) return { files: [], entries: [], error: "The archive is missing from storage." };

    try {
      const entries = listZipNames(await blob.arrayBuffer());
      return {
        files: entries.filter((entry) => !entry.isDirectory).map((entry) => entry.name),
        entries,
        error: null,
      };
    } catch (error) {
      return {
        files: [],
        entries: [],
        error: error instanceof ProblemDataError ? error.message : "Your zip file is invalid!",
      };
    }
  },
});

export const zipStorageId = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const { problem } = await requireDataManager(ctx, code);
    const row = await dataRow(ctx, problem._id);
    return { storageId: row?.zipfileStorageId ?? null };
  },
});
