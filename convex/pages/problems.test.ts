import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import {
  asUser,
  insertContest,
  insertContestProblem,
  insertProblem,
  insertProfile,
  insertSubmission,
  insertTaxonomy,
} from "../test.fixtures";
import { setupTest } from "../test.setup";

describe("pages/problems.filterOptions", () => {
  test("counts only the problems the viewer can see", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId, typeId, graphsTypeId } = await insertTaxonomy(ctx);
      await insertProblem(ctx, { code: "public1", groupId, typeIds: [typeId, graphsTypeId] });
      await insertProblem(ctx, { code: "public2", groupId, typeIds: [graphsTypeId], points: 40 });
      await insertProblem(ctx, { code: "secret", groupId, typeIds: [typeId], isPublic: false });
    });

    const options = await t.query(api.pages.problems.filterOptions, {});
    expect(options.inContest).toBe(false);

    const graphs = options.types.find((row) => row.name === "graphs");
    const uncategorised = options.types.find((row) => row.name === "uncategorized");
    expect(graphs?.count).toBe(2);
    // The private problem is the only other holder of `uncategorized`.
    expect(uncategorised?.count).toBe(1);

    expect(options.groups).toEqual([{ name: "uncategorized", fullName: "Uncategorized", count: 2 }]);
    expect(options.points).toEqual({ min: 40, max: 100 });
  });

  test("an author's own private problem counts for them", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId, typeId } = await insertTaxonomy(ctx);
      const author = await insertProfile(ctx, { username: "author" });
      await insertProblem(ctx, {
        code: "hidden",
        groupId,
        typeIds: [typeId],
        isPublic: false,
        authorProfileIds: [author],
      });
    });

    const anonymous = await t.query(api.pages.problems.filterOptions, {});
    expect(anonymous.types.find((row) => row.name === "uncategorized")?.count).toBe(0);

    const asAuthor = await asUser(t, "author").query(api.pages.problems.filterOptions, {});
    expect(asAuthor.types.find((row) => row.name === "uncategorized")?.count).toBe(1);
  });

  test("lists only contests that carry a visible problem, newest first", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId } = await insertTaxonomy(ctx);
      const older = await insertContest(ctx, { key: "week1", name: "Week 1", startTime: 1_000 });
      const newer = await insertContest(ctx, { key: "week2", name: "Week 2", startTime: 2_000 });
      await insertContest(ctx, { key: "empty", name: "Empty", startTime: 3_000 });
      const problem = await insertProblem(ctx, { code: "aplusb", groupId });
      await insertContestProblem(ctx, { contestId: older, problemId: problem, order: 0 });
      await insertContestProblem(ctx, { contestId: newer, problemId: problem, order: 0 });
    });

    const options = await t.query(api.pages.problems.filterOptions, {});
    expect(options.contests.map((row) => row.key)).toEqual(["week2", "week1"]);
    expect(options.contests[0]?.problemCount).toBe(1);
  });
});

describe("pages/problems.rejudgePreview", () => {
  test("counts what the filter matches, and refuses a non-staff viewer", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await insertTaxonomy(ctx);
      await insertProfile(ctx, { username: "staff", isStaff: true });
      const member = await insertProfile(ctx, { username: "member" });
      const problem = await insertProblem(ctx, { code: "aplusb", groupId });
      await insertSubmission(ctx, {
        profileId: member,
        problemId: problem,
        languageId,
        result: "AC",
        casePoints: 1,
        currentTestcase: 1,
      });
      await insertSubmission(ctx, {
        profileId: member,
        problemId: problem,
        languageId,
        result: "WA",
        currentTestcase: 1,
      });
      await insertSubmission(ctx, {
        profileId: member,
        problemId: problem,
        languageId,
        result: "WA",
        currentTestcase: 1,
      });
    });

    const staff = asUser(t, "staff");
    const all = await staff.query(api.pages.problems.rejudgePreview, { problemCode: "aplusb" });
    expect(all).toEqual({ count: 3, capped: false });

    const wrong = await staff.query(api.pages.problems.rejudgePreview, {
      problemCode: "aplusb",
      results: ["WA"],
    });

    expect(wrong.count).toBe(2);

    const otherLanguage = await staff.query(api.pages.problems.rejudgePreview, {
      problemCode: "aplusb",
      languageKeys: ["CPP20"],
    });

    expect(otherLanguage.count).toBe(0);

    await expect(
      asUser(t, "member").query(api.pages.problems.rejudgePreview, {
        problemCode: "aplusb",
      }),
    ).rejects.toThrow(/Staff only/);
  });

  test("an unknown problem previews as nothing rather than throwing", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "staff", isStaff: true });
    });

    const preview = await asUser(t, "staff").query(api.pages.problems.rejudgePreview, {
      problemCode: "nope",
    });

    expect(preview.count).toBe(0);
  });
});
