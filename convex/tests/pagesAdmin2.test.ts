// @vitest-environment edge-runtime

/**
 * `convex/pages/admin2.ts`: the reads and writes the part-2 console pages need
 * on top of `convex/admin/*`. The gates are the same Django ones the rest of
 * the section uses, and the API-key rows are the fallback `http/problemsApi`
 * verifies a presented key against (docs/SPEC_CHANGES.md).
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { setupConvexTest } from "./convexTest.setup";
import { makeLanguage, makeOrganization, makeProfile } from "./fixtures.setup";

const KEY_HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);

async function seed() {
  const t = setupConvexTest();
  const ids = await t.run(async (ctx) => {
    const root = await makeProfile(ctx, "root", { isStaff: true, isSuperuser: true });
    const clerk = await makeProfile(ctx, "clerk", {
      isStaff: true,
      permissions: ["judge.change_profile"],
    });
    const member = await makeProfile(ctx, "member");
    const languageId = await makeLanguage(ctx, "PY3");
    await makeLanguage(ctx, "CPP20");
    const school = await makeOrganization(ctx, "school", { name: "School" });
    const club = await makeOrganization(ctx, "club", { name: "Club" });
    return { root, clerk, member, languageId, school, club };
  });
  return { t, ids };
}

describe("pages/admin2 revisions", () => {
  test("a member cannot read the history", async () => {
    const { t } = await seed();
    await expect(
      t
        .withIdentity({ subject: "user_member" })
        .query(api.pages.admin2.revisions, { entityType: "profiles", entityId: "x" }),
    ).rejects.toThrow(/Staff only/);
  });

  test("staff read the newest change first, with its author", async () => {
    const { t, ids } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("revisions", {
        entityType: "organizations",
        entityId: ids.school,
        snapshot: {},
        authorProfileId: ids.root,
        reason: "Renamed it",
        createdAt: 1_000,
      });
      await ctx.db.insert("revisions", {
        entityType: "organizations",
        entityId: ids.school,
        snapshot: {},
        authorProfileId: ids.root,
        reason: "Opened enrollment",
        createdAt: 2_000,
      });
      await ctx.db.insert("revisions", {
        entityType: "organizations",
        entityId: ids.club,
        snapshot: {},
        authorProfileId: undefined,
        reason: "Somewhere else",
        createdAt: 3_000,
      });
    });

    const rows = await t
      .withIdentity({ subject: "user_root" })
      .query(api.pages.admin2.revisions, { entityType: "organizations", entityId: ids.school });
    expect(rows.map((row) => row.reason)).toEqual(["Opened enrollment", "Renamed it"]);
    expect(rows[0]?.author).toBe("root");
  });
});

describe("pages/admin2 user extras", () => {
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

    const extras = await t
      .withIdentity({ subject: "user_clerk" })
      .query(api.pages.admin2.userExtras, { username: "member" });
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
      t.withIdentity({ subject: "user_member" }).query(api.pages.admin2.userExtras, { username: "root" }),
    ).rejects.toThrow(/Staff only/);
  });

  test("an unknown username is null, not an error", async () => {
    const { t } = await seed();
    const extras = await t
      .withIdentity({ subject: "user_clerk" })
      .query(api.pages.admin2.userExtras, { username: "nobody" });
    expect(extras).toBeNull();
  });
});

describe("pages/admin2 memberships", () => {
  test("setting the organisations adds, removes and keeps the counts straight", async () => {
    const { t, ids } = await seed();
    const asClerk = t.withIdentity({ subject: "user_clerk" });

    await asClerk.mutation(api.pages.admin2.setUserMemberships, {
      username: "member",
      organizationSlugs: ["school", "club"],
      reason: "Joined both",
    });
    let counts = await t.run(async (ctx) => ({
      school: (await ctx.db.get(ids.school))?.memberCount,
      club: (await ctx.db.get(ids.club))?.memberCount,
    }));
    expect(counts).toEqual({ school: 1, club: 1 });

    await asClerk.mutation(api.pages.admin2.setUserMemberships, {
      username: "member",
      organizationSlugs: ["club"],
      reason: "Left school",
    });
    counts = await t.run(async (ctx) => ({
      school: (await ctx.db.get(ids.school))?.memberCount,
      club: (await ctx.db.get(ids.club))?.memberCount,
    }));
    expect(counts).toEqual({ school: 0, club: 1 });

    const extras = await asClerk.query(api.pages.admin2.userExtras, { username: "member" });
    expect(extras?.organizationSlugs).toEqual(["club"]);
  });

  test("the preferred language is set and cleared by key", async () => {
    const { t } = await seed();
    const asClerk = t.withIdentity({ subject: "user_clerk" });

    await asClerk.mutation(api.pages.admin2.setUserMemberships, {
      username: "member",
      languageKey: "CPP20",
      reason: "Asked for C++",
    });
    expect((await asClerk.query(api.pages.admin2.userExtras, { username: "member" }))?.languageKey).toBe(
      "CPP20",
    );

    await asClerk.mutation(api.pages.admin2.setUserMemberships, {
      username: "member",
      languageKey: null,
      reason: "Cleared it",
    });
    expect(
      (await asClerk.query(api.pages.admin2.userExtras, { username: "member" }))?.languageKey,
    ).toBeNull();
  });

  test("an unknown language or organisation is refused by name", async () => {
    const { t } = await seed();
    const asClerk = t.withIdentity({ subject: "user_clerk" });
    await expect(
      asClerk.mutation(api.pages.admin2.setUserMemberships, { username: "member", languageKey: "NOPE" }),
    ).rejects.toThrow(/NOPE/);
    await expect(
      asClerk.mutation(api.pages.admin2.setUserMemberships, {
        username: "member",
        organizationSlugs: ["nowhere"],
      }),
    ).rejects.toThrow(/nowhere/);
  });

  test("only a superuser may edit a superuser", async () => {
    const { t } = await seed();
    await expect(
      t
        .withIdentity({ subject: "user_clerk" })
        .mutation(api.pages.admin2.setUserMemberships, { username: "root", languageKey: "PY3" }),
    ).rejects.toThrow(/superuser/i);
  });

  test("the change is recorded with the reason it was given", async () => {
    const { t } = await seed();
    const asClerk = t.withIdentity({ subject: "user_clerk" });
    await asClerk.mutation(api.pages.admin2.setUserMemberships, {
      username: "member",
      organizationSlugs: ["club"],
      reason: "Moved to the club",
    });
    const rows = await t.run(async (ctx) => await ctx.db.query("revisions").collect());
    expect(rows.map((row) => row.reason)).toContain("Moved to the club");
  });
});

describe("pages/admin2 api keys", () => {
  test("a key is recorded against the staff member who minted it", async () => {
    const { t, ids } = await seed();
    const asRoot = t.withIdentity({ subject: "user_root" });

    const id = await asRoot.mutation(api.pages.admin2.recordApiKey, {
      keyHash: KEY_HASH,
      prefix: "moj123",
      name: "problem repo",
      scopes: ["problems:write"],
      expiresAt: null,
    });

    const row = await t.run(async (ctx) => await ctx.db.get(id as Id<"apiKeys">));
    expect(row?.profileId).toBe(ids.root);
    expect(row?.scopes).toEqual(["problems:write"]);
    expect(row?.enabled).toBe(true);
    expect(row?.expiresAt).toBeUndefined();

    const mine = await asRoot.query(api.pages.admin2.myApiKeys, {});
    expect(mine.map((entry) => entry.name)).toEqual(["problem repo"]);
  });

  test("the hash has to be a sha256, a scope is required and a key is recorded once", async () => {
    const { t } = await seed();
    const asRoot = t.withIdentity({ subject: "user_root" });

    await expect(
      asRoot.mutation(api.pages.admin2.recordApiKey, {
        keyHash: "not-a-hash",
        name: "bad",
        scopes: ["problems:write"],
      }),
    ).rejects.toThrow(/sha256/);

    await expect(
      asRoot.mutation(api.pages.admin2.recordApiKey, { keyHash: KEY_HASH, name: "bad", scopes: [] }),
    ).rejects.toThrow(/scope/);

    await asRoot.mutation(api.pages.admin2.recordApiKey, {
      keyHash: KEY_HASH,
      name: "first",
      scopes: ["problems:write"],
    });
    await expect(
      asRoot.mutation(api.pages.admin2.recordApiKey, {
        keyHash: KEY_HASH,
        name: "again",
        scopes: ["problems:write"],
      }),
    ).rejects.toThrow(/already/);
  });

  test("a member cannot mint or list keys", async () => {
    const { t } = await seed();
    const asMember = t.withIdentity({ subject: "user_member" });
    await expect(asMember.query(api.pages.admin2.myApiKeys, {})).rejects.toThrow(/Staff only/);
    await expect(
      asMember.mutation(api.pages.admin2.recordApiKey, {
        keyHash: KEY_HASH,
        name: "mine",
        scopes: ["problems:write"],
      }),
    ).rejects.toThrow(/Staff only/);
  });

  test("only the owner or a superuser may revoke a key", async () => {
    const { t, ids } = await seed();
    const id = await t.run(
      async (ctx) =>
        await ctx.db.insert("apiKeys", {
          keyHash: OTHER_HASH,
          name: "root's key",
          profileId: ids.root,
          scopes: ["problems:write"],
          enabled: true,
          createdAt: 1,
        }),
    );

    await expect(
      t.withIdentity({ subject: "user_clerk" }).mutation(api.pages.admin2.revokeApiKey, { id }),
    ).rejects.toThrow(/your own keys/);

    await t.withIdentity({ subject: "user_root" }).mutation(api.pages.admin2.revokeApiKey, { id });
    expect(await t.run(async (ctx) => await ctx.db.get(id))).toBeNull();
  });
});
