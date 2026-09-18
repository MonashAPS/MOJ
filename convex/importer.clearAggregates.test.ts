// @vitest-environment edge-runtime

/**
 * Clearing a table before a re-import.
 *
 * A profile is a row and three leaderboard aggregates, and the aggregates are
 * their own component: deleting the row leaves them counting it. Re-importing
 * over a loaded deployment therefore doubled the leaderboard's total and gave
 * it pages of nothing, which is what a staging re-sync from production hit.
 */

import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { insertProfile } from "./test.fixtures";
import { setupTest } from "./test.setup";

async function listedTotal(t: ReturnType<typeof setupTest>): Promise<number> {
  return (await t.query(api.rankings.users, {})).totalUsers;
}

describe("clearing the profiles table", () => {
  it("takes the leaderboard aggregates with it", async () => {
    const t = setupTest();
    await insertProfile(t, { username: "one", performancePoints: 10 });
    await insertProfile(t, { username: "two", performancePoints: 20 });

    expect(await listedTotal(t)).toBe(2);

    await t.mutation(internal.importer.clearTable, { table: "profiles" });

    expect(await listedTotal(t)).toBe(0);
  });

  it("leaves the count right when the same profiles are loaded again", async () => {
    const t = setupTest();
    await insertProfile(t, { username: "one" });
    await t.mutation(internal.importer.clearTable, { table: "profiles" });
    await insertProfile(t, { username: "one" });

    // The bug: two, because the cleared row was still in the tree.
    expect(await listedTotal(t)).toBe(1);
  });

  it("says it is done only once a pass comes back short", async () => {
    const t = setupTest();
    await insertProfile(t, { username: "one" });

    // A full batch says nothing about what is left, so the importer loops.
    const first = await t.mutation(internal.importer.clearTable, { table: "profiles", limit: 1 });

    expect(first).toEqual({ deleted: 1, isDone: false });

    const second = await t.mutation(internal.importer.clearTable, { table: "profiles", limit: 1 });

    expect(second).toEqual({ deleted: 0, isDone: true });
  });
});
