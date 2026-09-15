// @vitest-environment edge-runtime

/**
 * The `/admin` users section.
 *
 * The permission gates are Django's: `judge.change_profile` to reach the
 * section at all, and superuser to hand out staff flags or permissions.
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import {
  asUser,
  insertLanguage,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSubmission,
} from "../test.fixtures";
import { setupTest } from "../test.setup";

async function seed() {
  const t = setupTest();
  await t.run(async (ctx) => {
    await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });
    await insertProfile(ctx, {
      username: "clerk",
      isStaff: true,
      permissions: ["judge.change_profile", "judge.change_organization"],
    });
    await insertProfile(ctx, { username: "member", points: 10, performancePoints: 9 });
  });

  return t;
}

describe("admin/users", () => {
  test("a plain member cannot open the section", async () => {
    const t = await seed();
    await expect(asUser(t, "member").query(api.admin.users.list, {})).rejects.toThrow(
      /Staff only|permission/,
    );
  });

  test("staff with the permission can list, search and filter", async () => {
    const t = await seed();
    const asClerk = asUser(t, "clerk");

    const all = await asClerk.query(api.admin.users.list, {});
    expect(all.users.map((row) => row.username).sort()).toEqual(["clerk", "member", "root"]);
    expect(all.total).toBe(3);

    const staffOnly = await asClerk.query(api.admin.users.list, { isStaff: true });
    expect(staffOnly.users.map((row) => row.username).sort()).toEqual(["clerk", "root"]);

    const searched = await asClerk.query(api.admin.users.list, { search: "member" });
    expect(searched.users.map((row) => row.username)).toEqual(["member"]);
  });

  test("only a superuser may set staff flags or permissions", async () => {
    const t = await seed();
    await expect(
      asUser(t, "clerk").mutation(api.admin.users.edit, {
        username: "member",
        isStaff: true,
      }),
    ).rejects.toThrow(/Only superusers/);

    await asUser(t, "root").mutation(api.admin.users.edit, {
      username: "member",
      isStaff: true,
      permissions: ["judge.edit_own_problem"],
      reason: "New problem setter",
    });

    const row = await asUser(t, "root").query(api.admin.users.get, { username: "member" });
    expect(row).toMatchObject({ isStaff: true, permissions: ["judge.edit_own_problem"] });
  });

  test("non-escalating fields are editable by staff with the permission", async () => {
    const t = await seed();
    await asUser(t, "clerk").mutation(api.admin.users.edit, {
      username: "member",
      mute: true,
      isUnlisted: true,
      notes: "Spamming the comment section",
      displayRank: "setter",
    });

    const row = await asUser(t, "clerk").query(api.admin.users.get, { username: "member" });
    expect(row).toMatchObject({
      mute: true,
      isUnlisted: true,
      notes: "Spamming the comment section",
      displayRank: "setter",
    });

    // The leaderboard aggregate follows the unlisted flag.
    const board = await t.query(api.rankings.users, {});
    expect(board.users.map((r) => r.username)).not.toContain("member");
    expect(board.totalUsers).toBe(2);
  });

  test("an edit writes a revision", async () => {
    const t = await seed();
    await asUser(t, "clerk").mutation(api.admin.users.edit, {
      username: "member",
      notes: "Checked",
      reason: "Support ticket 12",
    });

    const revisions = await t.run(async (ctx) => await ctx.db.query("revisions").collect());
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ entityType: "profiles", reason: "Support ticket 12" });
  });

  test("recalculating points runs DMOJ's formula", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      const member = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "member"))
        .unique();

      const groupId = await insertProblemGroup(ctx);
      const languageId = await insertLanguage(ctx);
      const problemId = await insertProblem(ctx, { code: "aplusb", groupId, points: 100 });

      if (member) {
        await insertSubmission(ctx, {
          profileId: member._id,
          problemId,
          languageId,
          result: "AC",
          points: 100,
          casePoints: 1,
          caseTotal: 1,
        });
      }
    });

    const results = await asUser(t, "clerk").mutation(api.admin.users.recalculatePoints, {
      usernames: ["member"],
    });

    expect(results[0]).toMatchObject({ username: "member", points: 100 });
  });

  test("deactivating unlists the account and returns the Better Auth user id", async () => {
    const t = await seed();

    const result = await asUser(t, "clerk").mutation(api.admin.users.deactivate, {
      username: "member",
    });

    expect(result).toEqual({ userId: "user_member", username: "member", isActive: false });

    const row = await asUser(t, "clerk").query(api.admin.users.get, { username: "member" });
    expect(row).toMatchObject({ isActive: false, isUnlisted: true });

    // API v2 hides inactive users, as `user__is_active=True` does.
    expect((await t.query(api.apiV2.users, {})).objects.map((row) => row.username)).not.toContain("member");
  });

  test("you cannot deactivate yourself", async () => {
    const t = await seed();
    await expect(
      asUser(t, "clerk").mutation(api.admin.users.deactivate, { username: "clerk" }),
    ).rejects.toThrow(/your own account/);
  });
});
