// @vitest-environment edge-runtime

/**
 * Importing a DMOJ dump into a deployment `npm run setup` has already seeded.
 *
 * The seed and the importer both fill the reference tables. The importer used
 * to insert blindly, so a seeded site that was then imported ended up with two
 * rows for every language key and the judge handshake failed with a 400,
 * because the language lookup was no longer unique. The importer matches on the
 * natural key now, the read paths take the first match, and
 * `admin/languages.dedupeByKey` repairs a deployment that was loaded before
 * either of those existed.
 */

import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { SEED_LANGUAGES } from "./lib/seedData";
import {
  asUser,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSubmission,
  judgeRow,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

const JUDGE_KEY_HASH = "a".repeat(64);

/** A judge that has never connected: nothing loaded, and not online yet. */
function offlineJudgeRow() {
  return judgeRow({
    name: "judge.example.com",
    authKeyHash: JUDGE_KEY_HASH,
    tier: 1,
    online: false,
    problemCodes: [],
    runtimeKeys: [],
  });
}

function importedLanguage(key: string, legacyId: number) {
  return {
    key,
    name: `${key} from the dump`,
    shortName: key.toLowerCase(),
    commonName: key,
    editorMode: "text",
    shikiLang: "plaintext",
    template: "",
    info: "",
    description: "",
    extension: key.toLowerCase(),
    legacyId,
  };
}

async function languages(t: T): Promise<Doc<"languages">[]> {
  return await t.run(async (ctx) => await ctx.db.query("languages").collect());
}

describe("importer.insertBatch upserts the reference tables", () => {
  test("importing languages into a seeded deployment leaves one row per key", async () => {
    const t = setupTest();
    await t.mutation(internal.seed.run, {});

    const seeded = await languages(t);
    expect(seeded).toHaveLength(SEED_LANGUAGES.length);
    const py3Before = seeded.find((row) => row.key === "PY3");
    const rustBefore = seeded.find((row) => row.key === "RUST");
    expect(py3Before).toBeDefined();
    expect(rustBefore).toBeDefined();

    const mapping = await t.mutation(internal.importer.insertBatch, {
      table: "languages",
      docs: [importedLanguage("PY3", 4), importedLanguage("RUST", 61), importedLanguage("NIM", 900)],
    });

    const after = await languages(t);
    const keys = after.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    // PY3 and RUST were seeded and are patched; only NIM is a new row.
    expect(after).toHaveLength(SEED_LANGUAGES.length + 1);

    const py3After = after.find((row) => row.key === "PY3");
    expect(py3After?._id).toBe(py3Before?._id);
    expect(py3After?.name).toBe("PY3 from the dump");
    expect(py3After?.legacyId).toBe(4);

    // The mapping is what every later table resolves its language ids against,
    // so it has to name the row that survived, not a second one.
    const byLegacy = new Map(mapping.map((entry) => [entry.legacyId, entry.id]));
    expect(byLegacy.get(4)).toBe(py3Before?._id);
    expect(byLegacy.get(61)).toBe(rustBefore?._id);
    expect(byLegacy.get(900)).toBe(after.find((row) => row.key === "NIM")?._id);
    expect(mapping).toHaveLength(3);
  });

  test("a language id from the mapping resolves on a table imported after it", async () => {
    const t = setupTest();
    await t.mutation(internal.seed.run, {});
    const mapping = await t.mutation(internal.importer.insertBatch, {
      table: "languages",
      docs: [importedLanguage("PY3", 4)],
    });
    const languageId = mapping[0]?.id as Id<"languages">;

    const problemId = await t.run(async (ctx) => {
      const groupId = await insertProblemGroup(ctx, { name: "imported" });
      return await insertProblem(ctx, {
        code: "dumped",
        groupId,
        allowedLanguageIds: [languageId],
      });
    });

    await t.run(async (ctx) => {
      const problem = await ctx.db.get(problemId);
      expect(problem?.allowedLanguageIds).toEqual([languageId]);
      // The id has to be a live row, which is the whole point of the upsert.
      expect(await ctx.db.get(languageId)).not.toBeNull();
    });
  });

  test("the other keyed tables are matched the same way", async () => {
    const t = setupTest();
    await t.mutation(internal.seed.run, {});

    await t.mutation(internal.importer.insertBatch, {
      table: "problemTypes",
      docs: [
        { name: "math", fullName: "Mathematics", legacyId: 3 },
        { name: "flows", fullName: "Network Flow", legacyId: 4 },
      ],
    });
    await t.mutation(internal.importer.insertBatch, {
      table: "flatPages",
      docs: [{ url: "/about/", title: "About us", content: "hello", enableComments: true, legacyId: 1 }],
    });
    await t.mutation(internal.importer.insertBatch, {
      table: "miscConfig",
      docs: [{ key: "announcement", value: "imported", legacyId: 1 }],
    });
    await t.mutation(internal.importer.insertBatch, {
      table: "navigationBar",
      docs: [{ order: 1, key: "home", label: "Home", path: "/", regex: "^/$", legacyId: 12 }],
    });

    await t.run(async (ctx) => {
      const types = await ctx.db.query("problemTypes").collect();
      expect(types.filter((row) => row.name === "math")).toHaveLength(1);
      expect(types.find((row) => row.name === "math")?.fullName).toBe("Mathematics");
      expect(types.filter((row) => row.name === "flows")).toHaveLength(1);

      const pages = await ctx.db.query("flatPages").collect();
      expect(pages.filter((row) => row.url === "/about/")).toHaveLength(1);
      expect(pages.find((row) => row.url === "/about/")?.title).toBe("About us");

      const misc = await ctx.db.query("miscConfig").collect();
      expect(misc.filter((row) => row.key === "announcement")).toHaveLength(1);
      expect(misc.find((row) => row.key === "announcement")?.value).toBe("imported");

      const nav = await ctx.db.query("navigationBar").collect();
      expect(nav.filter((row) => row.key === "home")).toHaveLength(1);
      expect(nav.find((row) => row.key === "home")?.label).toBe("Home");
    });
  });

  test("a table with no natural key still just inserts", async () => {
    const t = setupTest();
    const ids = await t.run(async (ctx) => {
      const groupId = await insertProblemGroup(ctx);
      return { problemId: await insertProblem(ctx, { code: "aplusb", groupId }) };
    });

    await t.mutation(internal.importer.insertBatch, {
      table: "problemClarifications",
      docs: [
        { problemId: ids.problemId, description: "one", date: 1, legacyId: 1 },
        { problemId: ids.problemId, description: "two", date: 2, legacyId: 2 },
      ],
    });

    const rows = await t.run(async (ctx) => await ctx.db.query("problemClarifications").collect());
    expect(rows).toHaveLength(2);
  });
});

describe("the judge handshake survives duplicate languages", () => {
  test("a deployment that already has two rows per key still handshakes", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("languages", { ...importedLanguage("PY3", 0), legacyId: undefined });
      await ctx.db.insert("languages", importedLanguage("PY3", 4));
      await ctx.db.insert("languages", { ...importedLanguage("CPP17", 0), legacyId: undefined });
      await ctx.db.insert("languages", importedLanguage("CPP17", 9));
      await ctx.db.insert("judges", offlineJudgeRow());
    });

    const result = await t.mutation(internal.judging.handshake, {
      judgeName: "judge.example.com",
      authKeyHash: JUDGE_KEY_HASH,
      problems: [["aplusb", 100]],
      executors: { PY3: [["python3", [3, 11, 0]]], CPP17: [["g++", [12, 2, 0]]], NOSUCH: [["x", [1]]] },
    });
    expect(result.ok).toBe(true);

    const runtimes = await t.run(async (ctx) => await ctx.db.query("runtimeVersions").collect());
    expect(runtimes).toHaveLength(2);
    expect(runtimes.map((row) => row.name).sort()).toEqual(["g++", "python3"]);

    const judge = await t.run(
      async (ctx) =>
        await ctx.db
          .query("judges")
          .withIndex("by_name", (q) => q.eq("name", "judge.example.com"))
          .first(),
    );
    expect(judge?.online).toBe(true);
    expect(judge?.runtimeKeys).toEqual(["CPP17", "NOSUCH", "PY3"]);
  });
});

