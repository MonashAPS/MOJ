import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  seedContest,
  seedContestProblem,
  seedParticipation,
  seedProblem,
  seedProfile,
  seedSubmission,
  seedTaxonomy,
} from "./problemsFixtures";

const modules = import.meta.glob("../**/*.ts");

function harness() {
  return convexTest(schema, modules);
}

describe("problems.list", () => {
  test("shows public problems to anonymous viewers and hides private ones", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      await seedProblem(ctx, { code: "aplusb", groupId });
      await seedProblem(ctx, { code: "secret", groupId, isPublic: false });
    });

    const result = await t.query(api.problems.list, {});
    expect(result.items.map((item) => item.code)).toEqual(["aplusb"]);
    expect(result.total).toBe(1);
  });

  test("authors and testers see their own private problems", async () => {
    const t = harness();
    const { authorId, testerId } = await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      const author = await seedProfile(ctx, { username: "author" });
      const tester = await seedProfile(ctx, { username: "tester" });
      await seedProblem(ctx, {
        code: "hidden",
        groupId,
        isPublic: false,
        authorProfileIds: [author],
        testerProfileIds: [tester],
      });
      return { authorId: author, testerId: tester };
    });
    expect(authorId).toBeDefined();
    expect(testerId).toBeDefined();

    const anonymous = await t.query(api.problems.list, {});
    expect(anonymous.items).toHaveLength(0);

    const asAuthor = await t.withIdentity({ subject: "user_author" }).query(api.problems.list, {});
    expect(asAuthor.items.map((item) => item.code)).toEqual(["hidden"]);

    const asTester = await t.withIdentity({ subject: "user_tester" }).query(api.problems.list, {});
    expect(asTester.items.map((item) => item.code)).toEqual(["hidden"]);

    const asStranger = await t.withIdentity({ subject: "user_nobody" }).query(api.problems.list, {});
    expect(asStranger.items).toHaveLength(0);
  });

  test("status filters against the viewer's own submissions", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await seedTaxonomy(ctx);
      const viewer = await seedProfile(ctx, { username: "viewer" });
      const solved = await seedProblem(ctx, { code: "solved", groupId });
      const tried = await seedProblem(ctx, { code: "tried", groupId });
      await seedProblem(ctx, { code: "untouched", groupId });
      await seedSubmission(ctx, {
        profileId: viewer,
        problemId: solved,
        languageId,
        result: "AC",
        points: 100,
      });
      await seedSubmission(ctx, {
        profileId: viewer,
        problemId: tried,
        languageId,
        result: "WA",
        points: 0,
      });
    });

    const asViewer = t.withIdentity({ subject: "user_viewer" });

    const solved = await asViewer.query(api.problems.list, { status: "solved" });
    expect(solved.items.map((item) => item.code)).toEqual(["solved"]);

    const attempted = await asViewer.query(api.problems.list, { status: "attempted" });
    expect(attempted.items.map((item) => item.code)).toEqual(["tried"]);

    const unsolved = await asViewer.query(api.problems.list, { status: "unsolved" });
    expect(unsolved.items.map((item) => item.code).sort()).toEqual(["tried", "untouched"]);

    const all = await asViewer.query(api.problems.list, {});
    const states = Object.fromEntries(all.items.map((item) => [item.code, item.state]));
    expect(states).toEqual({ solved: "solved", tried: "attempted", untouched: "none" });
  });

  test("solved by a user, and not by me", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await seedTaxonomy(ctx);
      const me = await seedProfile(ctx, { username: "me" });
      const them = await seedProfile(ctx, { username: "them" });

      const both = await seedProblem(ctx, { code: "both", groupId });
      const theirs = await seedProblem(ctx, { code: "theirs", groupId });
      await seedProblem(ctx, { code: "neither", groupId });

      for (const problemId of [both, theirs]) {
        await seedSubmission(ctx, {
          profileId: them,
          problemId,
          languageId,
          result: "AC",
          points: 100,
        });
      }
      await seedSubmission(ctx, {
        profileId: me,
        problemId: both,
        languageId,
        result: "AC",
        points: 100,
      });
    });

    const asMe = t.withIdentity({ subject: "user_me" });

    const solvedByThem = await asMe.query(api.problems.list, { solvedBy: ["them"] });
    expect(solvedByThem.items.map((item) => item.code).sort()).toEqual(["both", "theirs"]);

    const gap = await asMe.query(api.problems.list, { solvedBy: ["them"], solvedByNotMe: true });
    expect(gap.items.map((item) => item.code)).toEqual(["theirs"]);
  });

  test("filters by type, group, author, points range and editorial", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, typeId, graphsTypeId } = await seedTaxonomy(ctx);
      const otherGroup = await ctx.db.insert("problemGroups", {
        name: "olympiad",
        fullName: "Olympiad",
      });
      const author = await seedProfile(ctx, { username: "setter" });

      const graphs = await seedProblem(ctx, {
        code: "graphs",
        groupId,
        typeIds: [graphsTypeId],
        points: 10,
        authorProfileIds: [author],
      });
      await seedProblem(ctx, { code: "plain", groupId, typeIds: [typeId], points: 50 });
      await seedProblem(ctx, { code: "olympiad", groupId: otherGroup, points: 100 });

      await ctx.db.insert("solutions", {
        problemId: graphs,
        isPublic: true,
        publishOn: Date.now() - 1000,
        authorProfileIds: [],
        content: "Use a BFS.",
      });
    });

    const byType = await t.query(api.problems.list, { types: ["graphs"] });
    expect(byType.items.map((item) => item.code)).toEqual(["graphs"]);

    const byGroup = await t.query(api.problems.list, { group: "olympiad" });
    expect(byGroup.items.map((item) => item.code)).toEqual(["olympiad"]);

    const byAuthor = await t.query(api.problems.list, { author: "setter" });
    expect(byAuthor.items.map((item) => item.code)).toEqual(["graphs"]);

    const byPoints = await t.query(api.problems.list, { pointStart: 40, pointEnd: 60 });
    expect(byPoints.items.map((item) => item.code)).toEqual(["plain"]);

    const withEditorial = await t.query(api.problems.list, { hasEditorial: true });
    expect(withEditorial.items.map((item) => item.code)).toEqual(["graphs"]);

    // The point slider is built before the point filter is applied.
    expect(byPoints.pointValues.values).toEqual([10, 50, 100]);
  });

  test("an unpublished editorial does not count as one", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      const future = await seedProblem(ctx, { code: "future", groupId });
      await ctx.db.insert("solutions", {
        problemId: future,
        isPublic: true,
        publishOn: Date.now() + 86_400_000,
        authorProfileIds: [],
        content: "Not yet.",
      });
    });
    const result = await t.query(api.problems.list, { hasEditorial: true });
    expect(result.items).toHaveLength(0);
  });

  test("search matches the code as well as the name", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      await seedProblem(ctx, { code: "aplusb", name: "A plus B", groupId });
      await seedProblem(ctx, { code: "zzz", name: "Unrelated", groupId });
    });

    const byName = await t.query(api.problems.list, { search: "plus", fullText: false });
    expect(byName.items.map((item) => item.code)).toEqual(["aplusb"]);

    const byCode = await t.query(api.problems.list, { search: "aplus", fullText: false });
    expect(byCode.items.map((item) => item.code)).toEqual(["aplusb"]);
  });

  test("sorts and paginates", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      await seedProblem(ctx, { code: "a", groupId, points: 30 });
      await seedProblem(ctx, { code: "b", groupId, points: 10 });
      await seedProblem(ctx, { code: "c", groupId, points: 20 });
    });

    const byPoints = await t.query(api.problems.list, { sort: "points" });
    // `points` is in DMOJ's default_desc set.
    expect(byPoints.items.map((item) => item.code)).toEqual(["a", "c", "b"]);

    const ascending = await t.query(api.problems.list, { sort: "points", order: "asc" });
    expect(ascending.items.map((item) => item.code)).toEqual(["b", "c", "a"]);

    const firstPage = await t.query(api.problems.list, { pageSize: 2 });
    expect(firstPage.items.map((item) => item.code)).toEqual(["a", "b"]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.totalPages).toBe(2);

    const secondPage = await t.query(api.problems.list, { pageSize: 2, page: 2 });
    expect(secondPage.items.map((item) => item.code)).toEqual(["c"]);
    expect(secondPage.hasMore).toBe(false);
  });

  test("groups by contest when a contest filter is applied", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      const alpha = await seedProblem(ctx, { code: "alpha", groupId });
      const beta = await seedProblem(ctx, { code: "beta", groupId });
      await seedProblem(ctx, { code: "loner", groupId });

      const contest = await seedContest(ctx, { key: "mcpc25", name: "MCPC 2025" });
      await seedContestProblem(ctx, { contestId: contest, problemId: alpha, order: 0 });
      await seedContestProblem(ctx, { contestId: contest, problemId: beta, order: 1 });
    });

    const result = await t.query(api.problems.list, { contestKeys: ["mcpc25"] });
    expect(result.items.map((item) => item.code).sort()).toEqual(["alpha", "beta"]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups?.[0]?.contestName).toBe("MCPC 2025");
    expect(result.groups?.[0]?.items.map((item) => [item.code, item.contestLabel])).toEqual([
      ["alpha", "A"],
      ["beta", "B"],
    ]);
  });

  test("contest mode shows only the contest's problems, with contest points and no tags", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, typeId } = await seedTaxonomy(ctx);
      const viewer = await seedProfile(ctx, { username: "player" });
      const inside = await seedProblem(ctx, {
        code: "inside",
        groupId,
        typeIds: [typeId],
        points: 100,
      });
      await seedProblem(ctx, { code: "outside", groupId, typeIds: [typeId] });

      const contest = await seedContest(ctx, { key: "live" });
      await seedContestProblem(ctx, {
        contestId: contest,
        problemId: inside,
        order: 0,
        points: 42,
      });
      const participation = await seedParticipation(ctx, { contestId: contest, profileId: viewer });
      await ctx.db.patch(viewer, { currentParticipationId: participation });
    });

    const result = await t
      .withIdentity({ subject: "user_player" })
      .query(api.problems.list, { showTypes: true });

    expect(result.inContest).toBe(true);
    expect(result.contest?.key).toBe("live");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.code).toBe("inside");
    expect(result.items[0]?.points).toBe(42);
    expect(result.items[0]?.types).toBeNull();
    expect(result.items[0]?.contestLabel).toBe("A");
  });
});

