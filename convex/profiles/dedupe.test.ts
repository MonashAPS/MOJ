// @vitest-environment edge-runtime

import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { identityOf, insertProfile, type Overrides } from "../test.fixtures";
import { setupTest, type T } from "../test.setup";

const USER_ID = identityOf("swofty").subject;

async function profilesFor(t: T, userId: string): Promise<Doc<"profiles">[]> {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect(),
  );
}

/** A second row for one account, as an import racing `ProfileBootstrap` left it. */
async function insertSecond(t: T, overrides: Overrides<"profiles"> = {}): Promise<Id<"profiles">> {
  return await insertProfile(t, {
    username: "swofty",
    userId: USER_ID,
    joinDate: Date.UTC(2025, 3, 16),
    ...overrides,
  });
}

describe("dropStubDuplicates", () => {
  it("deletes the empty row and keeps the account", async () => {
    const t = setupTest();
    await insertProfile(t, { username: "swofty", userId: USER_ID, joinDate: Date.now() });
    const real = await insertSecond(t, { points: 300, legacyId: 484 });

    const report = await t.mutation(internal.profiles.dedupe.dropStubDuplicates, {});

    expect(report).toEqual({ accounts: 1, deleted: 1, needsReview: [] });
    expect((await profilesFor(t, USER_ID)).map((row) => row._id)).toEqual([real]);
  });

  it("takes the deleted row out of the leaderboard count with it", async () => {
    const t = setupTest();
    await insertProfile(t, { username: "swofty", userId: USER_ID, joinDate: Date.now() });
    await insertSecond(t, { points: 300, legacyId: 484 });
    await t.mutation(internal.profiles.dedupe.dropStubDuplicates, {});

    // The stub reached the aggregates through `insertProfile`, so leaving it in
    // them would keep the leaderboard one ahead of the table.
    expect((await t.query(api.rankings.users, {})).totalUsers).toBe(1);
  });

  it("reports a duplicate with history rather than choosing between them", async () => {
    const t = setupTest();
    await insertProfile(t, { username: "swofty", userId: USER_ID, joinDate: Date.UTC(2025, 3, 16) });
    const scored = await insertSecond(t, { joinDate: Date.now(), points: 300, problemCount: 3 });

    const report = await t.mutation(internal.profiles.dedupe.dropStubDuplicates, {});

    expect(report.deleted).toBe(0);
    expect(report.needsReview).toEqual([{ userId: USER_ID, profileIds: [scored] }]);
  });

  it("leaves a deployment with one profile per account alone", async () => {
    const t = setupTest();
    await insertProfile(t, { username: "one" });
    await insertProfile(t, { username: "two" });

    expect(await t.mutation(internal.profiles.dedupe.dropStubDuplicates, {})).toEqual({
      accounts: 0,
      deleted: 0,
      needsReview: [],
    });
  });
});
