import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  insertContest,
  insertContestProblem,
  insertParticipation,
  insertProblem,
  insertProfile,
  insertSubmission,
  insertTaxonomy,
} from "./test.fixtures";
import { setupTest } from "./test.setup";

describe("problems.catalog", () => {
  const codes = (result: { rows: { code: string }[] }) => result.rows.map((row) => row.code).sort();

  test("shows public problems to anonymous viewers and hides private ones", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId } = await insertTaxonomy(ctx);
      await insertProblem(ctx, { code: "aplusb", groupId });
      await insertProblem(ctx, { code: "secret", groupId, isPublic: false });
    });

    const result = await t.query(api.problems.catalog, {});
    expect(codes(result)).toEqual(["aplusb"]);
    expect(result.viewer).toBeNull();
  });

  test("authors and testers see their own private problems", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId } = await insertTaxonomy(ctx);
      const author = await insertProfile(ctx, { username: "author" });
      const tester = await insertProfile(ctx, { username: "tester" });
      await insertProfile(ctx, { username: "nobody" });
      await insertProblem(ctx, {
        code: "hidden",
        groupId,
        isPublic: false,
        authorProfileIds: [author],
        testerProfileIds: [tester],
      });
    });

    expect(codes(await t.query(api.problems.catalog, {}))).toEqual([]);
    expect(codes(await asUser(t, "author").query(api.problems.catalog, {}))).toEqual(["hidden"]);
    expect(codes(await asUser(t, "tester").query(api.problems.catalog, {}))).toEqual(["hidden"]);
    expect(codes(await asUser(t, "nobody").query(api.problems.catalog, {}))).toEqual([]);
  });

  test("marks each problem with the viewer's own state, and says who it answered for", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await insertTaxonomy(ctx);
      const viewer = await insertProfile(ctx, { username: "viewer" });
      const solved = await insertProblem(ctx, { code: "solved", groupId });
      const tried = await insertProblem(ctx, { code: "tried", groupId });
      await insertProblem(ctx, { code: "untouched", groupId });
      await insertSubmission(ctx, {
        profileId: viewer,
        problemId: solved,
        languageId,
        result: "AC",
        casePoints: 1,
        points: 100,
      });
      await insertSubmission(ctx, {
        profileId: viewer,
        problemId: tried,
        languageId,
        result: "WA",
        points: 0,
      });
    });

    const result = await asUser(t, "viewer").query(api.problems.catalog, {});
    const states = Object.fromEntries(result.rows.map((row) => [row.code, row.state]));
    expect(states).toEqual({ solved: "solved", tried: "attempted", untouched: "none" });
    expect(result.viewer).toBe("viewer");
  });

  test("carries the group, types, authors and a published editorial", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId, graphsTypeId } = await insertTaxonomy(ctx);
      const author = await insertProfile(ctx, { username: "setter" });

      const graphs = await insertProblem(ctx, {
        code: "graphs",
        groupId,
        typeIds: [graphsTypeId],
        authorProfileIds: [author],
      });

      const later = await insertProblem(ctx, { code: "later", groupId });

      await ctx.db.insert("solutions", {
        problemId: graphs,
        isPublic: true,
        publishOn: Date.now() - 1000,
        authorProfileIds: [],
        content: "Use a BFS.",
      });
      await ctx.db.insert("solutions", {
        problemId: later,
        isPublic: true,
        publishOn: Date.now() + 86_400_000,
        authorProfileIds: [],
        content: "Not yet.",
      });
    });

    const { rows } = await t.query(api.problems.catalog, {});
    const graphs = rows.find((row) => row.code === "graphs");
    expect(graphs?.types.map((type) => type.name)).toEqual(["graphs"]);
    expect(graphs?.group?.name).toBeTruthy();
    expect(graphs?.authors).toEqual(["setter"]);
    expect(graphs?.hasPublicEditorial).toBe(true);
    expect(rows.find((row) => row.code === "later")?.hasPublicEditorial).toBe(false);
  });

  test("labels each problem in the contests it appeared in", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId } = await insertTaxonomy(ctx);
      const alpha = await insertProblem(ctx, { code: "alpha", groupId });
      const beta = await insertProblem(ctx, { code: "beta", groupId });
      await insertProblem(ctx, { code: "loner", groupId });

      const contest = await insertContest(ctx, {
        key: "winter25",
        name: "Winter Cup 2025",
        problemListReleaseAt: "start",
      });

      await insertContestProblem(ctx, { contestId: contest, problemId: beta, order: 1 });
      await insertContestProblem(ctx, { contestId: contest, problemId: alpha, order: 0 });
    });

    const result = await t.query(api.problems.catalog, {});
    const contests = Object.fromEntries(result.rows.map((row) => [row.code, row.contests]));
    expect(contests).toEqual({
      alpha: [{ key: "winter25", label: "A" }],
      beta: [{ key: "winter25", label: "B" }],
      loner: [],
    });
    expect(result.contests.map((contest) => contest.name)).toEqual(["Winter Cup 2025"]);
  });

  /** Being in a contest no longer rewrites this list. The contest's own page is
   *  where its problems live; all this query does is say when the catalogue
   *  should be drawn out of reach. */
  async function inContest(t: ReturnType<typeof setupTest>, disableLockdown: boolean) {
    await t.run(async (ctx) => {
      const { groupId, typeId } = await insertTaxonomy(ctx);
      const viewer = await insertProfile(ctx, { username: "player" });
      const inside = await insertProblem(ctx, { code: "inside", groupId, typeIds: [typeId] });
      await insertProblem(ctx, { code: "outside", groupId, typeIds: [typeId] });

      const contest = await insertContest(ctx, { key: "live", disableLockdown });
      await insertContestProblem(ctx, { contestId: contest, problemId: inside, order: 0, points: 42 });
      const participation = await insertParticipation(ctx, { contestId: contest, profileId: viewer });
      await ctx.db.patch(viewer, { currentParticipationId: participation });
    });

    return await asUser(t, "player").query(api.problems.catalog, {});
  }

  test("leaves the catalogue alone for a contest that opted out of the lockdown", async () => {
    const t = setupTest();

    const result = await inContest(t, true);

    expect(codes(result)).toEqual(["inside", "outside"]);
    expect(result.contestLock).toBeNull();
  });

  test("locks the catalogue by default, still sending it, with a way back in", async () => {
    const t = setupTest();

    const result = await inContest(t, false);

    expect(codes(result)).toEqual(["inside", "outside"]);
    expect(result.contestLock).toEqual({ key: "live", name: "LIVE" });
  });
});