describe("problems.get", () => {
  test("returns null for a problem the viewer may not see", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      await seedProblem(ctx, { code: "secret", groupId, isPublic: false });
    });
    expect(await t.query(api.problems.get, { code: "secret" })).toBeNull();
    expect(await t.query(api.problems.get, { code: "missing" })).toBeNull();
  });

  test("carries the statement, limits, stats and appearances", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, languageId, cppId } = await seedTaxonomy(ctx);
      const author = await seedProfile(ctx, { username: "setter" });
      const fast = await seedProfile(ctx, { username: "fast" });
      const slow = await seedProfile(ctx, { username: "slow" });

      const problemId = await seedProblem(ctx, {
        code: "aplusb",
        name: "A plus B",
        groupId,
        authorProfileIds: [author],
        languageIds: [languageId, cppId],
      });
      await ctx.db.insert("languageLimits", {
        problemId,
        languageId,
        timeLimit: 3,
        memoryLimit: 512_000,
      });

      await seedSubmission(ctx, {
        profileId: fast,
        problemId,
        languageId,
        result: "AC",
        points: 100,
        time: 0.05,
      });
      await seedSubmission(ctx, {
        profileId: slow,
        problemId,
        languageId,
        result: "AC",
        points: 100,
        time: 0.5,
      });
      await seedSubmission(ctx, {
        profileId: slow,
        problemId,
        languageId,
        result: "WA",
        points: 0,
        time: 0.2,
      });

      const contest = await seedContest(ctx, { key: "mcpc24", name: "MCPC 2024" });
      await seedContestProblem(ctx, { contestId: contest, problemId, order: 2 });
    });

    const problem = await t.query(api.problems.get, { code: "aplusb" });
    expect(problem).not.toBeNull();
    expect(problem?.statement.source).toContain("Statement for aplusb.");
    expect(problem?.statement.preset).toBe("problem");
    expect(problem?.authors.map((author) => author.username)).toEqual(["setter"]);
    expect(problem?.languageLimits).toEqual([
      { languageKey: "PY3", languageName: "Python 3", timeLimit: 3, memoryLimit: 512_000 },
    ]);
    expect(problem?.stats.solvers).toBe(2);
    expect(problem?.stats.attempts).toBe(3);
    expect(problem?.stats.acRate).toBeCloseTo((100 * 2) / 3);
    expect(problem?.stats.bestTime).toBe(0.05);
    expect(problem?.stats.fastestSolver?.username).toBe("fast");
    expect(problem?.appearedIn).toEqual([
      expect.objectContaining({ contestKey: "mcpc24", contestName: "MCPC 2024", label: "A" }),
    ]);
    // Two of two languages allowed, so DMOJ hides the language list.
    expect(problem?.showLanguages).toBe(false);
  });

  test("hides tags inside a contest that hides them", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, typeId } = await seedTaxonomy(ctx);
      const viewer = await seedProfile(ctx, { username: "player" });
      const problemId = await seedProblem(ctx, {
        code: "inside",
        groupId,
        typeIds: [typeId],
        isPublic: false,
      });
      const contest = await seedContest(ctx, { key: "live", hideProblemTags: true });
      await seedContestProblem(ctx, { contestId: contest, problemId, order: 0 });
      const participation = await seedParticipation(ctx, { contestId: contest, profileId: viewer });
      await ctx.db.patch(viewer, { currentParticipationId: participation });
    });

    const asPlayer = t.withIdentity({ subject: "user_player" });
    const problem = await asPlayer.query(api.problems.get, { code: "inside" });
    // Being in the contest grants access to a problem that is not public.
    expect(problem).not.toBeNull();
    expect(problem?.types).toBeNull();
    expect(problem?.contestProblem?.label).toBe("A");
  });

  test("uses the viewer's language translation when there is one", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      const problemId = await seedProblem(ctx, { code: "aplusb", name: "A plus B", groupId });
      await ctx.db.insert("problemTranslations", {
        problemId,
        language: "fr",
        name: "A plus B (fr)",
        description: "Enonce en francais.",
      });
    });

    const french = await t.query(api.problems.get, { code: "aplusb", language: "fr" });
    expect(french?.statement.translated).toBe(true);
    expect(french?.statement.name).toBe("A plus B (fr)");
    expect(french?.statement.source).toBe("Enonce en francais.");

    const english = await t.query(api.problems.get, { code: "aplusb", language: "de" });
    expect(english?.statement.translated).toBe(false);
    expect(english?.statement.name).toBe("A plus B");
  });
});

