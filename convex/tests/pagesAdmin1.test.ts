// @vitest-environment edge-runtime

/**
 * The staff console's read models (`convex/pages/admin/*.ts`).
 *
 * The mutations they sit next to are covered by `admin.test.ts`; what matters
 * here is that every one of these is staff-gated, that the list filters are the
 * ones DMOJ's admin offers, and that the edit forms get names rather than ids.
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { setupConvexTest } from "./convexTest.setup";
import {
  makeContest,
  makeGroup,
  makeLanguage,
  makeProblem,
  makeProfile,
  makeSubmission,
} from "./fixtures.setup";

async function seed() {
  const t = setupConvexTest();
  const ids = await t.run(async (ctx) => {
    const root = await makeProfile(ctx, "root", { isStaff: true, isSuperuser: true });
    const setter = await makeProfile(ctx, "setter", {
      isStaff: true,
      permissions: ["judge.edit_own_problem"],
    });
    const member = await makeProfile(ctx, "member");

    const group = await makeGroup(ctx, "uncategorized");
    const graphs = await makeGroup(ctx, "graphs");
    const dp = await ctx.db.insert("problemTypes", { name: "dp", fullName: "Dynamic programming" });
    const language = await makeLanguage(ctx, "PY3");

    const alpha = await makeProblem(ctx, "alpha", group, {
      name: "Alpha",
      authorProfileIds: [setter],
      typeIds: [dp],
      allowedLanguageIds: [language],
      points: 50,
    });
    const beta = await makeProblem(ctx, "beta", graphs, {
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

    const contest = await makeContest(ctx, "winter", {
      name: "Winter Cup",
      formatName: "icpc",
    });
    await ctx.db.patch(contest, {
      authorProfileIds: [root],
      testerProfileIds: [setter],
      bannedProfileIds: [member],
    });
    await ctx.db.insert("contestProblems", {
      contestId: contest,
      problemId: alpha,
      points: 100,
      partial: false,
      isPretested: false,
      order: 0,
    });

    await makeSubmission(ctx, member, alpha, language, { result: "AC", points: 50, legacyId: 7 });
    await makeSubmission(ctx, member, beta, language, { result: "WA", points: 0, legacyId: 8 });

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

const asRoot = { subject: "user_root" };
const asMember = { subject: "user_member" };

describe("pages/admin console gating", () => {
  test("a member sees nothing at all", async () => {
    const { t } = await seed();
    const viewer = t.withIdentity(asMember);
    expect(await viewer.query(api.pages.admin.console.viewer, {})).toBeNull();
    expect((await viewer.query(api.pages.admin.problems.list, { page: 1 })).items).toEqual([]);
    expect(await viewer.query(api.pages.admin.problems.edit, { code: "alpha" })).toBeNull();
    expect(await viewer.query(api.pages.admin.contests.edit, { key: "winter" })).toBeNull();
    expect(await viewer.query(api.pages.admin.jobs.list, {})).toEqual([]);
    expect((await viewer.query(api.pages.admin.submissions.list, {})).items).toEqual([]);
  });

  test("the console reports the viewer's permissions", async () => {
    const { t } = await seed();
    const root = await t.withIdentity(asRoot).query(api.pages.admin.console.viewer, {});
    expect(root?.username).toBe("root");
    expect(root?.permissions.changePublicVisibility).toBe(true);

    const setter = await t.withIdentity({ subject: "user_setter" }).query(api.pages.admin.console.viewer, {});
    expect(setter?.permissions.editOwnProblem).toBe(true);
    expect(setter?.permissions.changePublicVisibility).toBe(false);
  });
});

describe("pages/admin problems", () => {
  test("the list carries the columns and honours DMOJ's filters", async () => {
    const { t } = await seed();
    const viewer = t.withIdentity(asRoot);

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
    const rows = await t
      .withIdentity({ subject: "user_setter" })
      .query(api.pages.admin.problems.list, { page: 1 });
    expect(rows.items.map((row) => row.code)).toEqual(["alpha"]);
  });

  test("the edit form gets names, limits, translations and the editorial", async () => {
    const { t } = await seed();
    const problem = await t.withIdentity(asRoot).query(api.pages.admin.problems.edit, { code: "alpha" });
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
    const options = await t.withIdentity(asRoot).query(api.pages.admin.problems.options, {});
    expect(options.groups.map((row) => row.name).sort()).toEqual(["graphs", "uncategorized"]);
    expect(options.types.map((row) => row.name)).toEqual(["dp"]);
    expect(options.languages.map((row) => row.key)).toEqual(["PY3"]);
    expect(options.authors).toEqual(["setter"]);
  });

  test("cloning needs judge.clone_problem and produces a private copy", async () => {
    const { t } = await seed();
    await expect(
      t
        .withIdentity({ subject: "user_setter" })
        .mutation(api.pages.admin.problems.clone, { code: "alpha", newCode: "alpha2" }),
    ).rejects.toThrow(/clone_problem/);

    const result = await t
      .withIdentity(asRoot)
      .mutation(api.pages.admin.problems.clone, { code: "alpha", newCode: "alpha2" });
    expect(result.code).toBe("alpha2");

    const clone = await t.withIdentity(asRoot).query(api.pages.admin.problems.edit, { code: "alpha2" });
    expect(clone?.isPublic).toBe(false);
    expect(clone?.authors).toEqual(["root"]);
    expect(clone?.languageLimits).toHaveLength(1);
  });

  test("a clone cannot take a code that is already used", async () => {
    const { t } = await seed();
    await expect(
      t.withIdentity(asRoot).mutation(api.pages.admin.problems.clone, { code: "alpha", newCode: "beta" }),
    ).rejects.toThrow(/already exists/);
  });
});

describe("pages/admin contests", () => {
  test("the edit form resolves every profile list to usernames", async () => {
    const { t } = await seed();
    const contest = await t.withIdentity(asRoot).query(api.pages.admin.contests.edit, { key: "winter" });
    expect(contest?.authors).toEqual(["root"]);
    expect(contest?.testers).toEqual(["setter"]);
    expect(contest?.bannedUsers).toEqual(["member"]);
    expect(contest?.problems.map((row) => `${row.label}:${row.code}`)).toEqual(["A:alpha"]);
    expect(contest?.formatName).toBe("icpc");
  });

  test("names resolve back to the ids the mutations take", async () => {
    const { t } = await seed();
    const resolved = await t
      .withIdentity(asRoot)
      .query(api.pages.admin.console.resolveProfiles, { usernames: ["root", "nobody"] });
    expect(Object.keys(resolved.ids)).toEqual(["root"]);
    expect(resolved.missing).toEqual(["nobody"]);
  });

  test("the problem picker searches by code and by name", async () => {
    const { t } = await seed();
    const viewer = t.withIdentity(asRoot);
    expect((await viewer.query(api.pages.admin.problems.search, { term: "alph" }))[0]?.code).toBe("alpha");
    expect((await viewer.query(api.pages.admin.problems.search, { term: "Beta" }))[0]?.code).toBe("beta");
  });
});

describe("pages/admin submissions and jobs", () => {
  test("the submission list filters by problem, result and id range", async () => {
    const { t } = await seed();
    const viewer = t.withIdentity(asRoot);

    const all = await viewer.query(api.pages.admin.submissions.list, {});
    expect(all.total).toBe(2);
    expect(all.items[0]?.username).toBe("member");

    expect((await viewer.query(api.pages.admin.submissions.list, { problemCode: "beta" })).total).toBe(1);
    expect((await viewer.query(api.pages.admin.submissions.list, { results: ["AC"] })).total).toBe(1);
    expect((await viewer.query(api.pages.admin.submissions.list, { idFrom: 8, idTo: 8 })).total).toBe(1);
    expect((await viewer.query(api.pages.admin.submissions.list, { username: "nobody" })).total).toBe(0);
  });

  test("the job list names who started each one", async () => {
    const { t } = await seed();
    const jobs = await t.withIdentity(asRoot).query(api.pages.admin.jobs.list, {});
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.createdBy).toBe("root");
    expect(jobs[0]?.type).toBe("rejudge");
    expect(await t.withIdentity(asRoot).query(api.pages.admin.jobs.list, { status: "failed" })).toEqual([]);
  });
});

describe("pages/admin revisions", () => {
  test("a problem's revisions come back newest first with their reason", async () => {
    const { t, ids } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("revisions", {
        entityType: "problem",
        entityId: ids.alpha as Id<"problems">,
        snapshot: { points: 50 },
        authorProfileId: ids.root,
        reason: "First",
        createdAt: 1,
      });
      await ctx.db.insert("revisions", {
        entityType: "problem",
        entityId: ids.alpha as Id<"problems">,
        snapshot: { points: 75 },
        authorProfileId: ids.root,
        reason: "Second",
        createdAt: 2,
      });
    });

    const rows = await t
      .withIdentity(asRoot)
      .query(api.pages.admin.revisions.byKey, { entityType: "problem", key: "alpha" });
    expect(rows.map((row) => row.reason)).toEqual(["Second", "First"]);
    expect(rows[0]?.author).toBe("root");
  });
});
