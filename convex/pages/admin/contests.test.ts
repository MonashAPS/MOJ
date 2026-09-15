// @vitest-environment edge-runtime

/**
 * `convex/pages/admin/contests.ts`: the contest edit form's read model, which
 * hands the console names and labels rather than the ids the row carries.
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

describe("pages/admin contests", () => {
  test("the edit form resolves every profile list to usernames", async () => {
    const { t } = await seed();
    const contest = await asUser(t, "root").query(api.pages.admin.contests.edit, { key: "winter" });
    expect(contest?.authors).toEqual(["root"]);
    expect(contest?.testers).toEqual(["setter"]);
    expect(contest?.bannedUsers).toEqual(["member"]);
    expect(contest?.problems.map((row) => `${row.label}:${row.code}`)).toEqual(["A:alpha"]);
    expect(contest?.formatName).toBe("icpc");
  });
});
