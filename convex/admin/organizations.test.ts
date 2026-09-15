// @vitest-environment edge-runtime

/**
 * The `/admin` organisations section.
 *
 * The permission gates are Django's: `judge.change_organization` to reach the
 * section at all, and `judge.edit_all_organization` to create or delete an
 * organisation.
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { asUser, insertOrganization, insertProfile } from "../test.fixtures";
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

describe("admin/organizations", () => {
  test("creating needs edit_all_organization", async () => {
    const t = await seed();
    await expect(
      asUser(t, "clerk").mutation(api.admin.organizations.create, {
        name: "MAPS",
        slug: "maps",
        shortName: "MAPS",
        adminUsernames: ["clerk"],
      }),
    ).rejects.toThrow(/edit_all_organization/);

    await asUser(t, "root").mutation(api.admin.organizations.create, {
      name: "MAPS",
      slug: "maps",
      shortName: "MAPS",
      adminUsernames: ["clerk"],
      slots: 50,
    });

    const rows = await asUser(t, "root").query(api.admin.organizations.list, {});
    expect(rows.map((row) => [row.slug, row.slots, row.adminUsernames])).toEqual([["maps", 50, ["clerk"]]]);
  });

  test("a slug must be a slug and must be unique", async () => {
    const t = await seed();
    const asRoot = asUser(t, "root");
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
      asUser(t, "root").mutation(api.admin.organizations.create, {
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

      await insertOrganization(ctx, {
        slug: "maps",
        name: "MAPS",
        adminProfileIds: clerk ? [clerk._id] : [],
      });
      await insertProfile(ctx, {
        username: "other",
        isStaff: true,
        permissions: ["judge.change_organization"],
      });
    });

    await asUser(t, "clerk").mutation(api.admin.organizations.update, {
      slug: "maps",
      shortName: "MAPS26",
      slots: 30,
      reason: "Semester rollover",
    });

    await expect(
      asUser(t, "other").mutation(api.admin.organizations.update, {
        slug: "maps",
        shortName: "Nope",
      }),
    ).rejects.toThrow(/not allowed to edit/);

    const row = await asUser(t, "clerk").query(api.admin.organizations.get, { slug: "maps" });
    expect(row).toMatchObject({ shortName: "MAPS26", slots: 30 });
  });

  test("renaming the slug keeps it unique", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      await insertOrganization(ctx, { slug: "one" });
      await insertOrganization(ctx, { slug: "two" });
    });
    await expect(
      asUser(t, "root").mutation(api.admin.organizations.update, {
        slug: "one",
        newSlug: "two",
      }),
    ).rejects.toThrow(/already exists/);

    await asUser(t, "root").mutation(api.admin.organizations.update, {
      slug: "one",
      newSlug: "uno",
    });
    expect(
      await asUser(t, "root").query(api.admin.organizations.get, {
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

      const organizationId = await insertOrganization(ctx, { slug: "doomed", isOpen: false });

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

    await asUser(t, "root").mutation(api.admin.organizations.remove, { slug: "doomed" });

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

      const organizationId = await insertOrganization(ctx, { slug: "drifted" });

      if (member) {
        await ctx.db.insert("organizationMemberships", {
          organizationId,
          profileId: member._id,
          order: 0,
        });
      }

      await ctx.db.patch(organizationId, { memberCount: 99 });
    });

    const fixed = await asUser(t, "root").mutation(api.admin.organizations.recountMembers, {});
    expect(fixed).toBe(1);
    const row = await asUser(t, "root").query(api.admin.organizations.get, { slug: "drifted" });
    expect(row?.memberCount).toBe(1);
  });
});
