// @vitest-environment edge-runtime

/**
 * The user page: performance points, the solved list and profile editing.
 *
 * The performance-point numbers are checked against DMOJ's formula written out
 * longhand in the test, not against `@moj/core`, so a change to either side has
 * to be deliberate. DMOJ:
 *
 *   data = [best score per public problem, > 0] sorted descending
 *   points = sum(data)
 *   pp = sum(0.95**i * data[i] for i in range(min(len(data), 100)))
 *        + 300 * (1 - 0.997 ** solved)
 */

import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  asUser,
  HOUR,
  insertContest,
  insertLanguage,
  insertOrganization,
  insertParticipation,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSubmission,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

function expectedPP(scores: number[], solved: number): number {
  const data = [...scores].filter((value) => value > 0).sort((a, b) => b - a);
  let pp = 0;

  for (const [index, value] of data.slice(0, 100).entries()) pp += 0.95 ** index * value;

  return pp + 300 * (1 - 0.997 ** solved);
}

async function seedSolves(
  t: T,
  username: string,
  scores: { code: string; points: number; total?: number; full?: boolean }[],
): Promise<Id<"profiles">> {
  return await t.run(async (ctx) => {
    const profileId = await insertProfile(ctx, { username });
    const groupId = await insertProblemGroup(ctx, { name: "Data structures" });
    const languageId = await insertLanguage(ctx);
    let day = 1;

    for (const score of scores) {
      const problemId = await insertProblem(ctx, {
        code: score.code,
        groupId,
        points: score.total ?? 100,
      });

      await insertSubmission(ctx, {
        profileId,
        problemId,
        languageId,
        points: score.points,
        result: score.full === false ? "WA" : "AC",
        casePoints: score.full === false ? 1 : 2,
        caseTotal: 2,
        time: 0.1,
        memory: 1024,
        date: Date.UTC(2025, 0, day++),
      });
    }

    return profileId;
  });
}

describe("profiles.recalculatePoints", () => {
  test("matches DMOJ's points, problem count and performance points", async () => {
    const t = setupTest();
    const scores = [100, 80, 50, 30, 15];
    await seedSolves(
      t,
      "solver",
      scores.map((points, index) => ({ code: `p${index}`, points })),
    );

    const profileId = await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "solver"))
        .unique();

      return profile?._id;
    });

    expect(profileId).toBeDefined();

    if (profileId === undefined) return;
    const result = await t.mutation(internal.profiles.recalculatePointsForProfile, { profileId });

    expect(result).toMatchObject({ problemCount: 5 });
    expect(result.points).toBeCloseTo(275, 9);
    expect(result.performancePoints).toBeCloseTo(expectedPP(scores, 5), 9);
  });

  test("organisation-private and non-public problems do not count", async () => {
    const t = setupTest();

    const profileId = await t.run(async (ctx) => {
      const profileId = await insertProfile(ctx, { username: "quiet" });
      const groupId = await insertProblemGroup(ctx);
      const languageId = await insertLanguage(ctx);
      const organizationId = await insertOrganization(ctx, { slug: "maps", isOpen: false });

      const publicProblem = await insertProblem(ctx, { code: "pub", groupId, points: 100 });

      const privateProblem = await insertProblem(ctx, {
        code: "priv",
        groupId,
        points: 100,
        isPublic: false,
      });

      const orgProblem = await insertProblem(ctx, {
        code: "org",
        groupId,
        points: 100,
        isOrganizationPrivate: true,
        organizationIds: [organizationId],
      });

      for (const problemId of [publicProblem, privateProblem, orgProblem]) {
        await insertSubmission(ctx, {
          profileId,
          problemId,
          languageId,
          points: 100,
          result: "AC",
          casePoints: 1,
          caseTotal: 1,
          time: 0.1,
          memory: 1024,
          date: Date.UTC(2024, 5, 1),
        });
      }

      return profileId;
    });

    const result = await t.mutation(internal.profiles.recalculatePointsForProfile, { profileId });
    expect(result.points).toBe(100);
    expect(result.problemCount).toBe(1);
  });

  test("archived submissions are ignored", async () => {
    const t = setupTest();

    const profileId = await t.run(async (ctx) => {
      const profileId = await insertProfile(ctx, { username: "archivist" });
      const groupId = await insertProblemGroup(ctx);
      const languageId = await insertLanguage(ctx);
      const problemId = await insertProblem(ctx, { code: "old", groupId, points: 100 });
      await insertSubmission(ctx, {
        profileId,
        problemId,
        languageId,
        points: 100,
        result: "AC",
        casePoints: 1,
        caseTotal: 1,
        time: 0.1,
        memory: 1024,
        date: Date.UTC(2024, 5, 1),
        isArchived: true,
      });

      return profileId;
    });

    const result = await t.mutation(internal.profiles.recalculatePointsForProfile, { profileId });
    expect(result).toMatchObject({ points: 0, problemCount: 0 });
  });
});

