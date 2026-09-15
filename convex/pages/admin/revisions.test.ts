// @vitest-environment edge-runtime

/**
 * `convex/pages/admin/revisions.ts`: the history panel every console edit form
 * shows, read by the key a screen has in its URL (`byKey`) or by the document
 * id of an entity that has no key of its own (`byId`).
 */

import { describe, expect, test } from "vitest";
import { api } from "../../_generated/api";
import {
  asUser,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertOrganization,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSubmission,
} from "../../test.fixtures";
import { setupTest } from "../../test.setup";

describe("pages/admin revisions", () => {
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

  test("a problem's revisions come back newest first with their reason", async () => {
    const { t, ids } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("revisions", {
        entityType: "problem",
        entityId: ids.alpha,
        snapshot: { points: 50 },
        authorProfileId: ids.root,
        reason: "First",
        createdAt: 1,
      });
      await ctx.db.insert("revisions", {
        entityType: "problem",
        entityId: ids.alpha,
        snapshot: { points: 75 },
        authorProfileId: ids.root,
        reason: "Second",
        createdAt: 2,
      });
    });

    const rows = await asUser(t, "root").query(api.pages.admin.revisions.byKey, {
      entityType: "problem",
      key: "alpha",
    });

    expect(rows.map((row) => row.reason)).toEqual(["Second", "First"]);
    expect(rows[0]?.author).toBe("root");
  });
});

describe("pages/admin revisions by id", () => {
  async function seed() {
    const t = setupTest();

    const ids = await t.run(async (ctx) => {
      const root = await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });

      const clerk = await insertProfile(ctx, {
        username: "clerk",
        isStaff: true,
        permissions: ["judge.change_profile"],
      });

      const member = await insertProfile(ctx, { username: "member" });
      const languageId = await insertLanguage(ctx, { key: "PY3" });
      await insertLanguage(ctx, { key: "CPP20" });
      const school = await insertOrganization(ctx, { slug: "school", name: "School" });
      const club = await insertOrganization(ctx, { slug: "club", name: "Club" });

      return { root, clerk, member, languageId, school, club };
    });

    return { t, ids };
  }

  test("a member cannot read the history", async () => {
    const { t } = await seed();
    await expect(
      asUser(t, "member").query(api.pages.admin.revisions.byId, {
        entityType: "profiles",
        entityId: "x",
      }),
    ).rejects.toThrow(/Staff only/);
  });

  test("staff read the newest change first, with its author", async () => {
    const { t, ids } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("revisions", {
        entityType: "organizations",
        entityId: ids.school,
        snapshot: {},
        authorProfileId: ids.root,
        reason: "Renamed it",
        createdAt: 1_000,
      });
      await ctx.db.insert("revisions", {
        entityType: "organizations",
        entityId: ids.school,
        snapshot: {},
        authorProfileId: ids.root,
        reason: "Opened enrollment",
        createdAt: 2_000,
      });
      await ctx.db.insert("revisions", {
        entityType: "organizations",
        entityId: ids.club,
        snapshot: {},
        authorProfileId: undefined,
        reason: "Somewhere else",
        createdAt: 3_000,
      });
    });

    const rows = await asUser(t, "root").query(api.pages.admin.revisions.byId, {
      entityType: "organizations",
      entityId: ids.school,
    });

    expect(rows.map((row) => row.reason)).toEqual(["Opened enrollment", "Renamed it"]);
    expect(rows[0]?.author).toBe("root");
  });
});
