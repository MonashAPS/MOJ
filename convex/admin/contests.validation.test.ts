// @vitest-environment edge-runtime

/**
 * What `admin/contests.ts` refuses, and what it keeps.
 *
 * Each of these was a gap rather than a rule: a setting the form disabled but
 * the server accepted from anyone, a value the scoreboard code cannot act on,
 * and two fields `create` took and then never wrote.
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { asUser, insertContest, insertProfile } from "../test.fixtures";
import { setupTest, type T } from "../test.setup";

const HOUR = 60 * 60 * 1000;

async function seed(): Promise<T> {
  const t = setupTest();
  await t.run(async (ctx) => {
    await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });

    // Can edit contests, but has neither the rating nor the visibility permission.
    await insertProfile(ctx, {
      username: "setter",
      isStaff: true,
      permissions: ["judge.edit_own_contest", "judge.edit_all_contest"],
    });
  });

  await insertContest(t, {
    key: "weekly",
    name: "Weekly",
    startTime: Date.now(),
    endTime: Date.now() + 3 * HOUR,
  });

  return t;
}

async function contest(t: T): Promise<Doc<"contests"> | null> {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("contests")
        .withIndex("by_key", (q) => q.eq("key", "weekly"))
        .unique(),
  );
}

describe("the rating settings", () => {
  test("need judge.contest_rating, not just the right to edit the contest", async () => {
    const t = await seed();

    await expect(
      asUser(t, "setter").mutation(api.admin.contests.update, {
        key: "weekly",
        rating: { everyone: false, excludeProfileIds: [] },
      }),
    ).rejects.toThrow(/judge.contest_rating/);
  });

  test("still save for someone who has it", async () => {
    const t = await seed();
    await asUser(t, "root").mutation(api.admin.contests.update, {
      key: "weekly",
      rating: { everyone: false, excludeProfileIds: [] },
    });

    expect((await contest(t))?.rating).toEqual({ everyone: false, excludeProfileIds: [] });
  });

  test("do not block an edit that leaves them alone", async () => {
    const t = await seed();
    await asUser(t, "setter").mutation(api.admin.contests.update, { key: "weekly", name: "Weekly 2" });

    expect((await contest(t))?.name).toBe("Weekly 2");
  });
});

describe("a freeze at least as long as the contest", () => {
  test("is refused, because it would freeze the board from the start", async () => {
    const t = await seed();

    await expect(
      asUser(t, "root").mutation(api.admin.contests.update, {
        key: "weekly",
        freeze: { minutes: 180, blind: false },
      }),
    ).rejects.toThrow(/shorter than the contest/);
  });

  test("is fine one minute under", async () => {
    const t = await seed();
    await asUser(t, "root").mutation(api.admin.contests.update, {
      key: "weekly",
      freeze: { minutes: 179, blind: false },
    });

    expect((await contest(t))?.freeze).toEqual({ minutes: 179, blind: false });
  });
});

describe("a per-participant window of zero", () => {
  test("is refused rather than stored", async () => {
    const t = await seed();

    await expect(
      asUser(t, "root").mutation(api.admin.contests.update, {
        key: "weekly",
        schedule: { kind: "window", seconds: 0 },
      }),
    ).rejects.toThrow(/longer than zero/);
  });

  test("is not a thing a shared clock can say", async () => {
    const t = await seed();
    await asUser(t, "root").mutation(api.admin.contests.update, {
      key: "weekly",
      schedule: { kind: "together" },
    });

    expect((await contest(t))?.schedule).toEqual({ kind: "together" });
  });
});

describe("creating a contest", () => {
  test("keeps the lockdown and proctoring settings it was given", async () => {
    const t = await seed();

    await asUser(t, "root").mutation(api.admin.contests.create, {
      key: "mcpc",
      name: "MCPC",
      startTime: Date.now(),
      endTime: Date.now() + HOUR,
      disableLockdown: true,
      proctorRequired: true,
    });

    const created = await t.run(
      async (ctx) =>
        await ctx.db
          .query("contests")
          .withIndex("by_key", (q) => q.eq("key", "mcpc"))
          .unique(),
    );

    expect(created?.disableLockdown).toBe(true);
    expect(created?.proctorRequired).toBe(true);
    expect(created?.problemListReleaseAt).toBe("start");
  });

  test("stores an explicit Never policy as null", async () => {
    const t = await seed();

    await asUser(t, "root").mutation(api.admin.contests.create, {
      key: "never",
      name: "Never",
      startTime: Date.now(),
      endTime: Date.now() + HOUR,
      problemListReleaseAt: null,
    });

    const created = await t.run(
      async (ctx) =>
        await ctx.db
          .query("contests")
          .withIndex("by_key", (q) => q.eq("key", "never"))
          .unique(),
    );

    expect(created?.problemListReleaseAt).toBeNull();
  });
});