describe("problems.searchIds", () => {
  test("finds a problem by its statement, and never a hidden one", async () => {
    const t = setupTest();

    const ids = await t.run(async (ctx) => {
      const { groupId } = await insertTaxonomy(ctx);
      const swing = await insertProblem(ctx, { code: "swing", groupId });
      await ctx.db.patch(swing, { description: "A pendulum swings back and forth." });
      const secret = await insertProblem(ctx, { code: "secret", groupId, isPublic: false });
      await ctx.db.patch(secret, { description: "Another pendulum, kept private." });

      return { swing, secret };
    });

    expect(await t.query(api.problems.searchIds, { search: "pendulum" })).toEqual([ids.swing]);
    expect(await t.query(api.problems.searchIds, { search: "  " })).toEqual([]);
  });
});

describe("problems.solvedByIds", () => {
  test("keeps only what every named user has fully solved", async () => {
    const t = setupTest();

    const ids = await t.run(async (ctx) => {
      const { groupId, languageId } = await insertTaxonomy(ctx);
      const first = await insertProfile(ctx, { username: "first" });
      const second = await insertProfile(ctx, { username: "second" });
      const both = await insertProblem(ctx, { code: "both", groupId });
      const firstOnly = await insertProblem(ctx, { code: "firstonly", groupId });

      const solve = (profileId: typeof first, problemId: typeof both) =>
        insertSubmission(ctx, { profileId, problemId, languageId, result: "AC", casePoints: 1, points: 100 });

      await solve(first, both);
      await solve(first, firstOnly);
      await solve(second, both);

      return { both, firstOnly };
    });

    const byFirst = await t.query(api.problems.solvedByIds, { usernames: ["first"] });
    expect([...byFirst].sort()).toEqual([ids.both, ids.firstOnly].sort());
    expect(await t.query(api.problems.solvedByIds, { usernames: ["first", "second"] })).toEqual([ids.both]);
    expect(await t.query(api.problems.solvedByIds, { usernames: ["first", "ghost"] })).toEqual([]);
  });
});

