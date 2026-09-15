// @vitest-environment edge-runtime

/**
 * `convex/pages/admin/problems.ts`: the console's problem list and its DMOJ
 * filters, the option lists behind the form's Selects, everything the edit
 * form's tabs read, the picker's search and the clone mutation.
 */

import { describe, expect, test } from "vitest";
import { api } from "../../_generated/api";
import {
  asUser,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSubmission,
} from "../../test.fixtures";
import { setupTest } from "../../test.setup";

async function seed() {
  const t = setupTest();

  const ids = await t.run(async (ctx) => {
    const root = await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });

    const setter = await insertProfile(ctx, {
      username: "setter",
      isStaff: true,
      permissions: ["judge.edit_own_problem"],
    });

    const member = await insertProfile(ctx, { username: "member" });

    const group = await insertProblemGroup(ctx, { name: "uncategorized", fullName: "uncategorized" });
    const graphs = await insertProblemGroup(ctx, { name: "graphs", fullName: "graphs" });
    const dp = await ctx.db.insert("problemTypes", { name: "dp", fullName: "Dynamic programming" });
    const language = await insertLanguage(ctx, { key: "PY3" });

    const alpha = await insertProblem(ctx, {
      code: "alpha",
      groupId: group,
      name: "Alpha",
      authorProfileIds: [setter],
      typeIds: [dp],
      allowedLanguageIds: [language],
      points: 50,
    });

    const beta = await insertProblem(ctx, {
      code: "beta",
      groupId: graphs,
      name: "Beta",
      isPublic: false,
      points: 120,
    });

    await ctx.db.insert("problemClarifications", {
      problemId: alpha,
      description: "Read the input to the end.",
      date: Date.UTC(2024, 1, 1),
    });
    await ctx.db.insert("problemTranslations", {
      problemId: alpha,
      language: "fr",
      name: "Alpha (fr)",
      description: "Bonjour",
    });
    await ctx.db.insert("languageLimits", {
      problemId: alpha,
      languageId: language,
      timeLimit: 3,
      memoryLimit: 262144,
    });
    await ctx.db.insert("solutions", {
      problemId: alpha,
      isPublic: true,
      publishOn: Date.UTC(2024, 1, 1),
      authorProfileIds: [setter],
      content: "Sort it.",
    });

    const contest = await insertContest(ctx, { key: "winter", name: "Winter Cup", formatName: "icpc" });
    await ctx.db.patch(contest, {
      authorProfileIds: [root],
      testerProfileIds: [setter],
      bannedProfileIds: [member],
    });
    await insertContestProblem(ctx, {
      contestId: contest,
      problemId: alpha,
      points: 100,
      partial: false,
      isPretested: false,
      order: 0,
    });

    await insertSubmission(ctx, {
      profileId: member,
      problemId: alpha,
      languageId: language,
      result: "AC",
      points: 50,
      legacyId: 7,
    });
    await insertSubmission(ctx, {
      profileId: member,
      problemId: beta,
      languageId: language,
      result: "WA",
      points: 0,
      legacyId: 8,
    });

    await ctx.db.insert("jobs", {
      type: "rejudge",
      status: "done",
      progress: { done: 2, total: 2, stage: "Rejudging submissions" },
      args: { problemCode: "alpha" },
      createdByProfileId: root,
      createdAt: Date.UTC(2024, 2, 1),
      finishedAt: Date.UTC(2024, 2, 1, 0, 1),
    });

    return { root, setter, member, alpha, beta, contest };
  });

  return { t, ids };
}

