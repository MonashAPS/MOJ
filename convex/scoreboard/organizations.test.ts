// @vitest-environment edge-runtime
/**
 * Organisation standings (`convex/scoreboard/organizations.ts`): the event's
 * entrants pooled per organisation with diminishing points, over both of its
 * contests, behind the hall board's freeze.
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  asUser,
  HOUR,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertMembership,
  insertOrganization,
  insertParticipation,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSubmission,
  MINUTE,
} from "../test.fixtures";
import { setupTest, type T } from "../test.setup";

type Options = {
  isPublic?: boolean;
  freezeMinutes?: number;
  decay?: number;
  /** Leave the event's organisations unlisted, so every organisation counts. */
  unlisted?: boolean;
};

/**
 * Two halves of one event, both over. Monash fields ada and bob, RMIT fields
 * cid, and nobody else counts: dot has no organisation and eve was
 * disqualified. Bob's second-half accept lands inside the last half hour.
 */
async function event(t: T, options: Options = {}) {
  const now = Date.now();
  const firstStart = now - 5 * HOUR;
  const secondStart = now - 2 * HOUR;

  return await t.run(async (ctx) => {
    const groupId = await insertProblemGroup(ctx);
    const languageId = await insertLanguage(ctx);

    await insertProfile(ctx, { username: "root", isSuperuser: true, isStaff: true });

    const monash = await insertOrganization(ctx, {
      slug: "monash",
      name: "Monash University",
      shortName: "Monash",
      logoOverrideImage: "/unis/monash.svg",
    });

    const rmit = await insertOrganization(ctx, { slug: "rmit", name: "RMIT University", shortName: "RMIT" });
    const maps = await insertOrganization(ctx, { slug: "maps", name: "MAPS" });

    const ada = await insertProfile(ctx, { username: "ada" });
    const bob = await insertProfile(ctx, { username: "bob", usernameDisplayOverride: "Bob" });
    const cid = await insertProfile(ctx, { username: "cid" });
    const dot = await insertProfile(ctx, { username: "dot" });
    const eve = await insertProfile(ctx, { username: "eve" });

    // Ada's club comes first, but the event only lists the universities.
    await insertMembership(ctx, { organizationId: maps, profileId: ada, order: 0 });
    await insertMembership(ctx, { organizationId: monash, profileId: ada, order: 1 });
    await insertMembership(ctx, { organizationId: monash, profileId: bob, order: 0 });
    await insertMembership(ctx, { organizationId: rmit, profileId: cid, order: 0 });
    await insertMembership(ctx, { organizationId: rmit, profileId: eve, order: 0 });

    const first = await insertContest(ctx, {
      key: "first",
      name: "First Half",
      startTime: firstStart,
      endTime: firstStart + 90 * MINUTE,
    });

    const second = await insertContest(ctx, {
      key: "second",
      name: "Second Half",
      startTime: secondStart,
      endTime: secondStart + 90 * MINUTE,
    });

    const problem = async (code: string) => insertProblem(ctx, { code, name: code.toUpperCase(), groupId });

    const firstA = await insertContestProblem(ctx, {
      contestId: first,
      problemId: await problem("apple"),
      order: 0,
      points: 100,
    });

    const firstB = await insertContestProblem(ctx, {
      contestId: first,
      problemId: await problem("banana"),
      order: 1,
      points: 100,
    });

    const secondA = await insertContestProblem(ctx, {
      contestId: second,
      problemId: await problem("cherry"),
      order: 0,
      points: 100,
    });

    const participate = async (
      contestId: Id<"contests">,
      profileId: Id<"profiles">,
      solves: { contestProblemId: Id<"contestProblems">; points: number; at: number }[],
      isDisqualified = false,
    ) => {
      const contest = contestId === first ? firstStart : secondStart;

      const participationId = await insertParticipation(ctx, {
        contestId,
        profileId,
        realStart: contest,
        isDisqualified,
        formatData: Object.fromEntries(
          solves.map((solve) => [solve.contestProblemId, { time: solve.at / 1000, points: solve.points }]),
        ),
      });

      for (const solve of solves) {
        const link = await ctx.db.get(solve.contestProblemId);

        if (!link) throw new Error("missing contest problem");
        await insertSubmission(ctx, {
          profileId,
          problemId: link.problemId,
          languageId,
          contestId,
          contestProblemId: solve.contestProblemId,
          participationId,
          date: contest + solve.at,
          result: solve.points === 100 ? "AC" : "WA",
          points: solve.points,
          casePoints: solve.points,
          caseTotal: 100,
          contestPoints: solve.points,
          time: 0.1,
          memory: 1024,
        });
      }
    };

    await participate(first, ada, [
      { contestProblemId: firstA, points: 100, at: 10 * MINUTE },
      { contestProblemId: firstB, points: 40, at: 20 * MINUTE },
    ]);
    await participate(first, bob, [{ contestProblemId: firstA, points: 60, at: 15 * MINUTE }]);
    await participate(first, cid, [{ contestProblemId: firstA, points: 100, at: 5 * MINUTE }]);
    await participate(first, dot, [{ contestProblemId: firstA, points: 100, at: 5 * MINUTE }]);
    await participate(first, eve, [{ contestProblemId: firstB, points: 100, at: 5 * MINUTE }], true);
    await participate(second, ada, [{ contestProblemId: secondA, points: 50, at: 10 * MINUTE }]);
    await participate(second, bob, [{ contestProblemId: secondA, points: 100, at: 80 * MINUTE }]);
    await participate(second, cid, [{ contestProblemId: secondA, points: 100, at: 20 * MINUTE }]);

    await ctx.db.insert("scoreboardEvents", {
      key: "cup",
      name: "The Cup",
      contestIds: [first, second],
      theme: "default",
      badgeOrganizationSlugs: [],
      freezeMinutes: options.freezeMinutes ?? 0,
      isPublic: options.isPublic ?? true,
      organizationStandings: {
        decay: options.decay ?? 0.5,
        organizationIds: options.unlisted ? [] : [rmit, monash],
      },
    });

    return { first, second };
  });
}