describe("profiles.userPage", () => {
  test("the pp breakdown weights the top ten entries", async () => {
    const t = setupTest();
    const scores = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5];
    await seedSolves(
      t,
      "grinder",
      scores.map((points, index) => ({ code: `q${index}`, points })),
    );

    const page = await t.query(api.profiles.userPage, { username: "grinder" });
    expect(page).not.toBeNull();

    if (!page) return;

    // `get_pp_breakdown(user, start=0, end=10)`.
    expect(page.ppBreakdown).toHaveLength(10);
    expect(page.ppHasMore).toBe(true);

    const sorted = [...scores].sort((a, b) => b - a);
    page.ppBreakdown.forEach((entry, index) => {
      const weight = 0.95 ** index;
      const expected = sorted[index] ?? 0;
      expect(entry.points).toBeCloseTo(expected, 9);
      expect(entry.weight).toBeCloseTo(weight * 100, 9);
      expect(entry.scaledPoints).toBeCloseTo(expected * weight, 9);
    });

    expect(page.ppBreakdown[0]?.language).toBe("py3");
    expect(page.ppBreakdown[0]?.shortStatus).toBe("AC");
  });

  test("the breakdown stops when there are fewer problems than weights", async () => {
    const t = setupTest();
    await seedSolves(t, "novice", [
      { code: "a", points: 40 },
      { code: "b", points: 20 },
    ]);

    const page = await t.query(api.profiles.userPage, { username: "novice" });
    expect(page?.ppBreakdown).toHaveLength(2);
    expect(page?.ppHasMore).toBe(false);
  });

  test("the later pages of the breakdown continue the weight table", async () => {
    const t = setupTest();
    const scores = Array.from({ length: 15 }, (_unused, index) => 100 - index);
    await seedSolves(
      t,
      "long",
      scores.map((points, index) => ({ code: `r${index}`, points })),
    );

    const rest = await t.query(api.profiles.performancePoints, {
      username: "long",
      start: 10,
      end: 15,
    });

    expect(rest.entries).toHaveLength(5);
    expect(rest.entries[0]?.points).toBe(90);
    expect(rest.entries[0]?.weight).toBeCloseTo(0.95 ** 10 * 100, 9);
  });

  test("solved problems are grouped by problem group with a group total", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const profileId = await insertProfile(ctx, { username: "grouped" });
      const languageId = await insertLanguage(ctx);
      const dp = await insertProblemGroup(ctx, { name: "Dynamic programming" });
      const graphs = await insertProblemGroup(ctx, { name: "Graph theory" });

      const one = await insertProblem(ctx, { code: "dp1", groupId: dp, points: 50 });
      const two = await insertProblem(ctx, { code: "dp2", groupId: dp, points: 70 });
      const three = await insertProblem(ctx, { code: "gr1", groupId: graphs, points: 100 });

      for (const [problemId, points] of [
        [one, 50],
        [two, 35],
        [three, 100],
      ] as const) {
        await insertSubmission(ctx, {
          profileId,
          problemId,
          languageId,
          points,
          result: "AC",
          casePoints: 1,
          caseTotal: 1,
          time: 0.1,
          memory: 1024,
          date: Date.UTC(2024, 5, 1),
        });
      }
    });

    const page = await t.query(api.profiles.userPage, { username: "grouped" });
    expect(page?.bestSubmissions.map((group) => [group.name, group.points])).toEqual([
      ["Dynamic programming", 85],
      ["Graph theory", 100],
    ]);
    expect(page?.bestSubmissions[0]?.problems.map((row) => row.code)).toEqual(["dp1", "dp2"]);
  });

  test("rank counts listed users with more performance points", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "top", performancePoints: 900 });
      await insertProfile(ctx, { username: "middle", performancePoints: 500 });
      await insertProfile(ctx, { username: "bottom", performancePoints: 100 });
      await insertProfile(ctx, {
        username: "ghost",
        performancePoints: 5000,
        isUnlisted: true,
      });
    });

    const page = await t.query(api.profiles.userPage, { username: "middle" });
    expect(page?.rank).toBe(2);
  });

  test("the activity heat map counts submissions per day", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const profileId = await insertProfile(ctx, { username: "busy" });
      const groupId = await insertProblemGroup(ctx);
      const languageId = await insertLanguage(ctx);
      const problemId = await insertProblem(ctx, { code: "aplusb", groupId });

      for (const [date, points] of [
        [Date.UTC(2025, 2, 3, 9), 100],
        [Date.UTC(2025, 2, 3, 18), 100],
        [Date.UTC(2024, 11, 25), 50],
      ] as const) {
        await insertSubmission(ctx, {
          profileId,
          problemId,
          languageId,
          date,
          points,
          result: "AC",
          casePoints: 1,
          caseTotal: 1,
          time: 0.1,
          memory: 1024,
        });
      }
    });

    const page = await t.query(api.profiles.userPage, { username: "busy" });
    expect(page?.submissionActivity.counts["2025-03-03"]).toBe(2);
    expect(page?.submissionActivity.counts["2024-12-25"]).toBe(1);
    expect(page?.submissionActivity.minYear).toBe(2024);
  });

  test("rating history and min/max come from the rating rows", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const profileId = await insertProfile(ctx, { username: "rated", rating: 1600 });
      const first = await insertContest(ctx, ratedContest("early", Date.UTC(2024, 0, 2)));
      const second = await insertContest(ctx, ratedContest("late", Date.UTC(2024, 6, 2)));

      const participation = await insertParticipation(ctx, {
        contestId: first,
        profileId,
        realStart: Date.UTC(2024, 0, 1),
      });

      await ctx.db.insert("ratings", {
        profileId,
        contestId: first,
        participationId: participation,
        rank: 3,
        rating: 1400,
        mean: 1400,
        performance: 1500,
        lastRated: Date.UTC(2024, 0, 2),
      });
      await ctx.db.insert("ratings", {
        profileId,
        contestId: second,
        participationId: participation,
        rank: 1,
        rating: 1600,
        mean: 1600,
        performance: 1800,
        lastRated: Date.UTC(2024, 6, 2),
      });
    });

    const page = await t.query(api.profiles.userPage, { username: "rated" });
    expect(page?.contestsWritten).toBe(2);
    expect(page?.ratingStats).toEqual({ current: 1600, min: 1400, max: 1600 });
    expect(page?.ratingHistory.map((entry) => entry.contestKey)).toEqual(["early", "late"]);
    expect(page?.ratingHistory[0]?.ratingClass).toBeTruthy();
  });
});