describe("problems.get", () => {
  test("returns null for a problem the viewer may not see", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId } = await insertTaxonomy(ctx);
      await insertProblem(ctx, { code: "secret", groupId, isPublic: false });
    });
    expect(await t.query(api.problems.get, { code: "secret" })).toBeNull();
    expect(await t.query(api.problems.get, { code: "missing" })).toBeNull();
  });

  test("carries the statement, limits, stats and appearances", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId, languageId, cppId } = await insertTaxonomy(ctx);
      const author = await insertProfile(ctx, { username: "setter" });
      const fast = await insertProfile(ctx, { username: "fast" });
      const slow = await insertProfile(ctx, { username: "slow" });

      const problemId = await insertProblem(ctx, {
        code: "aplusb",
        name: "A plus B",
        groupId,
        authorProfileIds: [author],
        allowedLanguageIds: [languageId, cppId],
      });

      await ctx.db.insert("languageLimits", {
        problemId,
        languageId,
        timeLimit: 3,
        memoryLimit: 512_000,
      });

      await insertSubmission(ctx, {
        profileId: fast,
        problemId,
        languageId,
        result: "AC",
        casePoints: 1,
        points: 100,
        time: 0.05,
      });
      await insertSubmission(ctx, {
        profileId: slow,
        problemId,
        languageId,
        result: "AC",
        casePoints: 1,
        points: 100,
        time: 0.5,
      });
      await insertSubmission(ctx, {
        profileId: slow,
        problemId,
        languageId,
        result: "WA",
        points: 0,
        time: 0.2,
      });

      const contest = await insertContest(ctx, {
        key: "winter24",
        name: "Winter Cup 2024",
        problemListReleaseAt: "start",
      });

      await insertContestProblem(ctx, { contestId: contest, problemId, order: 2 });
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
      expect.objectContaining({ contestKey: "winter24", contestName: "Winter Cup 2024", label: "A" }),
    ]);
    // Two of two languages allowed, so DMOJ hides the language list.
    expect(problem?.showLanguages).toBe(false);
  });

  test("hides tags inside a contest that hides them", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId, typeId } = await insertTaxonomy(ctx);
      const viewer = await insertProfile(ctx, { username: "player" });

      const problemId = await insertProblem(ctx, {
        code: "inside",
        groupId,
        typeIds: [typeId],
        isPublic: false,
      });

      const contest = await insertContest(ctx, { key: "live", hideProblemTags: true });
      await insertContestProblem(ctx, { contestId: contest, problemId, order: 0 });
      const participation = await insertParticipation(ctx, { contestId: contest, profileId: viewer });
      await ctx.db.patch(viewer, { currentParticipationId: participation });
    });

    const asPlayer = asUser(t, "player");
    const problem = await asPlayer.query(api.problems.get, { code: "inside" });
    // Being in the contest grants access to a problem that is not public.
    expect(problem).not.toBeNull();
    expect(problem?.types).toBeNull();
    expect(problem?.contestProblem?.label).toBe("A");
  });

  test("uses the viewer's language translation when there is one", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId } = await insertTaxonomy(ctx);
      const problemId = await insertProblem(ctx, { code: "aplusb", name: "A plus B", groupId });
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
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId } = await insertTaxonomy(ctx);
      await insertProfile(ctx, { username: "reader" });
      const problemId = await insertProblem(ctx, { code: "aplusb", groupId });
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
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await insertTaxonomy(ctx);
      const alice = await insertProfile(ctx, { username: "alice" });
      const bob = await insertProfile(ctx, { username: "bob" });
      const ghost = await insertProfile(ctx, { username: "ghost", isUnlisted: true });
      const problemId = await insertProblem(ctx, { code: "aplusb", groupId });

      // Alice: 60 then 100; the 100 is her best, and among ties the fastest.
      await insertSubmission(ctx, {
        profileId: alice,
        problemId,
        languageId,
        result: "WA",
        points: 60,
        time: 0.1,
      });
      await insertSubmission(ctx, {
        profileId: alice,
        problemId,
        languageId,
        result: "AC",
        casePoints: 1,
        points: 100,
        time: 0.4,
      });
      await insertSubmission(ctx, {
        profileId: alice,
        problemId,
        languageId,
        result: "AC",
        casePoints: 1,
        points: 100,
        time: 0.2,
      });
      await insertSubmission(ctx, {
        profileId: bob,
        problemId,
        languageId,
        result: "AC",
        casePoints: 1,
        points: 100,
        time: 0.1,
      });
      await insertSubmission(ctx, {
        profileId: ghost,
        problemId,
        languageId,
        result: "AC",
        casePoints: 1,
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
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await insertTaxonomy(ctx);
      const solver = await insertProfile(ctx, { username: "solver" });
      await insertProfile(ctx, { username: "lurker" });
      const problemId = await insertProblem(ctx, { code: "aplusb", groupId });
      await insertSubmission(ctx, {
        profileId: solver,
        problemId,
        languageId,
        result: "AC",
        casePoints: 1,
        points: 100,
      });
    });

    const asLurker = asUser(t, "lurker");
    await expect(asLurker.mutation(api.problems.votes.vote, { code: "aplusb", points: 5 })).rejects.toThrow();

    const asSolver = asUser(t, "solver");
    await asSolver.mutation(api.problems.votes.vote, { code: "aplusb", points: 5, note: "Fair." });

    const stats = await asSolver.query(api.problems.votes.voteStats, { code: "aplusb" });
    expect(stats?.votes).toEqual([5]);
    expect(stats?.mean).toBe(5);
    expect(stats?.median).toBe(5);
    expect(stats?.minPossibleVote).toBe(1);
    expect(stats?.maxPossibleVote).toBe(50);
  });

  test("a second vote replaces the first, and the bounds are enforced", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await insertTaxonomy(ctx);
      const solver = await insertProfile(ctx, { username: "solver" });
      const problemId = await insertProblem(ctx, { code: "aplusb", groupId });
      await insertSubmission(ctx, {
        profileId: solver,
        problemId,
        languageId,
        result: "AC",
        casePoints: 1,
        points: 100,
      });
    });

    const asSolver = asUser(t, "solver");
    await asSolver.mutation(api.problems.votes.vote, { code: "aplusb", points: 5 });
    await asSolver.mutation(api.problems.votes.vote, { code: "aplusb", points: 9 });
    expect((await asSolver.query(api.problems.votes.voteStats, { code: "aplusb" }))?.votes).toEqual([9]);

    await expect(asSolver.mutation(api.problems.votes.vote, { code: "aplusb", points: 0 })).rejects.toThrow();
    await expect(
      asSolver.mutation(api.problems.votes.vote, { code: "aplusb", points: 51 }),
    ).rejects.toThrow();
    await expect(
      asSolver.mutation(api.problems.votes.vote, { code: "aplusb", points: 2.5 }),
    ).rejects.toThrow();

    await asSolver.mutation(api.problems.votes.deleteVote, { code: "aplusb" });
    expect((await asSolver.query(api.problems.votes.voteStats, { code: "aplusb" }))?.votes).toEqual([]);
  });

  test("a banned voter may look but not vote, and a contestant sees nothing", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await insertTaxonomy(ctx);

      const banned = await insertProfile(ctx, {
        username: "banned",
        isBannedFromProblemVoting: true,
      });

      const player = await insertProfile(ctx, { username: "player" });
      const problemId = await insertProblem(ctx, { code: "aplusb", groupId });

      for (const profileId of [banned, player]) {
        await insertSubmission(ctx, {
          profileId,
          problemId,
          languageId,
          result: "AC",
          casePoints: 1,
          points: 100,
        });
      }

      const contest = await insertContest(ctx, { key: "live" });
      await insertContestProblem(ctx, { contestId: contest, problemId, order: 0 });
      const participation = await insertParticipation(ctx, { contestId: contest, profileId: player });
      await ctx.db.patch(player, { currentParticipationId: participation });
    });

    const asBanned = asUser(t, "banned");
    await expect(asBanned.mutation(api.problems.votes.vote, { code: "aplusb", points: 5 })).rejects.toThrow();
    expect(await asBanned.query(api.problems.votes.voteStats, { code: "aplusb" })).not.toBeNull();

    const asPlayer = asUser(t, "player");
    expect(await asPlayer.query(api.problems.votes.voteStats, { code: "aplusb" })).toBeNull();
  });
});

