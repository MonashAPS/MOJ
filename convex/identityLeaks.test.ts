import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertParticipation,
  insertProblem,
  insertProfile,
  insertSubmission,
} from "./test.fixtures";
import { setupTest } from "./test.setup";

describe("problem identity boundaries", () => {
  async function fixture() {
    const t = setupTest();

    const ids = await t.run(async (ctx) => {
      const owner = await insertProfile(ctx, { username: "owner" });
      await insertProfile(ctx, { username: "staff", isStaff: true });
      await insertProfile(ctx, { username: "editor", isSuperuser: true });
      const problem = await insertProblem(ctx, { code: "secret", name: "Secret identity", isPublic: true });

      const contest = await insertContest(ctx, {
        key: "hiddenlist",
        problemListReleaseAt: null,
        startTime: Date.now() - 120000,
        endTime: Date.now() - 1000,
      });

      const link = await insertContestProblem(ctx, { contestId: contest, problemId: problem });
      const participation = await insertParticipation(ctx, { contestId: contest, profileId: owner });
      const language = await insertLanguage(ctx);

      const submission = await insertSubmission(ctx, {
        profileId: owner,
        languageId: language,
        problemId: problem,
        contestId: contest,
        contestProblemId: link,
        participationId: participation,
        date: Date.now() - 60000,
      });

      await ctx.db.insert("scoreboardEvents", {
        key: "hall",
        name: "Hall",
        contestIds: [contest],
        theme: "olympics",
        badgeOrganizationSlugs: [],
        freezeMinutes: 0,
        isPublic: true,
      });

      return { problem, contest, submission };
    });

    return { t, ...ids };
  }

  it("protects unreleased associations in page context, statistics and hall responses", async () => {
    const { t, contest, submission } = await fixture();
    expect(
      (await t.query(api.pages.submissions.listContext, { contestKey: "hiddenlist", problemCode: "secret" }))
        .allowed,
    ).toBe(false);
    expect(
      (await t.query(api.pages.submissions.statusExtras, { submissionId: submission }))?.contest,
    ).toBeNull();
    expect(await t.query(api.contests.stats, { key: "hiddenlist" })).toBeNull();
    expect(await t.query(api.pages.scoreboard.feed, { key: "hall" })).toEqual([]);
    expect((await t.query(api.scoreboard.event, { key: "hall" }))?.divisions[0]?.problems[0]).toMatchObject({
      code: "",
      name: "",
    });
    expect(
      (await asUser(t, "editor").query(api.scoreboard.event, { key: "hall" }))?.divisions[0]?.problems[0]
        ?.code,
    ).toBe("secret");
    expect(
      (await asUser(t, "owner").query(api.pages.submissions.statusExtras, { submissionId: submission }))
        ?.contest?.key,
    ).toBe("hiddenlist");
    await t.run(async (ctx) => ctx.db.patch(contest, { problemListReleaseAt: "end" }));
    expect((await t.query(api.contests.stats, { key: "hiddenlist" }))?.problems[0]?.code).toBe("secret");
    expect(await t.query(api.pages.scoreboard.feed, { key: "hall" })).toHaveLength(1);
  });

  it("protects inaccessible identities even after the list is released", async () => {
    const { t, problem, contest, submission } = await fixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(contest, { problemListReleaseAt: "end" });
      await ctx.db.patch(problem, { isPublic: false });
    });
    expect(
      (await t.query(api.submissions.detail, { submissionId: submission }))?.submission.problem,
    ).toBeNull();
    expect(await t.query(api.pages.submissions.statusExtras, { submissionId: submission })).toBeNull();
    expect((await t.query(api.contests.stats, { key: "hiddenlist" }))?.problems).toEqual([]);
    expect(await t.query(api.pages.scoreboard.feed, { key: "hall" })).toEqual([]);
    expect((await t.query(api.scoreboard.event, { key: "hall" }))?.divisions[0]?.problems[0]).toMatchObject({
      code: "",
      name: "",
    });
    expect(
      (await asUser(t, "staff").query(api.search.global, { term: "Secret" })).filter(
        (hit) => hit.kind === "problem",
      ),
    ).toEqual([]);
    expect(
      (await asUser(t, "owner").query(api.submissions.detail, { submissionId: submission }))?.submission
        .problem?.code,
    ).toBe("secret");
  });

  it("cannot reveal problems by cloning an unreleased or restricted list", async () => {
    const { t, contest, problem } = await fixture();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "cloner", isStaff: true, permissions: ["judge.clone_contest"] });
    });
    const caller = asUser(t, "cloner");
    await expect(
      caller.mutation(api.contests.tools.clone, { key: "hiddenlist", newKey: "copy" }),
    ).rejects.toThrow();
    await t.run(async (ctx) => {
      await ctx.db.patch(contest, { problemListReleaseAt: "end" });
      await ctx.db.patch(problem, { isPublic: false });
    });
    await expect(
      caller.mutation(api.contests.tools.clone, { key: "hiddenlist", newKey: "copy" }),
    ).rejects.toThrow();
    await t.run(async (ctx) => ctx.db.patch(problem, { isPublic: true }));
    expect((await caller.mutation(api.contests.tools.clone, { key: "hiddenlist", newKey: "copy" })).key).toBe(
      "copy",
    );
  });

  it("does not expose associations to an invisible contest after release", async () => {
    const { t, contest, submission } = await fixture();
    await t.run(async (ctx) => ctx.db.patch(contest, { problemListReleaseAt: "end", isVisible: false }));
    expect(
      (await t.query(api.submissions.detail, { submissionId: submission }))?.submission.contest,
    ).toBeNull();
    expect((await t.query(api.apiV2.submissions, {})).objects).toEqual([]);
    expect(
      (await t.query(api.pages.submissions.statusExtras, { submissionId: submission }))?.contest,
    ).toBeNull();
  });
});
