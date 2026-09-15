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
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { setupConvexTest } from "./convexTest.setup";
import {
  makeGroup,
  makeLanguage,
  makeOrganization,
  makeProblem,
  makeProfile,
  makeSubmission,
} from "./fixtures.setup";

function expectedPP(scores: number[], solved: number): number {
  const data = [...scores].filter((value) => value > 0).sort((a, b) => b - a);
  let pp = 0;
  for (let i = 0; i < Math.min(data.length, 100); i++) pp += 0.95 ** i * (data[i] as number);
  return pp + 300 * (1 - 0.997 ** solved);
}

async function seedSolves(
  t: ReturnType<typeof setupConvexTest>,
  username: string,
  scores: { code: string; points: number; total?: number; full?: boolean }[],
): Promise<Id<"profiles">> {
  return await t.run(async (ctx) => {
    const profileId = await makeProfile(ctx, username);
    const groupId = await makeGroup(ctx, "Data structures");
    const languageId = await makeLanguage(ctx);
    let day = 1;
    for (const score of scores) {
      const problemId = await makeProblem(ctx, score.code, groupId, {
        points: score.total ?? 100,
      });
      await makeSubmission(ctx, profileId, problemId, languageId, {
        points: score.points,
        result: score.full === false ? "WA" : "AC",
        casePoints: score.full === false ? 1 : 2,
        caseTotal: 2,
        date: Date.UTC(2025, 0, day++),
      });
    }
    return profileId;
  });
}

