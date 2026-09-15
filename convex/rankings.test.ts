// @vitest-environment edge-runtime

/**
 * `/users/` and `/users/find`.
 *
 * DMOJ ranks the leaderboard with `judge/utils/ranker.py` keyed on
 * `(performance_points, problem_count)` and seeded with the page offset, so
 * equal pairs share a rank and the next distinct pair skips the tie. `find`
 * counts the users strictly ahead by performance points with the id breaking
 * ties, which is what `user_ranking_redirect` does.
 */

import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { insertProfile } from "./test.fixtures";
import { setupTest } from "./test.setup";

describe("rankings.users", () => {
  test("ties share a rank and the next distinct pair skips it", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "alice", performancePoints: 300, problemCount: 10, points: 900 });
      await insertProfile(ctx, { username: "bob", performancePoints: 200, problemCount: 5, points: 500 });
      await insertProfile(ctx, { username: "carol", performancePoints: 200, problemCount: 5, points: 400 });
      await insertProfile(ctx, { username: "dave", performancePoints: 100, problemCount: 2, points: 100 });
    });

    const page = await t.query(api.rankings.users, {});
    expect(page.users.map((row) => [row.username, row.rank])).toEqual([
      ["alice", 1],
      ["bob", 2],
      ["carol", 2],
      ["dave", 4],
    ]);
    expect(page.totalUsers).toBe(4);
    expect(page.totalPages).toBe(1);
    expect(page.hasMore).toBe(false);
  });

  test("equal points but different problem counts do not tie", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "one", performancePoints: 200, problemCount: 7 });
      await insertProfile(ctx, { username: "two", performancePoints: 200, problemCount: 3 });
    });

    const page = await t.query(api.rankings.users, {});
    expect(page.users.map((row) => row.rank)).toEqual([1, 2]);
  });

  test("unlisted users never appear", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "listed", performancePoints: 10 });
      await insertProfile(ctx, { username: "hidden", performancePoints: 5000, isUnlisted: true });
    });

    const page = await t.query(api.rankings.users, {});
    expect(page.users.map((row) => row.username)).toEqual(["listed"]);
    expect(page.totalUsers).toBe(1);
  });

  test("the page offset seeds the rank", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      for (let i = 0; i < 105; i++) {
        await insertProfile(ctx, {
          username: `u${String(i).padStart(3, "0")}`,
          performancePoints: 1000 - i,
          problemCount: 1,
        });
      }
    });

    const second = await t.query(api.rankings.users, { page: 2 });
    expect(second.users).toHaveLength(5);
    expect(second.users[0]?.rank).toBe(101);
    expect(second.users[4]?.rank).toBe(105);
    expect(second.totalPages).toBe(2);
    expect(second.hasMore).toBe(false);
  });

  test("sorting by problem count keeps DMOJ's rank key", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "wide", performancePoints: 50, problemCount: 40 });
      await insertProfile(ctx, { username: "deep", performancePoints: 900, problemCount: 3 });
    });

    const page = await t.query(api.rankings.users, { sort: "problemCount" });
    expect(page.users.map((row) => row.username)).toEqual(["wide", "deep"]);
    // Ranks still come from (performance points, problem count) in page order.
    expect(page.users.map((row) => row.rank)).toEqual([1, 2]);
  });

  test("an organisation filter lists only that organisation's members", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const inside = await insertProfile(ctx, { username: "member", performancePoints: 10 });
      await insertProfile(ctx, { username: "outsider", performancePoints: 900 });

      const organizationId = await ctx.db.insert("organizations", {
        name: "MAPS",
        slug: "maps",
        shortName: "MAPS",
        about: "",
        adminProfileIds: [],
        isOpen: true,
        classRequired: false,
        memberCount: 1,
      });

      await ctx.db.insert("organizationMemberships", {
        organizationId,
        profileId: inside,
        order: 0,
      });
    });

    const page = await t.query(api.rankings.users, { organizationSlug: "maps" });
    expect(page.users.map((row) => row.username)).toEqual(["member"]);
    expect(page.totalUsers).toBe(1);
  });
});

describe("rankings.find", () => {
  test("returns the rank and the page the user is on", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      for (let i = 0; i < 150; i++) {
        await insertProfile(ctx, { username: `p${String(i).padStart(3, "0")}`, performancePoints: 1000 - i });
      }
    });

    const first = await t.query(api.rankings.find, { username: "p000" });
    expect(first).toMatchObject({ offset: 0, rank: 1, page: 1, isUnlisted: false });

    const hundredth = await t.query(api.rankings.find, { username: "p099" });
    expect(hundredth).toMatchObject({ offset: 99, rank: 100, page: 1 });

    const hundredFirst = await t.query(api.rankings.find, { username: "p100" });
    expect(hundredFirst).toMatchObject({ offset: 100, rank: 101, page: 2 });
  });

  test("an unknown user is null and an unlisted user is flagged", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "ghost", performancePoints: 10, isUnlisted: true });
    });

    expect(await t.query(api.rankings.find, { username: "nobody" })).toBeNull();
    expect(await t.query(api.rankings.find, { username: "ghost" })).toMatchObject({
      isUnlisted: true,
    });
  });

  test("ties are broken the same way the leaderboard breaks them", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "ahead", performancePoints: 300 });
      await insertProfile(ctx, { username: "tie-a", performancePoints: 200 });
      await insertProfile(ctx, { username: "tie-b", performancePoints: 200 });
      await insertProfile(ctx, { username: "behind", performancePoints: 100 });
    });

    const board = await t.query(api.rankings.users, {});
    const order = board.users.map((row) => row.username);

    for (let index = 0; index < order.length; index++) {
      const found = await t.query(api.rankings.find, { username: order[index] as string });
      expect(found?.offset).toBe(index);
    }
  });

  test("the page it reports is the page that shows the user", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      for (let i = 0; i < 120; i++) {
        await insertProfile(ctx, { username: `q${String(i).padStart(3, "0")}`, performancePoints: 500 - i });
      }
    });

    const found = await t.query(api.rankings.find, { username: "q110" });
    expect(found).not.toBeNull();
    const page = await t.query(api.rankings.users, { page: found?.page ?? 1 });
    expect(page.users.some((row) => row.username === "q110")).toBe(true);
  });
});

describe("rankings.top", () => {
  test("returns the highest performance points first", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "low", performancePoints: 1 });
      await insertProfile(ctx, { username: "high", performancePoints: 99 });
      await insertProfile(ctx, { username: "hidden", performancePoints: 500, isUnlisted: true });
    });

    const rows = await t.query(api.rankings.top, { limit: 5 });
    expect(rows.map((row) => row.username)).toEqual(["high", "low"]);
  });
});
