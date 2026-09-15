// @vitest-environment edge-runtime

/**
 * `jobs.run` is the one entry point a queued `jobs` row is started through, so
 * every job type has to reach a runner from a document alone. `admin/problems`
 * schedules it by name (`"jobs:run"`), which only resolves if the module and
 * the export are both called what that string says.
 *
 * The cron table is exercised the same way: a cron entry is only as good as the
 * function reference it names, so one of them is invoked here directly.
 */

import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  asUser,
  insertContest,
  insertLanguage,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSubmission,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

const jobsRunByName = makeFunctionReference<"mutation">("jobs:run");

async function seedProblem(t: T) {
  return await t.run(async (ctx) => {
    const staffId = await insertProfile(ctx, {
      username: "root",
      isStaff: true,
      isSuperuser: true,
      permissions: ["judge.rejudge_submission", "judge.rejudge_submission_lot", "judge.edit_all_problem"],
    });
    const authorId = await insertProfile(ctx, { username: "author" });
    const languageId = await insertLanguage(ctx, { key: "PY3" });
    const groupId = await insertProblemGroup(ctx);
    const problemId = await insertProblem(ctx, {
      code: "aplusb",
      groupId,
      points: 10,
      allowedLanguageIds: [languageId],
    });
    const submissionId = await insertSubmission(ctx, {
      profileId: authorId,
      problemId,
      languageId,
      result: "AC",
      points: 10,
      casePoints: 1,
      caseTotal: 1,
      legacyId: 1,
    });
    return { staffId, authorId, languageId, problemId, submissionId };
  });
}

async function job(t: T, jobId: Id<"jobs">) {
  return await t.run(async (ctx) => ctx.db.get(jobId));
}

async function insertJob(t: T, type: string, args: Record<string, unknown>): Promise<Id<"jobs">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("jobs", {
      type,
      status: "queued",
      progress: { done: 0, total: 0, stage: "queued" },
      args,
      createdAt: Date.now(),
    }),
  );
}

describe("jobs.run dispatch", () => {
  test("resolves through the string reference admin/problems schedules", async () => {
    const t = setupTest();
    const { problemId } = await seedProblem(t);
    const jobId = await insertJob(t, "rescore", { problemId });

    await t.mutation(jobsRunByName, { jobId });
    await t.finishAllScheduledFunctions(() => {});

    expect((await job(t, jobId))?.status).toBe("done");
  });

  test("a rejudge job resolves the problem by code and requeues the submissions", async () => {
    const t = setupTest();
    const { submissionId } = await seedProblem(t);
    const jobId = await insertJob(t, "rejudge", {
      problemCode: "aplusb",
      idRange: { start: 1, end: 100 },
      languages: [],
      results: [],
      archiveLocked: false,
    });

    await t.mutation(internal.jobs.run, { jobId });
    await t.finishAllScheduledFunctions(() => {});

    const row = await job(t, jobId);
    expect(row?.status).toBe("done");
    expect(row?.result).toEqual({ rejudged: 1, archived: 0 });
    expect((await t.run(async (ctx) => ctx.db.get(submissionId)))?.status).toBe("QU");
  });

  test("a rescore job recomputes the points and the users who earned them", async () => {
    const t = setupTest();
    const { authorId, submissionId } = await seedProblem(t);
    const jobId = await insertJob(t, "rescore", { problemCode: "aplusb" });

    await t.mutation(internal.jobs.run, { jobId });
    await t.finishAllScheduledFunctions(() => {});

    expect((await job(t, jobId))?.status).toBe("done");
    expect((await t.run(async (ctx) => ctx.db.get(submissionId)))?.points).toBe(10);
    expect((await t.run(async (ctx) => ctx.db.get(authorId)))?.points).toBe(10);
  });

  test("the contest job types reach the runners in jobs/contests", async () => {
    const t = setupTest();
    const contestId = await insertContest(t, { key: "open" });

    const rescoreId = await insertJob(t, "rescoreContest", { contestId });
    await t.mutation(internal.jobs.run, { jobId: rescoreId });
    await t.finishAllScheduledFunctions(() => {});
    expect((await job(t, rescoreId))?.status).toBe("done");

    // MOSS needs a key nobody ships, so the runner records why it stopped.
    const mossId = await insertJob(t, "moss", { contestId });
    await t.mutation(internal.jobs.run, { jobId: mossId });
    await t.finishAllScheduledFunctions(() => {});
    const moss = await job(t, mossId);
    expect(moss?.status).toBe("failed");
    expect(moss?.error).toBe("MOSS is not configured.");
  });

  test("a userExport job reaches the action in jobs/users", async () => {
    const t = setupTest();
    const { authorId } = await seedProblem(t);
    const jobId = await insertJob(t, "userExport", {
      profileId: authorId,
      submissionDownload: true,
      commentDownload: false,
      submissionProblemGlob: "*",
      submissionResults: [],
    });

    await t.mutation(internal.jobs.run, { jobId });
    await t.finishAllScheduledFunctions(() => {});

    const row = await job(t, jobId);
    expect(row?.status).toBe("done");
    expect(row?.result).toMatchObject({ submissionCount: 1, commentCount: 0 });
  });

  test("pdf and sitemap are marked done without a runner", async () => {
    const t = setupTest();
    for (const type of ["pdf", "sitemap"] as const) {
      const jobId = await insertJob(t, type, {});
      await t.mutation(internal.jobs.run, { jobId });
      const row = await job(t, jobId);
      expect(row?.status).toBe("done");
      expect(row?.result).toMatchObject({ skipped: true });
    }
  });

  test("an unknown type fails the job instead of throwing", async () => {
    const t = setupTest();
    const jobId = await insertJob(t, "nonsense", {});
    await t.mutation(internal.jobs.run, { jobId });
    expect(await job(t, jobId)).toMatchObject({
      status: "failed",
      error: 'Unknown job type "nonsense".',
    });
  });

  test("admin.problems.rejudgeAll schedules a job that runs to completion", async () => {
    const t = setupTest();
    const { submissionId } = await seedProblem(t);

    const { jobId } = await asUser(t, "root").mutation(api.admin.problems.rejudgeAll, {
      code: "aplusb",
    });
    await t.finishAllScheduledFunctions(() => {});

    expect((await job(t, jobId))?.status).toBe("done");
    expect((await t.run(async (ctx) => ctx.db.get(submissionId)))?.status).toBe("QU");
  });
});

describe("the cron targets", () => {
  test("the contest-mode sweep clears a participation whose contest is gone", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const profileId = await insertProfile(ctx, { username: "ghost" });
      const contestId = await insertContest(ctx, { key: "over" });
      const participationId = await ctx.db.insert("contestParticipations", {
        contestId,
        profileId,
        realStart: Date.UTC(2024, 0, 1),
        score: 0,
        cumtime: 0,
        isDisqualified: false,
        tiebreaker: 0,
        virtual: 0,
        formatData: {},
      });
      await ctx.db.patch(profileId, { currentParticipationId: participationId });
      await ctx.db.delete(contestId);
    });

    expect(await t.mutation(internal.jobs.contests.sweepContestMode, {})).toEqual({ cleared: 1 });
    const profile = await t.run(async (ctx) =>
      ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "ghost"))
        .unique(),
    );
    expect(profile?.currentParticipationId).toBeUndefined();
  });
});