describe("organisation standings", () => {
  test("pools each problem with the decay over both contests", async () => {
    const t = setupTest();
    await event(t);

    const payload = await t.query(api.scoreboard.organizations.standings, { key: "cup" });

    expect(payload?.event).toEqual({ key: "cup", name: "The Cup" });
    expect(payload?.decay).toBe(0.5);
    expect(payload?.frozen).toBe(false);
    expect(payload?.contests.map((contest) => contest.key)).toEqual(["first", "second"]);
    expect(payload?.problems.map((problem) => [problem.contestKey, problem.label, problem.code])).toEqual([
      ["first", "A", "apple"],
      ["first", "B", "banana"],
      ["second", "A", "cherry"],
    ]);

    // Monash: 100 + 60/2 on apple, 40 on banana, 100 + 50/2 on cherry.
    const [monash, rmit] = payload?.organizations ?? [];
    expect(monash).toMatchObject({ slug: "monash", rank: 1, total: 295, logoUrl: "/unis/monash.svg" });
    expect(monash?.problems.map((problem) => problem.score)).toEqual([130, 40, 125]);
    expect(monash?.entrants).toEqual([
      { username: "ada", displayName: "ada", total: 190 },
      { username: "bob", displayName: "Bob", total: 160 },
    ]);

    // RMIT has only cid: eve was disqualified.
    expect(rmit).toMatchObject({ slug: "rmit", rank: 2, total: 200, logoUrl: null });
    expect(rmit?.entrants.map((entrant) => entrant.username)).toEqual(["cid"]);
  });

  test("decay 1 adds every entrant in full and 0 keeps only the best", async () => {
    const full = setupTest();
    await event(full, { decay: 1 });
    const summed = await full.query(api.scoreboard.organizations.standings, { key: "cup" });
    expect(summed?.organizations.find((row) => row.slug === "monash")?.total).toBe(350);

    const best = setupTest();
    await event(best, { decay: 0 });
    const kept = await best.query(api.scoreboard.organizations.standings, { key: "cup" });
    expect(kept?.organizations.map((row) => [row.slug, row.rank, row.total])).toEqual([
      ["monash", 1, 240],
      ["rmit", 2, 200],
    ]);
  });

  test("with no organisations listed, every entrant's first organisation counts", async () => {
    const t = setupTest();
    await event(t, { unlisted: true });

    const payload = await t.query(api.scoreboard.organizations.standings, { key: "cup" });

    // Ada now counts for MAPS, her first membership.
    expect(payload?.organizations.map((row) => [row.slug, row.total])).toEqual([
      ["rmit", 200],
      ["maps", 190],
      ["monash", 160],
    ]);
  });

  test("a frozen division stops at the freeze for the public, not for staff", async () => {
    const t = setupTest();
    await event(t, { freezeMinutes: 30 });

    const hall = await t.query(api.scoreboard.organizations.standings, { key: "cup" });
    expect(hall?.frozen).toBe(true);

    // Bob's cherry came in at minute 80 of 90, after the freeze.
    const monash = hall?.organizations.find((row) => row.slug === "monash");
    expect(monash?.problems.map((problem) => problem.score)).toEqual([130, 40, 50]);
    expect(monash?.total).toBe(220);

    const staff = await asUser(t, "root").query(api.scoreboard.organizations.standings, { key: "cup" });
    expect(staff?.frozen).toBe(false);
    expect(staff?.organizations.find((row) => row.slug === "monash")?.total).toBe(295);
  });

  test("a cell the reveal has shown counts in full again", async () => {
    const t = setupTest();
    const { second } = await event(t, { freezeMinutes: 30 });

    await t.run(async (ctx) => {
      const bob = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "bob"))
        .unique();

      if (!bob) throw new Error("missing bob");

      const participation = await ctx.db
        .query("contestParticipations")
        .withIndex("by_contest_profile", (q) => q.eq("contestId", second).eq("profileId", bob._id))
        .unique();

      if (!participation) throw new Error("missing participation");
      await ctx.db.patch(second, {
        reveal: { lifted: false, cells: [{ participationId: participation._id, cellIndex: 0 }] },
      });
    });

    const hall = await t.query(api.scoreboard.organizations.standings, { key: "cup" });
    expect(hall?.organizations.find((row) => row.slug === "monash")?.total).toBe(295);
  });

  test("is null for an event without standings, and a private event is staff only", async () => {
    const t = setupTest();
    await event(t, { isPublic: false });

    expect(await t.query(api.scoreboard.organizations.standings, { key: "cup" })).toBeNull();
    expect(
      await asUser(t, "root").query(api.scoreboard.organizations.standings, { key: "cup" }),
    ).not.toBeNull();
    expect(await t.query(api.scoreboard.organizations.standings, { key: "nope" })).toBeNull();

    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("scoreboardEvents")
        .withIndex("by_key", (q) => q.eq("key", "cup"))
        .unique();

      if (row) await ctx.db.patch(row._id, { organizationStandings: undefined });
    });

    expect(await asUser(t, "root").query(api.scoreboard.organizations.standings, { key: "cup" })).toBeNull();
  });
});