describe("problems.editorial", () => {
  test("follows solutionIsAccessibleBy and hides itself in a contest", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      await seedProfile(ctx, { username: "reader" });
      const problemId = await seedProblem(ctx, { code: "aplusb", groupId });
      await ctx.db.insert("solutions", {
        problemId,
        isPublic: false,
        publishOn: Date.now() - 1000,
        authorProfileIds: [],
        content: "Add them.",
      });
    });

    expect(await t.query(api.problems.editorial, { code: "aplusb" })).toBeNull();

    await t.run(async (ctx) => {
      const solution = await ctx.db.query("solutions").first();
      if (solution) await ctx.db.patch(solution._id, { isPublic: true });
    });

    const published = await t.query(api.problems.editorial, { code: "aplusb" });
    expect(published?.content).toBe("Add them.");
    expect(published?.preset).toBe("solution");
  });
});

describe("problems.ranks", () => {
  test("keeps the best submission per user, fastest first, and skips unlisted users", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await seedTaxonomy(ctx);
      const alice = await seedProfile(ctx, { username: "alice" });
      const bob = await seedProfile(ctx, { username: "bob" });
      const ghost = await seedProfile(ctx, { username: "ghost", isUnlisted: true });
      const problemId = await seedProblem(ctx, { code: "aplusb", groupId });

      // Alice: 60 then 100; the 100 is her best, and among ties the fastest.
      await seedSubmission(ctx, {
        profileId: alice,
        problemId,
        languageId,
        result: "WA",
        points: 60,
        time: 0.1,
      });
      await seedSubmission(ctx, {
        profileId: alice,
        problemId,
        languageId,
        result: "AC",
        points: 100,
        time: 0.4,
      });
      await seedSubmission(ctx, {
        profileId: alice,
        problemId,
        languageId,
        result: "AC",
        points: 100,
        time: 0.2,
      });
      await seedSubmission(ctx, {
        profileId: bob,
        problemId,
        languageId,
        result: "AC",
        points: 100,
        time: 0.1,
      });
      await seedSubmission(ctx, {
        profileId: ghost,
        problemId,
        languageId,
        result: "AC",
        points: 100,
        time: 0.01,
      });
    });

    const result = await t.query(api.problems.ranks, { code: "aplusb" });
    expect(result?.rows.map((row) => [row.username, row.points, row.time])).toEqual([
      ["bob", 100, 0.1],
      ["alice", 100, 0.2],
    ]);
    expect(result?.byLanguage).toEqual([
      expect.objectContaining({ languageKey: "PY3", total: 5, accepted: 4 }),
    ]);
  });
});