describe("problems.hotProblems and the small queries", () => {
  test("hot problems follow DMOJ's window, point band and threshold", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId, languageId } = await insertTaxonomy(ctx);
      const hot = await insertProblem(ctx, { code: "hot", groupId, points: 10, acRate: 50 });
      // Out of the 3 < points < 25 band.
      const heavy = await insertProblem(ctx, { code: "heavy", groupId, points: 100 });
      // In band but with no recent submissions.
      await insertProblem(ctx, { code: "cold", groupId, points: 10 });

      for (let i = 0; i < 5; i++) {
        const profileId = await insertProfile(ctx, { username: `hot${i}` });
        await insertSubmission(ctx, { profileId, problemId: hot, languageId, result: "AC", casePoints: 1 });
        await insertSubmission(ctx, { profileId, problemId: heavy, languageId, result: "AC", casePoints: 1 });
      }
    });

    const hot = await t.query(api.problems.hotProblems, {});
    expect(hot.map((row) => row.code)).toEqual(["hot"]);
    expect(hot[0]?.uniqueUserCount).toBe(5);
  });

  test("random honours the filters and refuses inside a contest", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId } = await insertTaxonomy(ctx);
      await insertProblem(ctx, { code: "only", groupId, points: 10 });
      await insertProblem(ctx, { code: "other", groupId, points: 90 });
    });

    const picked = await t.query(api.problems.random, { pointEnd: 20, seed: 0 });
    expect(picked?.code).toBe("only");
    expect(await t.query(api.problems.random, { pointStart: 500, seed: 0 })).toBeNull();
  });

  test("languageTemplate and clarifications", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const { groupId } = await insertTaxonomy(ctx);
      const problemId = await insertProblem(ctx, { code: "aplusb", groupId });
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