function ratedContest(key: string, endTime: number) {
  return {
    key,
    name: key,
    startTime: endTime - HOUR,
    endTime,
    rating: { everyone: false, excludeProfileIds: [] },
    useClarifications: false,
    formatConfig: {},
  };
}

describe("profiles.solved", () => {
  test("compare with me drops the problems the viewer already solved", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const target = await insertProfile(ctx, { username: "target" });
      const viewer = await insertProfile(ctx, { username: "viewer" });
      const groupId = await insertProblemGroup(ctx, { name: "Mixed" });
      const languageId = await insertLanguage(ctx);

      const shared = await insertProblem(ctx, { code: "shared", groupId, points: 100 });
      const only = await insertProblem(ctx, { code: "only", groupId, points: 100 });

      for (const [profileId, problemId] of [
        [target, shared],
        [target, only],
        [viewer, shared],
      ] as const) {
        await insertSubmission(ctx, {
          profileId,
          problemId,
          languageId,
          points: 100,
          result: "AC",
          casePoints: 1,
          caseTotal: 1,
          time: 0.1,
          memory: 1024,
          date: Date.UTC(2024, 5, 1),
        });
      }
    });

    const asViewer = asUser(t, "viewer");
    const full = await asViewer.query(api.profiles.solved, { username: "target" });
    expect(full?.groups[0]?.problems.map((row) => row.code)).toEqual(["only", "shared"]);

    const compared = await asViewer.query(api.profiles.solved, {
      username: "target",
      compareWithViewer: true,
    });

    expect(compared?.comparedWith).toBe("viewer");
    expect(compared?.groups[0]?.problems.map((row) => row.code)).toEqual(["only"]);
  });
});

