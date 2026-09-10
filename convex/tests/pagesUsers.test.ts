// @vitest-environment edge-runtime

/**
 * `convex/pages/users.ts`: the two reads the users and organisations pages need
 * and that no backend module already exposes.
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { setupConvexTest } from "./convexTest.setup";
import { makeOrganization, makeProfile } from "./fixtures.setup";

describe("pages/users.organizationsFor", () => {
  test("returns each profile's organisations, sorted by short name", async () => {
    const t = setupConvexTest();
    const ids = await t.run(async (ctx) => {
      const keen = await makeProfile(ctx, "keen");
      const lonely = await makeProfile(ctx, "lonely");
      const maps = await makeOrganization(ctx, "maps", {
        name: "MAPS",
        shortName: "MAPS",
        legacyId: 5,
      });
      const acs = await makeOrganization(ctx, "acs", { name: "ACS", shortName: "ACS" });
      await ctx.db.insert("organizationMemberships", {
        organizationId: maps,
        profileId: keen,
        order: 0,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: acs,
        profileId: keen,
        order: 1,
      });
      return { keen, lonely };
    });

    const rows = await t.query(api.pages.users.organizationsFor, {
      profileIds: [ids.keen, ids.lonely],
    });

    const keen = rows.find((row) => row.profileId === ids.keen);
    expect(keen?.organizations.map((organization) => organization.shortName)).toEqual(["ACS", "MAPS"]);
    expect(keen?.organizations.find((organization) => organization.slug === "maps")?.legacyId).toBe(5);
    expect(rows.find((row) => row.profileId === ids.lonely)?.organizations).toEqual([]);
  });

  test("a repeated profile id is answered once", async () => {
    const t = setupConvexTest();
    const keen = await t.run(async (ctx) => await makeProfile(ctx, "keen"));

    const rows = await t.query(api.pages.users.organizationsFor, {
      profileIds: [keen, keen, keen],
    });
    expect(rows).toHaveLength(1);
  });
});

describe("pages/users.dataExportDownload", () => {
  test("there is nothing to download until a job has finished", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "keen");
    });
    const asKeen = t.withIdentity({ subject: "user_keen" });

    expect(await asKeen.query(api.pages.users.dataExportDownload, {})).toBeNull();

    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "keen"))
        .unique();
      if (!profile) throw new Error("no profile");
      await ctx.db.insert("jobs", {
        type: "userExport",
        status: "running",
        progress: { done: 1, total: 2, stage: "Collecting submissions" },
        args: {},
        createdByProfileId: profile._id,
        createdAt: Date.now(),
      });
    });

    expect(await asKeen.query(api.pages.users.dataExportDownload, {})).toBeNull();
  });

  test("a finished job hands back a link named after the user", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "keen");
    });

    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "keen"))
        .unique();
      if (!profile) throw new Error("no profile");
      const storageId = await ctx.storage.store(new Blob(["archive"], { type: "application/zip" }));
      await ctx.db.insert("jobs", {
        type: "userExport",
        status: "done",
        progress: { done: 2, total: 2, stage: "Done" },
        args: {},
        result: { storageId },
        createdByProfileId: profile._id,
        createdAt: Date.now(),
        finishedAt: Date.now(),
      });
    });

    const download = await t
      .withIdentity({ subject: "user_keen" })
      .query(api.pages.users.dataExportDownload, {});
    expect(download?.name).toBe("keen-data.zip");
    expect(download?.url).toBeTruthy();
  });

  test("a signed-out visitor is refused", async () => {
    const t = setupConvexTest();
    await expect(t.query(api.pages.users.dataExportDownload, {})).rejects.toThrow();
  });
});
