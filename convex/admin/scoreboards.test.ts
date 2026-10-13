// @vitest-environment edge-runtime

/**
 * The `/admin` scoreboards section: the organisation standings setting, which
 * takes a decay from 0 to 1 and organisations that exist.
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { asUser, insertContest, insertOrganization, insertProfile } from "../test.fixtures";
import { setupTest } from "../test.setup";

async function seed() {
  const t = setupTest();

  const ids = await t.run(async (ctx) => {
    await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });
    await insertContest(ctx, { key: "first" });

    return {
      monash: await insertOrganization(ctx, { slug: "monash" }),
      rmit: await insertOrganization(ctx, { slug: "rmit" }),
    };
  });

  await asUser(t, "root").mutation(api.admin.scoreboards.create, {
    key: "cup",
    name: "The Cup",
    contestKeys: ["first"],
  });

  return { t, ...ids };
}

describe("admin/scoreboards organisation standings", () => {
  test("are saved in order, once each, and turned off with null", async () => {
    const { t, monash, rmit } = await seed();
    const asRoot = asUser(t, "root");

    expect(
      (await asRoot.query(api.admin.scoreboards.get, { key: "cup" }))?.organizationStandings,
    ).toBeUndefined();

    await asRoot.mutation(api.admin.scoreboards.update, {
      key: "cup",
      organizationStandings: { decay: 0.5, organizationIds: [rmit, monash, rmit] },
    });
    expect((await asRoot.query(api.admin.scoreboards.get, { key: "cup" }))?.organizationStandings).toEqual({
      decay: 0.5,
      organizationIds: [rmit, monash],
    });

    await asRoot.mutation(api.admin.scoreboards.update, { key: "cup", organizationStandings: null });
    expect(
      (await asRoot.query(api.admin.scoreboards.get, { key: "cup" }))?.organizationStandings,
    ).toBeUndefined();
  });

  test("refuse a decay outside 0 to 1, and a missing organisation", async () => {
    const { t, monash } = await seed();
    const asRoot = asUser(t, "root");

    for (const decay of [-0.5, 1.5, Number.NaN]) {
      await expect(
        asRoot.mutation(api.admin.scoreboards.update, {
          key: "cup",
          organizationStandings: { decay, organizationIds: [] },
        }),
      ).rejects.toThrow(/between 0 and 1/);
    }

    await t.run(async (ctx) => ctx.db.delete(monash));
    await expect(
      asRoot.mutation(api.admin.scoreboards.update, {
        key: "cup",
        organizationStandings: { decay: 1, organizationIds: [monash] },
      }),
    ).rejects.toThrow(/not found/);
  });
});