interface DuplicateFixture {
  survivor: Id<"languages">;
  loser: Id<"languages">;
  keeper: Id<"languages">;
  problemId: Id<"problems">;
  profileId: Id<"profiles">;
  submissionIds: Id<"submissions">[];
  limitId: Id<"languageLimits">;
  runtimeId: Id<"runtimeVersions">;
}

async function seedDuplicates(t: T, submissionCount = 3): Promise<DuplicateFixture> {
  return await t.run(async (ctx) => {
    await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });
    // The seeded row comes first and carries no legacyId; the imported row does.
    const loser = await ctx.db.insert("languages", {
      ...importedLanguage("PY3", 0),
      name: "seeded",
      legacyId: undefined,
    });
    const survivor = await ctx.db.insert("languages", importedLanguage("PY3", 4));
    const keeper = await ctx.db.insert("languages", importedLanguage("CPP17", 9));

    const groupId = await insertProblemGroup(ctx);
    const problemId = await insertProblem(ctx, {
      code: "aplusb",
      groupId,
      allowedLanguageIds: [loser, keeper, survivor],
    });
    const profileId = await insertProfile(ctx, { username: "ada" });
    await ctx.db.patch(profileId, { languageId: loser });

    const submissionIds: Id<"submissions">[] = [];
    for (let i = 0; i < submissionCount; i++) {
      submissionIds.push(await insertSubmission(ctx, { profileId, problemId, languageId: loser, date: i }));
    }

    const limitId = await ctx.db.insert("languageLimits", {
      problemId,
      languageId: loser,
      timeLimit: 5,
      memoryLimit: 65536,
    });
    const judgeId = await ctx.db.insert("judges", offlineJudgeRow());
    const runtimeId = await ctx.db.insert("runtimeVersions", {
      languageId: loser,
      judgeId,
      name: "python3",
      version: "3.11.0",
      priority: 0,
    });

    return { survivor, loser, keeper, problemId, profileId, submissionIds, limitId, runtimeId };
  });
}

