// @vitest-environment edge-runtime

import { defineSchema, defineTable, makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

test("removes retired fields across batches without changing other data", async () => {
  const transitionalSchema = defineSchema({
    profiles: defineTable({ username: v.string(), timezone: v.optional(v.string()) }),
    siteSettings: defineTable({ siteName: v.string(), defaultUserTimezone: v.optional(v.string()) }),
  });

  const t = convexTest(transitionalSchema, import.meta.glob(["./maintenance.ts", "./_generated/*.ts"]));
  await t.run(async (ctx) => {
    for (let i = 0; i < 101; i++) {
      await ctx.db.insert("profiles", { username: `user${i}`, timezone: "Australia/Melbourne" });
    }

    await ctx.db.insert("siteSettings", { siteName: "MOJ", defaultUserTimezone: "UTC" });
  });

  const cleanup = makeFunctionReference<
    "mutation",
    { table: "profiles" | "siteSettings"; cursor?: string },
    { isDone: boolean; cursor: string }
  >("maintenance:removeTimezonePreferences");

  const first = await t.mutation(cleanup, { table: "profiles" });
  expect(first.isDone).toBe(false);
  expect((await t.mutation(cleanup, { table: "profiles", cursor: first.cursor })).isDone).toBe(true);
  await t.mutation(cleanup, { table: "siteSettings" });
  await t.mutation(cleanup, { table: "siteSettings" });
  await t.run(async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();
    expect(profiles).toHaveLength(101);

    for (const profile of profiles) {
      expect(profile).not.toHaveProperty("timezone");
      expect(profile.username).toMatch(/^user\d+$/);
    }

    const settings = await ctx.db.query("siteSettings").unique();
    expect(settings).not.toHaveProperty("defaultUserTimezone");
    expect(settings?.siteName).toBe("MOJ");
  });
});
