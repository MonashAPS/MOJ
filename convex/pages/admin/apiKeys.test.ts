// @vitest-environment edge-runtime

/**
 * `convex/pages/admin/apiKeys.ts`: minting, listing and revoking the API-key
 * rows `http/problemsApi` verifies a presented key against.
 */

import { describe, expect, test } from "vitest";
import { api } from "../../_generated/api";
import { asUser, insertLanguage, insertOrganization, insertProfile } from "../../test.fixtures";
import { setupTest } from "../../test.setup";

const KEY_HASH = "a".repeat(64);

const OTHER_HASH = "b".repeat(64);

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

describe("pages/admin api keys", () => {
  test("a key is recorded against the staff member who minted it", async () => {
    const { t, ids } = await seed();
    const asRoot = asUser(t, "root");

    const id = await asRoot.mutation(api.pages.admin.apiKeys.record, {
      keyHash: KEY_HASH,
      prefix: "moj123",
      name: "problem repo",
      scopes: ["problems:write"],
      expiresAt: null,
    });

    const row = await t.run(async (ctx) => await ctx.db.get(id));
    expect(row?.profileId).toBe(ids.root);
    expect(row?.scopes).toEqual(["problems:write"]);
    expect(row?.enabled).toBe(true);
    expect(row?.expiresAt).toBeUndefined();

    const mine = await asRoot.query(api.pages.admin.apiKeys.mine, {});
    expect(mine.map((entry) => entry.name)).toEqual(["problem repo"]);
  });

  test("the hash has to be a sha256, a scope is required and a key is recorded once", async () => {
    const { t } = await seed();
    const asRoot = asUser(t, "root");

    await expect(
      asRoot.mutation(api.pages.admin.apiKeys.record, {
        keyHash: "not-a-hash",
        name: "bad",
        scopes: ["problems:write"],
      }),
    ).rejects.toThrow(/sha256/);

    await expect(
      asRoot.mutation(api.pages.admin.apiKeys.record, { keyHash: KEY_HASH, name: "bad", scopes: [] }),
    ).rejects.toThrow(/scope/);

    await asRoot.mutation(api.pages.admin.apiKeys.record, {
      keyHash: KEY_HASH,
      name: "first",
      scopes: ["problems:write"],
    });
    await expect(
      asRoot.mutation(api.pages.admin.apiKeys.record, {
        keyHash: KEY_HASH,
        name: "again",
        scopes: ["problems:write"],
      }),
    ).rejects.toThrow(/already/);
  });

  test("a member cannot mint or list keys", async () => {
    const { t } = await seed();
    const asMember = asUser(t, "member");
    await expect(asMember.query(api.pages.admin.apiKeys.mine, {})).rejects.toThrow(/Staff only/);
    await expect(
      asMember.mutation(api.pages.admin.apiKeys.record, {
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

    await expect(asUser(t, "clerk").mutation(api.pages.admin.apiKeys.revoke, { id })).rejects.toThrow(
      /your own keys/,
    );

    await asUser(t, "root").mutation(api.pages.admin.apiKeys.revoke, { id });
    expect(await t.run(async (ctx) => await ctx.db.get(id))).toBeNull();
  });
});
