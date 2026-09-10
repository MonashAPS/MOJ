import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  seedContest,
  seedContestProblem,
  seedProblem,
  seedProfile,
  seedSubmission,
  seedTaxonomy,
} from "./problems.fixtures";

const modules = import.meta.glob("../**/*.ts");

function harness() {
  return convexTest(schema, modules);
}

describe("pages/problems.filterOptions", () => {
  test("counts only the problems the viewer can see", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, typeId, graphsTypeId } = await seedTaxonomy(ctx);
      await seedProblem(ctx, { code: "public1", groupId, typeIds: [typeId, graphsTypeId] });
      await seedProblem(ctx, { code: "public2", groupId, typeIds: [graphsTypeId], points: 40 });
      await seedProblem(ctx, { code: "secret", groupId, typeIds: [typeId], isPublic: false });
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
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, typeId } = await seedTaxonomy(ctx);
      const author = await seedProfile(ctx, { username: "author" });
      await seedProblem(ctx, {
        code: "hidden",
        groupId,
        typeIds: [typeId],
        isPublic: false,
        authorProfileIds: [author],
      });
    });

    const anonymous = await t.query(api.pages.problems.filterOptions, {});
    expect(anonymous.types.find((row) => row.name === "uncategorized")?.count).toBe(0);

    const asAuthor = await t
      .withIdentity({ subject: "user_author" })
      .query(api.pages.problems.filterOptions, {});
    expect(asAuthor.types.find((row) => row.name === "uncategorized")?.count).toBe(1);
  });

  test("lists only contests that carry a visible problem, newest first", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      const older = await seedContest(ctx, { key: "week1", name: "Week 1", startTime: 1_000 });
      const newer = await seedContest(ctx, { key: "week2", name: "Week 2", startTime: 2_000 });
      await seedContest(ctx, { key: "empty", name: "Empty", startTime: 3_000 });
      const problem = await seedProblem(ctx, { code: "aplusb", groupId });
      await seedContestProblem(ctx, { contestId: older, problemId: problem, order: 0 });
      await seedContestProblem(ctx, { contestId: newer, problemId: problem, order: 0 });
    });

    const options = await t.query(api.pages.problems.filterOptions, {});
    expect(options.contests.map((row) => row.key)).toEqual(["week2", "week1"]);
    expect(options.contests[0]?.problemCount).toBe(1);
  });
});

describe("pages/problems.rejudgePreview", () => {
  test("counts what the filter matches, and refuses a non-staff viewer", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await seedTaxonomy(ctx);
      await seedProfile(ctx, { username: "staff", isStaff: true });
      const member = await seedProfile(ctx, { username: "member" });
      const problem = await seedProblem(ctx, { code: "aplusb", groupId });
      await seedSubmission(ctx, { profileId: member, problemId: problem, languageId, result: "AC" });
      await seedSubmission(ctx, { profileId: member, problemId: problem, languageId, result: "WA" });
      await seedSubmission(ctx, { profileId: member, problemId: problem, languageId, result: "WA" });
    });

    const staff = t.withIdentity({ subject: "user_staff" });
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
      t.withIdentity({ subject: "user_member" }).query(api.pages.problems.rejudgePreview, {
        problemCode: "aplusb",
      }),
    ).rejects.toThrow(/Staff only/);
  });

  test("an unknown problem previews as nothing rather than throwing", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      await seedProfile(ctx, { username: "staff", isStaff: true });
    });
    const preview = await t
      .withIdentity({ subject: "user_staff" })
      .query(api.pages.problems.rejudgePreview, { problemCode: "nope" });
    expect(preview.count).toBe(0);
  });
});
