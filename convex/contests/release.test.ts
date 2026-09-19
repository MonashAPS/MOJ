/**
 * A contest that asked for it publishes its problems when it ends: by the
 * sweep once the clock passes, or at once when the setting lands on a contest
 * that is already over.
 */

import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import {
  identityOf,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertProblem,
  insertProfile,
} from "../test.fixtures";
import { setupTest, type T } from "../test.setup";

const HOUR = 3_600_000;

async function seed(t: T, endsAgo: number, publishProblemsAt: "start" | "end" | undefined = "end") {
  return await t.run(async (ctx) => {
    const languageId = await insertLanguage(ctx, { key: "PY3" });

    const alpha = await insertProblem(ctx, {
      code: "alpha",
      isPublic: false,
      allowedLanguageIds: [languageId],
    });

    const beta = await insertProblem(ctx, {
      code: "beta",
      isPublic: false,
      allowedLanguageIds: [languageId],
    });

    const now = Date.now();

    const contestId = await insertContest(ctx, {
      key: "weekly",
      startTime: now - endsAgo - HOUR,
      endTime: now - endsAgo,
      publishProblemsAt,
    });

    await insertContestProblem(ctx, { contestId, problemId: alpha, order: 0, points: 1 });
    await insertContestProblem(ctx, { contestId, problemId: beta, order: 1, points: 1 });

    return { contestId, alpha, beta };
  });
}

async function isPublic(t: T, code: string): Promise<boolean | undefined> {
  return await t.run(async (ctx) => {
    const row = await ctx.db
      .query("problems")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();

    return row?.isPublic;
  });
}

describe("the sweep", () => {
  it("publishes the problems of a contest that has ended and asked for it", async () => {
    const t = setupTest();
    const { contestId } = await seed(t, HOUR);

    const first = await t.mutation(internal.jobs.contests.publishEndedContestProblems, {});
    expect(first).toEqual({ contests: 1, problems: 2 });
    expect(await isPublic(t, "alpha")).toBe(true);
    expect(await isPublic(t, "beta")).toBe(true);

    const contest = await t.run(async (ctx) => await ctx.db.get(contestId));
    expect(contest?.problemsPublishedAt).toBeTypeOf("number");

    // Once is enough.
    expect(await t.mutation(internal.jobs.contests.publishEndedContestProblems, {})).toEqual({
      contests: 0,
      problems: 0,
    });
  });

  it("leaves a contest that is still running, or never asked, alone", async () => {
    const t = setupTest();
    await seed(t, -HOUR);
    await t.run(async (ctx) => {
      const problem = await insertProblem(ctx, { code: "gamma", isPublic: false });

      const contestId = await insertContest(ctx, {
        key: "quiet",
        startTime: Date.now() - 3 * HOUR,
        endTime: Date.now() - 2 * HOUR,
      });

      await insertContestProblem(ctx, { contestId, problemId: problem, order: 0, points: 1 });
    });

    expect(await t.mutation(internal.jobs.contests.publishEndedContestProblems, {})).toEqual({
      contests: 0,
      problems: 0,
    });
    expect(await isPublic(t, "alpha")).toBe(false);
    expect(await isPublic(t, "gamma")).toBe(false);
  });

  it("holds back a problem another contest is still going to use", async () => {
    const t = setupTest();
    const { beta } = await seed(t, HOUR);
    await t.run(async (ctx) => {
      const later = await insertContest(ctx, {
        key: "later",
        startTime: Date.now() + HOUR,
        endTime: Date.now() + 2 * HOUR,
      });

      await insertContestProblem(ctx, { contestId: later, problemId: beta, order: 0, points: 1 });
    });

    expect(await t.mutation(internal.jobs.contests.publishEndedContestProblems, {})).toEqual({
      contests: 1,
      problems: 1,
    });
    expect(await isPublic(t, "alpha")).toBe(true);
    expect(await isPublic(t, "beta")).toBe(false);

    const reasons = await t.run(async (ctx) =>
      (await ctx.db.query("revisions").collect()).map((row) => row.reason),
    );

    expect(reasons).toContain("Published when contest weekly ended");
    expect(reasons.some((reason) => reason.includes("beta still in use"))).toBe(true);
  });
});

describe("publishing at the start", () => {
  it("publishes once the contest has started, and not before", async () => {
    const t = setupTest();
    // Started an hour ago, ends in an hour.
    await seed(t, -HOUR, "start");
    await t.run(async (ctx) => {
      const problem = await insertProblem(ctx, { code: "delta", isPublic: false });

      const later = await insertContest(ctx, {
        key: "later",
        startTime: Date.now() + HOUR,
        endTime: Date.now() + 2 * HOUR,
        publishProblemsAt: "start",
      });

      await insertContestProblem(ctx, { contestId: later, problemId: problem, order: 0, points: 1 });
    });

    expect(await t.mutation(internal.jobs.contests.publishEndedContestProblems, {})).toEqual({
      contests: 1,
      problems: 2,
    });
    expect(await isPublic(t, "alpha")).toBe(true);
    expect(await isPublic(t, "delta")).toBe(false);

    const reasons = await t.run(async (ctx) =>
      (await ctx.db.query("revisions").collect()).map((row) => row.reason),
    );

    expect(reasons).toContain("Published when contest weekly started");
  });
});

describe("turning the setting on after the end", () => {
  it("publishes in the same save", async () => {
    const t = setupTest();
    await seed(t, HOUR, undefined);
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });
    });

    await t
      .withIdentity(identityOf("root"))
      .mutation(api.admin.contests.update, { key: "weekly", publishProblemsAt: "end" });

    expect(await isPublic(t, "alpha")).toBe(true);
    expect(await isPublic(t, "beta")).toBe(true);
  });
});
