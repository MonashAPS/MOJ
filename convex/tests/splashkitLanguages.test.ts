// @vitest-environment edge-runtime

/**
 * Adding the SplashKit languages to a deployment.
 *
 * They are deliberately absent from the seed: a deployment only offers them once
 * its judges run the SplashKit image, and a language no judge reports is a
 * language whose submissions never get claimed. The operator adds them once the
 * judge is in place, and running the tool twice has to refresh the rows rather
 * than leave two of each, which is the failure the importer already taught us.
 */

import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import { SEED_LANGUAGES } from "../lib/seedData";
import { setupConvexTest } from "./convexTest.setup";

const KEYS = ["SKCPP", "SKPY3"];

describe("admin/splashkit.addLanguages", () => {
  test("the seed does not carry them", () => {
    for (const key of KEYS) {
      expect(SEED_LANGUAGES.some((language) => language.key === key)).toBe(false);
    }
  });

  test("adds both languages", async () => {
    const t = setupConvexTest();
    const report = await t.mutation(internal.admin.splashkit.addLanguages, {});
    expect(report.added.sort()).toEqual(KEYS);
    expect(report.updated).toEqual([]);

    const languages = await t.run(async (ctx) => await ctx.db.query("languages").collect());
    for (const key of KEYS) {
      const row = languages.find((language) => language.key === key);
      expect(row).toBeDefined();
      expect(row?.extension).toBe(key === "SKCPP" ? "cpp" : "py");
      // The editor and the highlighter treat them as their base language.
      expect(row?.commonName).toBe(key === "SKCPP" ? "C++" : "Python");
    }
  });

  test("a second run refreshes rather than duplicates", async () => {
    const t = setupConvexTest();
    await t.mutation(internal.admin.splashkit.addLanguages, {});
    const report = await t.mutation(internal.admin.splashkit.addLanguages, {});

    expect(report.added).toEqual([]);
    expect(report.updated.sort()).toEqual(KEYS);

    const languages = await t.run(async (ctx) => await ctx.db.query("languages").collect());
    for (const key of KEYS) {
      expect(languages.filter((language) => language.key === key)).toHaveLength(1);
    }
  });

  test("repairs a row that has been edited away from the judge's key", async () => {
    const t = setupConvexTest();
    await t.mutation(internal.admin.splashkit.addLanguages, {});
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("languages")
        .withIndex("by_key", (q) => q.eq("key", "SKCPP"))
        .first();
      if (row) await ctx.db.patch(row._id, { extension: "wrong", name: "edited" });
    });

    await t.mutation(internal.admin.splashkit.addLanguages, {});

    const row = await t.run(
      async (ctx) =>
        await ctx.db
          .query("languages")
          .withIndex("by_key", (q) => q.eq("key", "SKCPP"))
          .first(),
    );
    expect(row?.extension).toBe("cpp");
    expect(row?.name).toBe("C++ (SplashKit)");
  });
});