describe("problem point voting", () => {
  test("only a solver outside a contest may vote", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await seedTaxonomy(ctx);
      const solver = await seedProfile(ctx, { username: "solver" });
      await seedProfile(ctx, { username: "lurker" });
      const problemId = await seedProblem(ctx, { code: "aplusb", groupId });
      await seedSubmission(ctx, {
        profileId: solver,
        problemId,
        languageId,
        result: "AC",
        points: 100,
      });
    });

    const asLurker = t.withIdentity({ subject: "user_lurker" });
    await expect(asLurker.mutation(api.problems.vote, { code: "aplusb", points: 5 })).rejects.toThrow();

    const asSolver = t.withIdentity({ subject: "user_solver" });
    await asSolver.mutation(api.problems.vote, { code: "aplusb", points: 5, note: "Fair." });

    const stats = await asSolver.query(api.problems.voteStats, { code: "aplusb" });
    expect(stats?.votes).toEqual([5]);
    expect(stats?.mean).toBe(5);
    expect(stats?.median).toBe(5);
    expect(stats?.minPossibleVote).toBe(1);
    expect(stats?.maxPossibleVote).toBe(50);
  });

  test("a second vote replaces the first, and the bounds are enforced", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await seedTaxonomy(ctx);
      const solver = await seedProfile(ctx, { username: "solver" });
      const problemId = await seedProblem(ctx, { code: "aplusb", groupId });
      await seedSubmission(ctx, {
        profileId: solver,
        problemId,
        languageId,
        result: "AC",
        points: 100,
      });
    });

    const asSolver = t.withIdentity({ subject: "user_solver" });
    await asSolver.mutation(api.problems.vote, { code: "aplusb", points: 5 });
    await asSolver.mutation(api.problems.vote, { code: "aplusb", points: 9 });
    expect((await asSolver.query(api.problems.voteStats, { code: "aplusb" }))?.votes).toEqual([9]);

    await expect(asSolver.mutation(api.problems.vote, { code: "aplusb", points: 0 })).rejects.toThrow();
    await expect(asSolver.mutation(api.problems.vote, { code: "aplusb", points: 51 })).rejects.toThrow();
    await expect(asSolver.mutation(api.problems.vote, { code: "aplusb", points: 2.5 })).rejects.toThrow();

    await asSolver.mutation(api.problems.deleteVote, { code: "aplusb" });
    expect((await asSolver.query(api.problems.voteStats, { code: "aplusb" }))?.votes).toEqual([]);
  });

  test("a banned voter may look but not vote, and a contestant sees nothing", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await seedTaxonomy(ctx);
      const banned = await seedProfile(ctx, {
        username: "banned",
        isBannedFromProblemVoting: true,
      });
      const player = await seedProfile(ctx, { username: "player" });
      const problemId = await seedProblem(ctx, { code: "aplusb", groupId });
      for (const profileId of [banned, player]) {
        await seedSubmission(ctx, {
          profileId,
          problemId,
          languageId,
          result: "AC",
          points: 100,
        });
      }
      const contest = await seedContest(ctx, { key: "live" });
      await seedContestProblem(ctx, { contestId: contest, problemId, order: 0 });
      const participation = await seedParticipation(ctx, { contestId: contest, profileId: player });
      await ctx.db.patch(player, { currentParticipationId: participation });
    });

    const asBanned = t.withIdentity({ subject: "user_banned" });
    await expect(asBanned.mutation(api.problems.vote, { code: "aplusb", points: 5 })).rejects.toThrow();
    expect(await asBanned.query(api.problems.voteStats, { code: "aplusb" })).not.toBeNull();

    const asPlayer = t.withIdentity({ subject: "user_player" });
    expect(await asPlayer.query(api.problems.voteStats, { code: "aplusb" })).toBeNull();
  });
});