describe("pages/admin problems", () => {
  test("the list carries the columns and honours DMOJ's filters", async () => {
    const { t } = await seed();
    const viewer = asUser(t, "root");

    const all = await viewer.query(api.pages.admin.problems.list, { page: 1 });
    expect(all.items.map((row) => row.code)).toEqual(["alpha", "beta"]);
    expect(all.total).toBe(2);
    const alpha = all.items[0];
    expect(alpha?.types).toEqual(["Dynamic programming"]);
    expect(alpha?.authors).toEqual(["setter"]);
    expect(alpha?.group).toBe("uncategorized");

    expect(
      (await viewer.query(api.pages.admin.problems.list, { isPublic: false })).items.map((row) => row.code),
    ).toEqual(["beta"]);
    expect(
      (await viewer.query(api.pages.admin.problems.list, { group: "graphs" })).items.map((row) => row.code),
    ).toEqual(["beta"]);
    expect(
      (await viewer.query(api.pages.admin.problems.list, { type: "dp" })).items.map((row) => row.code),
    ).toEqual(["alpha"]);
    expect(
      (await viewer.query(api.pages.admin.problems.list, { author: "setter" })).items.map((row) => row.code),
    ).toEqual(["alpha"]);
    expect((await viewer.query(api.pages.admin.problems.list, { search: "bet" })).items).toHaveLength(1);
  });

  test("a setter only sees the problems they may edit", async () => {
    const { t } = await seed();
    const rows = await asUser(t, "setter").query(api.pages.admin.problems.list, { page: 1 });
    expect(rows.items.map((row) => row.code)).toEqual(["alpha"]);
  });

  test("the edit form gets names, limits, translations and the editorial", async () => {
    const { t } = await seed();
    const problem = await asUser(t, "root").query(api.pages.admin.problems.edit, { code: "alpha" });
    expect(problem).not.toBeNull();
    expect(problem?.authors).toEqual(["setter"]);
    expect(problem?.types).toEqual(["dp"]);
    expect(problem?.allowedLanguages).toEqual(["PY3"]);
    expect(problem?.languageLimits).toEqual([{ languageKey: "PY3", timeLimit: 3, memoryLimit: 262144 }]);
    expect(problem?.translations.map((row) => row.language)).toEqual(["fr"]);
    expect(problem?.clarifications).toHaveLength(1);
    expect(problem?.editorial?.content).toBe("Sort it.");
    expect(problem?.appearances.map((row) => row.contestKey)).toEqual(["winter"]);
    expect(problem?.submissionCount).toBe(1);
  });

  test("the option lists are what the selects offer", async () => {
    const { t } = await seed();
    const options = await asUser(t, "root").query(api.pages.admin.problems.options, {});
    expect(options.groups.map((row) => row.name).sort()).toEqual(["graphs", "uncategorized"]);
    expect(options.types.map((row) => row.name)).toEqual(["dp"]);
    expect(options.languages.map((row) => row.key)).toEqual(["PY3"]);
    expect(options.authors).toEqual(["setter"]);
  });

  test("cloning needs judge.clone_problem and produces a private copy", async () => {
    const { t } = await seed();
    await expect(
      asUser(t, "setter").mutation(api.pages.admin.problems.clone, { code: "alpha", newCode: "alpha2" }),
    ).rejects.toThrow(/clone_problem/);

    const result = await asUser(t, "root").mutation(api.pages.admin.problems.clone, {
      code: "alpha",
      newCode: "alpha2",
    });

    expect(result.code).toBe("alpha2");

    const clone = await asUser(t, "root").query(api.pages.admin.problems.edit, { code: "alpha2" });
    expect(clone?.isPublic).toBe(false);
    expect(clone?.authors).toEqual(["root"]);
    expect(clone?.languageLimits).toHaveLength(1);
  });

  test("a clone cannot take a code that is already used", async () => {
    const { t } = await seed();
    await expect(
      asUser(t, "root").mutation(api.pages.admin.problems.clone, { code: "alpha", newCode: "beta" }),
    ).rejects.toThrow(/already exists/);
  });

  test("the problem picker searches by code and by name", async () => {
    const { t } = await seed();
    const viewer = asUser(t, "root");
    expect((await viewer.query(api.pages.admin.problems.search, { term: "alph" }))[0]?.code).toBe("alpha");
    expect((await viewer.query(api.pages.admin.problems.search, { term: "Beta" }))[0]?.code).toBe("beta");
  });
});
