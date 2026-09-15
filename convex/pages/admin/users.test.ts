// @vitest-environment edge-runtime

/**
 * `convex/pages/admin/users.ts`: the extra profile fields the user edit form
 * reads on top of `convex/admin/*`, and the mutation that sets an account's
 * organisations and preferred language by name.
 */

import { describe, expect, test } from "vitest";
import { api } from "../../_generated/api";
import { asUser, insertLanguage, insertOrganization, insertProfile } from "../../test.fixtures";
import { setupTest } from "../../test.setup";

const KEY_HASH = "a".repeat(64);

async function seed() {
  const t = setupTest();

  const ids = await t.run(async (ctx) => {
    const root = await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });

    const clerk = await insertProfile(ctx, {
      username: "clerk",
      isStaff: true,
      permissions: ["judge.change_profile"],
    });

    const member = await insertProfile(ctx, { username: "member" });
    const languageId = await insertLanguage(ctx, { key: "PY3" });
    await insertLanguage(ctx, { key: "CPP20" });
    const school = await insertOrganization(ctx, { slug: "school", name: "School" });
    const club = await insertOrganization(ctx, { slug: "club", name: "Club" });

    return { root, clerk, member, languageId, school, club };
  });

  return { t, ids };
}

describe("pages/admin user extras", () => {
  test("the editor's extra fields come back with the memberships and keys", async () => {
    const { t, ids } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.member, {
        about: "Likes graphs.",
        usernameDisplayOverride: "Member",
        languageId: ids.languageId,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: ids.school,
        profileId: ids.member,
        order: 0,
      });
      await ctx.db.insert("apiKeys", {
        keyHash: KEY_HASH,
        prefix: "abc123",
        name: "problem repo",
        profileId: ids.member,
        scopes: ["problems:write"],
        enabled: true,
        createdAt: 5,
      });
    });

    const extras = await asUser(t, "clerk").query(api.pages.admin.users.extras, { username: "member" });
    expect(extras).not.toBeNull();
    expect(extras?.about).toBe("Likes graphs.");
    expect(extras?.usernameDisplayOverride).toBe("Member");
    expect(extras?.languageKey).toBe("PY3");
    expect(extras?.organizationSlugs).toEqual(["school"]);
    expect(extras?.apiKeys).toHaveLength(1);
    expect(extras?.apiKeys[0]?.prefix).toBe("abc123");
  });

  test("a member cannot read another account's extras", async () => {
    const { t } = await seed();
    await expect(
      asUser(t, "member").query(api.pages.admin.users.extras, { username: "root" }),
    ).rejects.toThrow(/Staff only/);
  });

  test("an unknown username is null, not an error", async () => {
    const { t } = await seed();
    const extras = await asUser(t, "clerk").query(api.pages.admin.users.extras, { username: "nobody" });
    expect(extras).toBeNull();
  });
});

describe("pages/admin memberships", () => {
  test("setting the organisations adds, removes and keeps the counts straight", async () => {
    const { t, ids } = await seed();
    const asClerk = asUser(t, "clerk");

    await asClerk.mutation(api.pages.admin.users.setMemberships, {
      username: "member",
      organizationSlugs: ["school", "club"],
      reason: "Joined both",
    });

    let counts = await t.run(async (ctx) => ({
      school: (await ctx.db.get(ids.school))?.memberCount,
      club: (await ctx.db.get(ids.club))?.memberCount,
    }));

    expect(counts).toEqual({ school: 1, club: 1 });

    await asClerk.mutation(api.pages.admin.users.setMemberships, {
      username: "member",
      organizationSlugs: ["club"],
      reason: "Left school",
    });
    counts = await t.run(async (ctx) => ({
      school: (await ctx.db.get(ids.school))?.memberCount,
      club: (await ctx.db.get(ids.club))?.memberCount,
    }));
    expect(counts).toEqual({ school: 0, club: 1 });

    const extras = await asClerk.query(api.pages.admin.users.extras, { username: "member" });
    expect(extras?.organizationSlugs).toEqual(["club"]);
  });

  test("the preferred language is set and cleared by key", async () => {
    const { t } = await seed();
    const asClerk = asUser(t, "clerk");

    await asClerk.mutation(api.pages.admin.users.setMemberships, {
      username: "member",
      languageKey: "CPP20",
      reason: "Asked for C++",
    });
    expect((await asClerk.query(api.pages.admin.users.extras, { username: "member" }))?.languageKey).toBe(
      "CPP20",
    );

    await asClerk.mutation(api.pages.admin.users.setMemberships, {
      username: "member",
      languageKey: null,
      reason: "Cleared it",
    });
    expect(
      (await asClerk.query(api.pages.admin.users.extras, { username: "member" }))?.languageKey,
    ).toBeNull();
  });

  test("an unknown language or organisation is refused by name", async () => {
    const { t } = await seed();
    const asClerk = asUser(t, "clerk");
    await expect(
      asClerk.mutation(api.pages.admin.users.setMemberships, { username: "member", languageKey: "NOPE" }),
    ).rejects.toThrow(/NOPE/);
    await expect(
      asClerk.mutation(api.pages.admin.users.setMemberships, {
        username: "member",
        organizationSlugs: ["nowhere"],
      }),
    ).rejects.toThrow(/nowhere/);
  });

  test("only a superuser may edit a superuser", async () => {
    const { t } = await seed();
    await expect(
      asUser(t, "clerk").mutation(api.pages.admin.users.setMemberships, {
        username: "root",
        languageKey: "PY3",
      }),
    ).rejects.toThrow(/superuser/i);
  });

  test("the change is recorded with the reason it was given", async () => {
    const { t } = await seed();
    const asClerk = asUser(t, "clerk");
    await asClerk.mutation(api.pages.admin.users.setMemberships, {
      username: "member",
      organizationSlugs: ["club"],
      reason: "Moved to another organisation",
    });
    const rows = await t.run(async (ctx) => await ctx.db.query("revisions").collect());
    expect(rows.map((row) => row.reason)).toContain("Moved to another organisation");
  });
});