describe("admin/languages.dedupeByKey", () => {
  test("merges the duplicates onto the imported row and repoints everything", async () => {
    const t = setupTest();
    const ids = await seedDuplicates(t);

    const report = await asUser(t, "root").mutation(api.admin.languages.dedupeByKey, {});

    expect(report.keys).toEqual(["PY3"]);
    expect(report.keysRepaired).toBe(1);
    expect(report.rowsDeleted).toBe(1);
    expect(report.isDone).toBe(true);
    // Three submissions, a profile, a problem, a limit and a runtime version.
    expect(report.referencesRewritten).toBe(7);

    await t.run(async (ctx) => {
      const rows = await ctx.db.query("languages").collect();
      expect(rows.map((row) => row.key).sort()).toEqual(["CPP17", "PY3"]);
      expect(await ctx.db.get(ids.loser)).toBeNull();
      expect(await ctx.db.get(ids.survivor)).not.toBeNull();

      for (const submissionId of ids.submissionIds) {
        expect((await ctx.db.get(submissionId))?.languageId).toBe(ids.survivor);
      }
      const problem = await ctx.db.get(ids.problemId);
      // The loser folds into the survivor without duplicating it.
      expect(problem?.allowedLanguageIds).toEqual([ids.survivor, ids.keeper]);
      expect((await ctx.db.get(ids.profileId))?.languageId).toBe(ids.survivor);
      expect((await ctx.db.get(ids.limitId))?.languageId).toBe(ids.survivor);
      expect((await ctx.db.get(ids.runtimeId))?.languageId).toBe(ids.survivor);
    });
  });

  test("is safe to run twice", async () => {
    const t = setupTest();
    const ids = await seedDuplicates(t);
    const root = asUser(t, "root");

    await root.mutation(api.admin.languages.dedupeByKey, {});
    const second = await root.mutation(api.admin.languages.dedupeByKey, {});

    expect(second).toEqual({
      keys: [],
      keysRepaired: 0,
      rowsDeleted: 0,
      referencesRewritten: 0,
      isDone: true,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("languages").collect()).toHaveLength(2);
      expect((await ctx.db.get(ids.submissionIds[0] as Id<"submissions">))?.languageId).toBe(ids.survivor);
    });
  });

  test("leaves a deployment with no duplicates alone", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });
    });
    await t.mutation(internal.seed.run, {});

    const report = await asUser(t, "root").mutation(api.admin.languages.dedupeByKey, {});
    expect(report).toEqual({
      keys: [],
      keysRepaired: 0,
      rowsDeleted: 0,
      referencesRewritten: 0,
      isDone: true,
    });
    expect(await languages(t)).toHaveLength(SEED_LANGUAGES.length);
  });

  test("finishes a repair too big for one transaction on the scheduler", async () => {
    const t = setupTest();
    const ids = await seedDuplicates(t, 520);

    const first = await asUser(t, "root").mutation(api.admin.languages.dedupeByKey, {});
    expect(first.isDone).toBe(false);
    expect(first.rowsDeleted).toBe(0);
    await t.run(async (ctx) => {
      // Nothing is deleted until every reference has moved.
      expect(await ctx.db.get(ids.loser)).not.toBeNull();
    });

    await t.finishAllScheduledFunctions(() => {});

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.loser)).toBeNull();
      const stragglers = await ctx.db
        .query("submissions")
        .withIndex("by_language_date", (q) => q.eq("languageId", ids.loser))
        .collect();
      expect(stragglers).toHaveLength(0);
      expect((await ctx.db.get(ids.profileId))?.languageId).toBe(ids.survivor);
      expect((await ctx.db.get(ids.problemId))?.allowedLanguageIds).toEqual([ids.survivor, ids.keeper]);
    });
  });

  test("runs from the command line, where there is no signed in superuser", async () => {
    const t = setupTest();
    const ids = await seedDuplicates(t);

    const report = await t.mutation(internal.admin.languages.dedupeByKeyStep, {});
    expect(report.isDone).toBe(true);
    expect(report.rowsDeleted).toBe(1);

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.loser)).toBeNull();
      expect((await ctx.db.get(ids.submissionIds[0] as Id<"submissions">))?.languageId).toBe(ids.survivor);
    });
  });

  test("refuses anyone who is not a superuser", async () => {
    const t = setupTest();
    await seedDuplicates(t);
    await t.run(async (ctx) => {
      await insertProfile(ctx, {
        username: "clerk",
        isStaff: true,
        permissions: ["judge.change_language"],
      });
    });

    await expect(asUser(t, "clerk").mutation(api.admin.languages.dedupeByKey, {})).rejects.toThrow(
      /Superusers only/,
    );
    await expect(t.mutation(api.admin.languages.dedupeByKey, {})).rejects.toThrow(/logged in/);

    expect(await languages(t)).toHaveLength(3);
  });
});