describe("profiles.updateProfile", () => {
  test("a muted user cannot edit their profile", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "toad", mute: true });
    });

    await expect(
      asUser(t, "toad").mutation(api.profiles.updateProfile, {
        timezone: "UTC",
      }),
    ).rejects.toThrow(/silent, little toad/);
  });

  test("about needs a solve first", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "newbie" });
    });

    await expect(
      asUser(t, "newbie").mutation(api.profiles.updateProfile, {
        about: "hello",
      }),
    ).rejects.toThrow(/solve at least one problem/);
  });

  test("a display name override is staff only", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "plain" });
      await insertProfile(ctx, { username: "boss", isStaff: true });
    });

    await expect(
      asUser(t, "plain").mutation(api.profiles.updateProfile, {
        usernameDisplayOverride: "Plain Jane",
      }),
    ).rejects.toThrow(/Only staff/);

    await asUser(t, "boss").mutation(api.profiles.updateProfile, {
      usernameDisplayOverride: "The Boss",
    });
    const page = await t.query(api.profiles.userPage, { username: "boss" });
    expect(page?.profile.displayName).toBe("The Boss");
  });

  test("at most three open organisations", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "joiner" });

      for (const slug of ["a", "b", "c", "d"]) {
        await insertOrganization(ctx, { slug, isOpen: true });
      }
    });

    const asJoiner = asUser(t, "joiner");
    await asJoiner.mutation(api.profiles.updateProfile, {
      organizationSlugs: ["a", "b", "c"],
    });
    const page = await t.query(api.profiles.userPage, { username: "joiner" });
    expect(page?.organizations.map((row) => row.slug)).toEqual(["a", "b", "c"]);

    await expect(
      asJoiner.mutation(api.profiles.updateProfile, {
        organizationSlugs: ["a", "b", "c", "d"],
      }),
    ).rejects.toThrow(/more than 3 public organizations/);
  });

  test("a closed organisation cannot be picked from the profile form", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "hopeful" });
      await insertOrganization(ctx, { slug: "secret", isOpen: false });
    });

    await expect(
      asUser(t, "hopeful").mutation(api.profiles.updateProfile, {
        organizationSlugs: ["secret"],
      }),
    ).rejects.toThrow(/may not join/);
  });
});

describe("profiles.verifyLegacyApiToken", () => {
  test("only a matching digest resolves the account", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, {
        username: "legacy",
        legacyUserId: 42,
        legacyApiTokenHash: "a".repeat(64),
      });
    });

    expect(
      await t.query(api.profiles.apiTokens.verifyLegacy, {
        legacyUserId: 42,
        digest: "a".repeat(64),
      }),
    ).toMatchObject({ username: "legacy", isStaff: false });

    expect(
      await t.query(api.profiles.apiTokens.verifyLegacy, {
        legacyUserId: 42,
        digest: "b".repeat(64),
      }),
    ).toBeNull();

    expect(
      await t.query(api.profiles.apiTokens.verifyLegacy, {
        legacyUserId: 7,
        digest: "a".repeat(64),
      }),
    ).toBeNull();
  });
});
