// @vitest-environment edge-runtime

/**
 * `convex/pages/admin/console.ts`: the staff gate every console screen sits
 * behind, the permission map the shell draws its rail from, and the name → id
 * lookup the edit forms resolve before they save.
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

describe("pages/admin console gating", () => {
  test("a member sees nothing at all", async () => {
    const { t } = await seed();
    const viewer = asUser(t, "member");
    expect(await viewer.query(api.pages.admin.console.viewer, {})).toBeNull();
    expect((await viewer.query(api.pages.admin.problems.list, { page: 1 })).items).toEqual([]);
    expect(await viewer.query(api.pages.admin.problems.edit, { code: "alpha" })).toBeNull();
    expect(await viewer.query(api.pages.admin.contests.edit, { key: "winter" })).toBeNull();
    expect(await viewer.query(api.pages.admin.jobs.list, {})).toEqual([]);
    expect((await viewer.query(api.pages.admin.submissions.list, {})).items).toEqual([]);
  });

  test("the console reports the viewer's permissions", async () => {
    const { t } = await seed();
    const root = await asUser(t, "root").query(api.pages.admin.console.viewer, {});
    expect(root?.username).toBe("root");
    expect(root?.permissions.changePublicVisibility).toBe(true);

    const setter = await asUser(t, "setter").query(api.pages.admin.console.viewer, {});
    expect(setter?.permissions.editOwnProblem).toBe(true);
    expect(setter?.permissions.changePublicVisibility).toBe(false);
  });
});

describe("pages/admin console lookups", () => {
  test("names resolve back to the ids the mutations take", async () => {
    const { t } = await seed();

    const resolved = await asUser(t, "root").query(api.pages.admin.console.resolveProfiles, {
      usernames: ["root", "nobody"],
    });

    expect(Object.keys(resolved.ids)).toEqual(["root"]);
    expect(resolved.missing).toEqual(["nobody"]);
  });
});
