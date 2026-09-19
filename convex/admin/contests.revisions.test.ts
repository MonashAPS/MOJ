// @vitest-environment edge-runtime

/**
 * What a contest edit records in `revisions`.
 *
 * `RevisionsPanel` compares any two snapshots field by field, which is the model
 * `snapshotProblem` is written for. Contest edits stored nine different shapes
 * instead — `update` stored `{ before, after }`, `setVisibility` stored
 * `{ isVisible }`, `addProblem` stored the code it added — so the history showed
 * a pair of raw JSON blobs rather than a diff, and two revisions written by
 * different mutations had no fields in common to compare.
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { asUser, insertContest, insertOrganization, insertProfile } from "../test.fixtures";
import { setupTest, type T } from "../test.setup";

async function seed(): Promise<T> {
  const t = setupTest();
  await t.run(async (ctx) => {
    await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });
    await insertProfile(ctx, { username: "judge" });
  });
  await insertContest(t, { key: "weekly", name: "Weekly" });

  return t;
}

async function revisions(t: T): Promise<Doc<"revisions">[]> {
  return await t.run(async (ctx) => await ctx.db.query("revisions").collect());
}

/** What a snapshot holds: whatever JSON the mutation that wrote it stored. */
type SnapshotValue = string | number | boolean | null | SnapshotValue[] | { [field: string]: SnapshotValue };

type Snapshot = { [field: string]: SnapshotValue };

/** The snapshot of the most recent revision, as an object of fields. */
async function latestSnapshot(t: T): Promise<Snapshot> {
  const rows = await revisions(t);
  const latest = rows.at(-1);

  expect(latest).toBeDefined();

  // SAFETY: `snapshotContest` returns an object of JSON fields, and it is what
  // wrote every revision these tests read.
  return (latest?.snapshot ?? {}) as Snapshot;
}

describe("a contest revision", () => {
  test("records the whole contest, not the patch that was sent", async () => {
    const t = await seed();

    await asUser(t, "root").mutation(api.admin.contests.update, { key: "weekly", name: "Weekly 2" });

    const snapshot = await latestSnapshot(t);

    expect(snapshot.name).toBe("Weekly 2");
    // Fields the patch never mentioned are in the snapshot too, which is what
    // makes two revisions comparable.
    expect(snapshot).toHaveProperty("freezeMinutes");
    expect(snapshot).toHaveProperty("scoreboardVisibility");
    expect(snapshot).not.toHaveProperty("before");
    expect(snapshot).not.toHaveProperty("after");
  });

  test("names the people and organisations a field holds ids for", async () => {
    const t = await seed();
    await insertOrganization(t, { slug: "maps", name: "MAPS" });

    const ids = await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "judge"))
        .unique();

      const organization = await ctx.db.query("organizations").first();

      return { profileId: profile?._id, organizationId: organization?._id };
    });

    await asUser(t, "root").mutation(api.admin.contests.update, {
      key: "weekly",
      curatorProfileIds: ids.profileId ? [ids.profileId] : [],
      organizationIds: ids.organizationId ? [ids.organizationId] : [],
    });

    const snapshot = await latestSnapshot(t);

    // A diff of two lists of document ids tells the reader nothing.
    expect(snapshot.curators).toEqual(["judge"]);
    expect(snapshot.organizations).toEqual(["maps"]);
  });

  test("is the same shape whichever mutation wrote it", async () => {
    const t = await seed();

    await asUser(t, "root").mutation(api.admin.contests.update, { key: "weekly", name: "Weekly 2" });
    const fromUpdate = Object.keys(await latestSnapshot(t)).sort();

    await asUser(t, "root").mutation(api.admin.contests.setVisibility, {
      key: "weekly",
      isVisible: true,
    });

    const fromVisibility = Object.keys(await latestSnapshot(t)).sort();

    expect(fromVisibility).toEqual(fromUpdate);
  });

  test("carries the contest's problems, so adding one shows up as a change", async () => {
    const t = await seed();

    await asUser(t, "root").mutation(api.admin.contests.update, { key: "weekly", name: "Weekly 2" });

    const snapshot = await latestSnapshot(t);

    expect(snapshot.problems).toEqual([]);
  });
});