describe("profiles.recalculatePoints", () => {
  test("matches DMOJ's points, problem count and performance points", async () => {
    const t = setupConvexTest();
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
      return profile?._id as Id<"profiles">;
    });

    const result = await t.mutation(internal.profiles.recalculatePointsForProfile, { profileId });

    expect(result).toMatchObject({ problemCount: 5 });
    expect(result.points).toBeCloseTo(275, 9);
    expect(result.performancePoints).toBeCloseTo(expectedPP(scores, 5), 9);
  });

  test("organisation-private and non-public problems do not count", async () => {
    const t = setupConvexTest();
    const profileId = await t.run(async (ctx) => {
      const profileId = await makeProfile(ctx, "quiet");
      const groupId = await makeGroup(ctx);
      const languageId = await makeLanguage(ctx);
      const organizationId = await makeOrganization(ctx, "maps", { isOpen: false });

      const publicProblem = await makeProblem(ctx, "pub", groupId, { points: 100 });
      const privateProblem = await makeProblem(ctx, "priv", groupId, {
        points: 100,
        isPublic: false,
      });
      const orgProblem = await makeProblem(ctx, "org", groupId, {
        points: 100,
        isOrganizationPrivate: true,
        organizationIds: [organizationId],
      });

      await makeSubmission(ctx, profileId, publicProblem, languageId, { points: 100 });
      await makeSubmission(ctx, profileId, privateProblem, languageId, { points: 100 });
      await makeSubmission(ctx, profileId, orgProblem, languageId, { points: 100 });
      return profileId;
    });

    const result = await t.mutation(internal.profiles.recalculatePointsForProfile, { profileId });
    expect(result.points).toBe(100);
    expect(result.problemCount).toBe(1);
  });

  test("archived submissions are ignored", async () => {
    const t = setupConvexTest();
    const profileId = await t.run(async (ctx) => {
      const profileId = await makeProfile(ctx, "archivist");
      const groupId = await makeGroup(ctx);
      const languageId = await makeLanguage(ctx);
      const problemId = await makeProblem(ctx, "old", groupId, { points: 100 });
      await makeSubmission(ctx, profileId, problemId, languageId, {
        points: 100,
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
    const t = setupConvexTest();
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
      expect(entry.points).toBeCloseTo(sorted[index] as number, 9);
      expect(entry.weight).toBeCloseTo(weight * 100, 9);
      expect(entry.scaledPoints).toBeCloseTo((sorted[index] as number) * weight, 9);
    });

    expect(page.ppBreakdown[0]?.language).toBe("py3");
    expect(page.ppBreakdown[0]?.shortStatus).toBe("AC");
  });

  test("the breakdown stops when there are fewer problems than weights", async () => {
    const t = setupConvexTest();
    await seedSolves(t, "novice", [
      { code: "a", points: 40 },
      { code: "b", points: 20 },
    ]);

    const page = await t.query(api.profiles.userPage, { username: "novice" });
    expect(page?.ppBreakdown).toHaveLength(2);
    expect(page?.ppHasMore).toBe(false);
  });

  test("the later pages of the breakdown continue the weight table", async () => {
    const t = setupConvexTest();
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
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const profileId = await makeProfile(ctx, "grouped");
      const languageId = await makeLanguage(ctx);
      const dp = await makeGroup(ctx, "Dynamic programming");
      const graphs = await makeGroup(ctx, "Graph theory");

      const one = await makeProblem(ctx, "dp1", dp, { points: 50 });
      const two = await makeProblem(ctx, "dp2", dp, { points: 70 });
      const three = await makeProblem(ctx, "gr1", graphs, { points: 100 });

      await makeSubmission(ctx, profileId, one, languageId, { points: 50 });
      await makeSubmission(ctx, profileId, two, languageId, { points: 35 });
      await makeSubmission(ctx, profileId, three, languageId, { points: 100 });
    });

    const page = await t.query(api.profiles.userPage, { username: "grouped" });
    expect(page?.bestSubmissions.map((group) => [group.name, group.points])).toEqual([
      ["Dynamic programming", 85],
      ["Graph theory", 100],
    ]);
    expect(page?.bestSubmissions[0]?.problems.map((row) => row.code)).toEqual(["dp1", "dp2"]);
  });

  test("rank counts listed users with more performance points", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "top", { performancePoints: 900 });
      await makeProfile(ctx, "middle", { performancePoints: 500 });
      await makeProfile(ctx, "bottom", { performancePoints: 100 });
      await makeProfile(ctx, "ghost", { performancePoints: 5000, isUnlisted: true });
    });

    const page = await t.query(api.profiles.userPage, { username: "middle" });
    expect(page?.rank).toBe(2);
  });

  test("the activity heat map counts submissions per day", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const profileId = await makeProfile(ctx, "busy");
      const groupId = await makeGroup(ctx);
      const languageId = await makeLanguage(ctx);
      const problemId = await makeProblem(ctx, "aplusb", groupId);
      await makeSubmission(ctx, profileId, problemId, languageId, {
        date: Date.UTC(2025, 2, 3, 9),
        points: 100,
      });
      await makeSubmission(ctx, profileId, problemId, languageId, {
        date: Date.UTC(2025, 2, 3, 18),
        points: 100,
      });
      await makeSubmission(ctx, profileId, problemId, languageId, {
        date: Date.UTC(2024, 11, 25),
        points: 50,
      });
    });

    const page = await t.query(api.profiles.userPage, { username: "busy" });
    expect(page?.submissionActivity.counts["2025-03-03"]).toBe(2);
    expect(page?.submissionActivity.counts["2024-12-25"]).toBe(1);
    expect(page?.submissionActivity.minYear).toBe(2024);
  });

  test("rating history and min/max come from the rating rows", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const profileId = await makeProfile(ctx, "rated", { rating: 1600 });
      const first = await ctx.db.insert("contests", contestDoc("early", Date.UTC(2024, 0, 2)));
      const second = await ctx.db.insert("contests", contestDoc("late", Date.UTC(2024, 6, 2)));
      const participation = await ctx.db.insert("contestParticipations", {
        contestId: first,
        profileId,
        realStart: Date.UTC(2024, 0, 1),
        score: 0,
        cumtime: 0,
        isDisqualified: false,
        tiebreaker: 0,
        virtual: 0,
        formatData: {},
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

function contestDoc(key: string, endTime: number) {
  return {
    key,
    name: key,
    authorProfileIds: [],
    curatorProfileIds: [],
    testerProfileIds: [],
    spectatorProfileIds: [],
    testerSeeScoreboard: false,
    testerSeeSubmissions: false,
    description: "",
    startTime: endTime - 3600_000,
    endTime,
    isVisible: true,
    isRated: true,
    viewContestScoreboardProfileIds: [],
    viewContestSubmissionsProfileIds: [],
    scoreboardVisibility: "V" as const,
    useClarifications: false,
    rateAll: false,
    rateExcludeProfileIds: [],
    isPrivate: false,
    privateContestantProfileIds: [],
    hideProblemTags: false,
    hideProblemAuthors: false,
    runPretestsOnly: false,
    showShortDisplay: false,
    isOrganizationPrivate: false,
    organizationIds: [],
    limitJoinOrganizations: false,
    joinOrganizationIds: [],
    classIds: [],
    tagIds: [],
    userCount: 0,
    bannedProfileIds: [],
    formatName: "default",
    formatConfig: {},
    labelScheme: "letters" as const,
    customLabels: [],
    pointsPrecision: 3,
    freezeMinutes: 0,
    blindDuringFreeze: false,
  };
}

describe("profiles.solved", () => {
  test("compare with me drops the problems the viewer already solved", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const target = await makeProfile(ctx, "target");
      const viewer = await makeProfile(ctx, "viewer");
      const groupId = await makeGroup(ctx, "Mixed");
      const languageId = await makeLanguage(ctx);

      const shared = await makeProblem(ctx, "shared", groupId, { points: 100 });
      const only = await makeProblem(ctx, "only", groupId, { points: 100 });

      await makeSubmission(ctx, target, shared, languageId, { points: 100 });
      await makeSubmission(ctx, target, only, languageId, { points: 100 });
      await makeSubmission(ctx, viewer, shared, languageId, { points: 100 });
    });

    const asViewer = t.withIdentity({ subject: "user_viewer" });
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
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "toad", { mute: true });
    });

    await expect(
      t.withIdentity({ subject: "user_toad" }).mutation(api.profiles.updateProfile, {
        timezone: "UTC",
      }),
    ).rejects.toThrow(/silent, little toad/);
  });

  test("about needs a solve first", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "newbie");
    });

    await expect(
      t.withIdentity({ subject: "user_newbie" }).mutation(api.profiles.updateProfile, {
        about: "hello",
      }),
    ).rejects.toThrow(/solve at least one problem/);
  });

  test("a display name override is staff only", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "plain");
      await makeProfile(ctx, "boss", { isStaff: true });
    });

    await expect(
      t.withIdentity({ subject: "user_plain" }).mutation(api.profiles.updateProfile, {
        usernameDisplayOverride: "Plain Jane",
      }),
    ).rejects.toThrow(/Only staff/);

    await t.withIdentity({ subject: "user_boss" }).mutation(api.profiles.updateProfile, {
      usernameDisplayOverride: "The Boss",
    });
    const page = await t.query(api.profiles.userPage, { username: "boss" });
    expect(page?.profile.displayName).toBe("The Boss");
  });

  test("at most three open organisations", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "joiner");
      for (const slug of ["a", "b", "c", "d"]) {
        await makeOrganization(ctx, slug, { isOpen: true });
      }
    });

    const asJoiner = t.withIdentity({ subject: "user_joiner" });
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
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "hopeful");
      await makeOrganization(ctx, "secret", { isOpen: false });
    });

    await expect(
      t.withIdentity({ subject: "user_hopeful" }).mutation(api.profiles.updateProfile, {
        organizationSlugs: ["secret"],
      }),
    ).rejects.toThrow(/may not join/);
  });
});

describe("profiles.verifyLegacyApiToken", () => {
  test("only a matching digest resolves the account", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "legacy", {
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