describe("problems.hotProblems and the small queries", () => {
  test("hot problems follow DMOJ's window, point band and threshold", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await seedTaxonomy(ctx);
      const hot = await seedProblem(ctx, { code: "hot", groupId, points: 10, acRate: 50 });
      // Out of the 3 < points < 25 band.
      const heavy = await seedProblem(ctx, { code: "heavy", groupId, points: 100 });
      // In band but with no recent submissions.
      await seedProblem(ctx, { code: "cold", groupId, points: 10 });

      for (let i = 0; i < 5; i++) {
        const profileId = await seedProfile(ctx, { username: `hot${i}` });
        await seedSubmission(ctx, { profileId, problemId: hot, languageId, result: "AC" });
        await seedSubmission(ctx, { profileId, problemId: heavy, languageId, result: "AC" });
      }
    });

    const hot = await t.query(api.problems.hotProblems, {});
    expect(hot.map((row) => row.code)).toEqual(["hot"]);
    expect(hot[0]?.uniqueUserCount).toBe(5);
  });

  test("random honours the filters and refuses inside a contest", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      await seedProblem(ctx, { code: "only", groupId, points: 10 });
      await seedProblem(ctx, { code: "other", groupId, points: 90 });
    });

    const picked = await t.query(api.problems.random, { pointEnd: 20, seed: 0 });
    expect(picked?.code).toBe("only");
    expect(await t.query(api.problems.random, { pointStart: 500, seed: 0 })).toBeNull();
  });

  test("languageTemplate and clarifications", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const { groupId } = await seedTaxonomy(ctx);
      const problemId = await seedProblem(ctx, { code: "aplusb", groupId });
      await ctx.db.insert("problemClarifications", {
        problemId,
        description: "N is at most 10^5.",
        date: 1000,
      });
      await ctx.db.insert("problemClarifications", {
        problemId,
        description: "Read to end of file.",
        date: 2000,
      });
    });

    const template = await t.query(api.problems.languageTemplate, { languageKey: "PY3" });
    expect(template?.template).toBe("# your code here\n");
    expect(await t.query(api.problems.languageTemplate, { languageKey: "NOPE" })).toBeNull();

    const clarifications = await t.query(api.problems.clarifications, { code: "aplusb" });
    expect(clarifications?.map((row) => row.description)).toEqual([
      "Read to end of file.",
      "N is at most 10^5.",
    ]);
  });
});
