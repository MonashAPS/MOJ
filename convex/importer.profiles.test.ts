// @vitest-environment edge-runtime

/**
 * Importing a dump into a deployment people are signed in to.
 *
 * `ProfileBootstrap` creates a profile for a signed-in account the moment the
 * table no longer holds one, which an import clearing `profiles` makes true for
 * as long as it takes to load them again. Inserting the account's own profile
 * on top of that stub left two rows for one `userId`, and `optionalViewer` read
 * them with `unique()`, so every page that account loaded answered with a
 * server error: the site was down for whoever happened to be signed in.
 */

import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { asUser, identityOf, insertProfile, profileRow } from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

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

/** What the dump carries for the account the stub was created for. */
function importedProfile() {
  return {
    ...profileRow({ username: "swofty", userId: USER_ID }),
    performancePoints: 300,
    points: 300,
    problemCount: 3,
    joinDate: Date.UTC(2025, 3, 16),
    legacyId: 484,
    legacyUserId: 487,
  };
}

describe("importing a profile for an account that already has one", () => {
  it("patches the row rather than adding a second", async () => {
    const t = setupTest();
    await insertProfile(t, { username: "swofty", userId: USER_ID });

    await t.mutation(internal.importer.insertBatch, {
      table: "profiles",
      docs: [importedProfile()],
    });

    const rows = await profilesFor(t, USER_ID);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.points).toBe(300);
    expect(rows[0]?.legacyId).toBe(484);
  });

  it("maps the dump's legacy id onto the row that was already there", async () => {
    const t = setupTest();
    const stubId = await insertProfile(t, { username: "swofty", userId: USER_ID });

    const mapped = await t.mutation(internal.importer.insertBatch, {
      table: "profiles",
      docs: [importedProfile()],
    });

    expect(mapped).toEqual([{ legacyId: 484, id: stubId }]);
  });

  it("leaves the leaderboard counting the account once, at its imported score", async () => {
    const t = setupTest();
    await insertProfile(t, { username: "swofty", userId: USER_ID });

    await t.mutation(internal.importer.insertBatch, {
      table: "profiles",
      docs: [importedProfile()],
    });

    const listed = await t.query(api.rankings.users, {});

    expect(listed.totalUsers).toBe(1);
    // The aggregates are keyed by the score, so a patched row that never reached
    // them would still be ranked on the zero it was created with.
    expect(listed.users[0]?.performancePoints).toBe(300);
  });
});

describe("a deployment that already carries two profiles for one account", () => {
  it("answers as the account rather than failing the page", async () => {
    const t = setupTest();
    // The order an import produces: the stub joins today, the dump's row joined
    // whenever the account did.
    await insertProfile(t, { username: "swofty", userId: USER_ID, joinDate: Date.now() });
    await t.run(async (ctx) => {
      await ctx.db.insert("profiles", importedProfile());
    });

    const viewer = await asUser(t, "swofty").query(api.viewer.current, {});

    expect(viewer?.profile?.username).toBe("swofty");
    expect(viewer?.profile?.points).toBe(300);
  });
});
