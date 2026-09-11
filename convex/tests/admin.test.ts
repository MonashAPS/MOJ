// @vitest-environment edge-runtime

/**
 * The `/admin` users and organisations sections.
 *
 * The permission gates are Django's: `judge.change_profile` /
 * `judge.change_organization` to reach the section at all, superuser to hand
 * out staff flags or permissions, and `judge.edit_all_organization` to create
 * or delete an organisation.
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { setupConvexTest } from "./convexTest.setup";
import {
  makeGroup,
  makeLanguage,
  makeOrganization,
  makeProblem,
  makeProfile,
  makeSubmission,
} from "./fixtures.setup";

async function seed() {
  const t = setupConvexTest();
  await t.run(async (ctx) => {
    await makeProfile(ctx, "root", { isStaff: true, isSuperuser: true });
    await makeProfile(ctx, "clerk", {
      isStaff: true,
      permissions: ["judge.change_profile", "judge.change_organization"],
    });
    await makeProfile(ctx, "member", { points: 10, performancePoints: 9 });
  });
  return t;
}

describe("admin/users", () => {
  test("a plain member cannot open the section", async () => {
    const t = await seed();
    await expect(t.withIdentity({ subject: "user_member" }).query(api.admin.users.list, {})).rejects.toThrow(
      /Staff only|permission/,
    );
  });

  test("staff with the permission can list, search and filter", async () => {
    const t = await seed();
    const asClerk = t.withIdentity({ subject: "user_clerk" });

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
      t.withIdentity({ subject: "user_clerk" }).mutation(api.admin.users.edit, {
        username: "member",
        isStaff: true,
      }),
    ).rejects.toThrow(/Only superusers/);

    await t.withIdentity({ subject: "user_root" }).mutation(api.admin.users.edit, {
      username: "member",
      isStaff: true,
      permissions: ["judge.edit_own_problem"],
      reason: "New problem setter",
    });

    const row = await t
      .withIdentity({ subject: "user_root" })
      .query(api.admin.users.get, { username: "member" });
    expect(row).toMatchObject({ isStaff: true, permissions: ["judge.edit_own_problem"] });
  });

  test("non-escalating fields are editable by staff with the permission", async () => {
    const t = await seed();
    await t.withIdentity({ subject: "user_clerk" }).mutation(api.admin.users.edit, {
      username: "member",
      mute: true,
      isUnlisted: true,
      notes: "Spamming the comment section",
      displayRank: "setter",
    });

    const row = await t
      .withIdentity({ subject: "user_clerk" })
      .query(api.admin.users.get, { username: "member" });
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
    await t.withIdentity({ subject: "user_clerk" }).mutation(api.admin.users.edit, {
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
      const group = await makeGroup(ctx);
      const language = await makeLanguage(ctx);
      const problem = await makeProblem(ctx, "aplusb", group, { points: 100 });
      if (member) await makeSubmission(ctx, member._id, problem, language, { points: 100 });
    });

    const results = await t
      .withIdentity({ subject: "user_clerk" })
      .mutation(api.admin.users.recalculatePoints, { usernames: ["member"] });
    expect(results[0]).toMatchObject({ username: "member", points: 100 });
  });

  test("deactivating unlists the account and returns the Better Auth user id", async () => {
    const t = await seed();
    const result = await t
      .withIdentity({ subject: "user_clerk" })
      .mutation(api.admin.users.deactivate, { username: "member" });
    expect(result).toEqual({ userId: "user_member", username: "member", isActive: false });

    const row = await t
      .withIdentity({ subject: "user_clerk" })
      .query(api.admin.users.get, { username: "member" });
    expect(row).toMatchObject({ isActive: false, isUnlisted: true });

    // API v2 hides inactive users, as `user__is_active=True` does.
    expect((await t.query(api.apiV2.users, {})).objects.map((row) => row.username)).not.toContain("member");
  });

  test("you cannot deactivate yourself", async () => {
    const t = await seed();
    await expect(
      t.withIdentity({ subject: "user_clerk" }).mutation(api.admin.users.deactivate, { username: "clerk" }),
    ).rejects.toThrow(/your own account/);
  });
});

describe("admin/organizations", () => {
  test("creating needs edit_all_organization", async () => {
    const t = await seed();
    await expect(
      t.withIdentity({ subject: "user_clerk" }).mutation(api.admin.organizations.create, {
        name: "MAPS",
        slug: "maps",
        shortName: "MAPS",
        adminUsernames: ["clerk"],
      }),
    ).rejects.toThrow(/edit_all_organization/);

    await t.withIdentity({ subject: "user_root" }).mutation(api.admin.organizations.create, {
      name: "MAPS",
      slug: "maps",
      shortName: "MAPS",
      adminUsernames: ["clerk"],
      slots: 50,
    });

    const rows = await t.withIdentity({ subject: "user_root" }).query(api.admin.organizations.list, {});
    expect(rows.map((row) => [row.slug, row.slots, row.adminUsernames])).toEqual([["maps", 50, ["clerk"]]]);
  });

  test("a slug must be a slug and must be unique", async () => {
    const t = await seed();
    const asRoot = t.withIdentity({ subject: "user_root" });
    await expect(
      asRoot.mutation(api.admin.organizations.create, {
        name: "Bad",
        slug: "Not A Slug",
        shortName: "Bad",
        adminUsernames: ["root"],
      }),
    ).rejects.toThrow(/lowercase letters/);

    await asRoot.mutation(api.admin.organizations.create, {
      name: "First",
      slug: "first",
      shortName: "First",
      adminUsernames: ["root"],
    });
    await expect(
      asRoot.mutation(api.admin.organizations.create, {
        name: "Again",
        slug: "first",
        shortName: "Again",
        adminUsernames: ["root"],
      }),
    ).rejects.toThrow(/already exists/);
  });

  test("class enrolment cannot be required on an open organisation", async () => {
    const t = await seed();
    await expect(
      t.withIdentity({ subject: "user_root" }).mutation(api.admin.organizations.create, {
        name: "Open",
        slug: "open",
        shortName: "Open",
        adminUsernames: ["root"],
        isOpen: true,
        classRequired: true,
      }),
    ).rejects.toThrow(/open enrollment/);
  });

  test("an organisation admin can edit their own organisation, a stranger cannot", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      const clerk = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "clerk"))
        .unique();
      await makeOrganization(ctx, "maps", {
        name: "MAPS",
        adminProfileIds: clerk ? [clerk._id] : [],
      });
      await makeProfile(ctx, "other", {
        isStaff: true,
        permissions: ["judge.change_organization"],
      });
    });

    await t.withIdentity({ subject: "user_clerk" }).mutation(api.admin.organizations.update, {
      slug: "maps",
      shortName: "MAPS26",
      slots: 30,
      reason: "Semester rollover",
    });

    await expect(
      t.withIdentity({ subject: "user_other" }).mutation(api.admin.organizations.update, {
        slug: "maps",
        shortName: "Nope",
      }),
    ).rejects.toThrow(/not allowed to edit/);

    const row = await t
      .withIdentity({ subject: "user_clerk" })
      .query(api.admin.organizations.get, { slug: "maps" });
    expect(row).toMatchObject({ shortName: "MAPS26", slots: 30 });
  });

  test("renaming the slug keeps it unique", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      await makeOrganization(ctx, "one");
      await makeOrganization(ctx, "two");
    });
    await expect(
      t.withIdentity({ subject: "user_root" }).mutation(api.admin.organizations.update, {
        slug: "one",
        newSlug: "two",
      }),
    ).rejects.toThrow(/already exists/);

    await t.withIdentity({ subject: "user_root" }).mutation(api.admin.organizations.update, {
      slug: "one",
      newSlug: "uno",
    });
    expect(
      await t.withIdentity({ subject: "user_root" }).query(api.admin.organizations.get, {
        slug: "uno",
      }),
    ).not.toBeNull();
  });

  test("deleting takes the memberships, classes and requests with it", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      const member = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "member"))
        .unique();
      const organizationId = await makeOrganization(ctx, "doomed", { isOpen: false });
      if (member) {
        await ctx.db.insert("organizationMemberships", {
          organizationId,
          profileId: member._id,
          order: 0,
        });
        await ctx.db.insert("organizationRequests", {
          profileId: member._id,
          organizationId,
          time: 1,
          state: "P",
          reason: "",
        });
      }
      await ctx.db.insert("classes", {
        organizationId,
        name: "Class",
        slug: "class",
        isActive: true,
        adminProfileIds: [],
        memberProfileIds: [],
      });
    });

    await t
      .withIdentity({ subject: "user_root" })
      .mutation(api.admin.organizations.remove, { slug: "doomed" });

    const left = await t.run(async (ctx) => ({
      organizations: (await ctx.db.query("organizations").collect()).length,
      memberships: (await ctx.db.query("organizationMemberships").collect()).length,
      classes: (await ctx.db.query("classes").collect()).length,
      requests: (await ctx.db.query("organizationRequests").collect()).length,
    }));
    expect(left).toEqual({ organizations: 0, memberships: 0, classes: 0, requests: 0 });
  });

  test("recountMembers repairs a drifted count", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      const member = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "member"))
        .unique();
      const organizationId = await makeOrganization(ctx, "drifted");
      if (member) {
        await ctx.db.insert("organizationMemberships", {
          organizationId,
          profileId: member._id,
          order: 0,
        });
      }
      await ctx.db.patch(organizationId, { memberCount: 99 });
    });

    const fixed = await t
      .withIdentity({ subject: "user_root" })
      .mutation(api.admin.organizations.recountMembers, {});
    expect(fixed).toBe(1);
    const row = await t
      .withIdentity({ subject: "user_root" })
      .query(api.admin.organizations.get, { slug: "drifted" });
    expect(row?.memberCount).toBe(1);
  });
});
