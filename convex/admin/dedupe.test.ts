// @vitest-environment edge-runtime

/**
 * Repairing a deployment that a pre-upsert import duplicated.
 *
 * The seed and the importer both fill the reference tables. The importer used
 * to insert blindly, so a seeded site that was then imported ended up with two
 * rows for every natural key: the header rendered "Problems Problems
 * Submissions Submissions" and the taxonomy carried two `uncategorized` rows.
 * `admin/dedupe.dedupeNaturalKeys` folds the duplicates back together;
 * `admin/languages.dedupeByKey` is the same repair for `languages`.
 */

import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isJsonObject } from "../lib/json";
import { asUser, insertProblem, insertProfile } from "../test.fixtures";
import { setupTest, type T } from "../test.setup";

async function makeNavItem(
  ctx: MutationCtx,
  key: string,
  order: number,
  overrides: Partial<{ label: string; parentId: Id<"navigationBar">; legacyId: number }> = {},
): Promise<Id<"navigationBar">> {
  return await ctx.db.insert("navigationBar", {
    order,
    key,
    label: overrides.label ?? key,
    path: `/${key}/`,
    regex: `^/${key}`,
    parentId: overrides.parentId,
    legacyId: overrides.legacyId,
  });
}

async function makeLicense(
  ctx: MutationCtx,
  key: string,
  overrides: Partial<{ name: string; legacyId: number }> = {},
): Promise<Id<"licenses">> {
  return await ctx.db.insert("licenses", {
    key,
    link: `https://example.com/${key}`,
    name: overrides.name ?? key,
    display: "",
    icon: "",
    text: "",
    legacyId: overrides.legacyId,
  });
}

async function runAsRoot(t: T) {
  return await asUser(t, "root").mutation(api.admin.dedupe.dedupeNaturalKeys, {});
}

async function makeRoot(t: T): Promise<void> {
  await t.run(async (ctx) => {
    await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });
  });
}

describe("admin/dedupe.dedupeNaturalKeys on the navigation bar", () => {
  /**
   * The seeded rows carry the same legacy ids as the dump (lib/seedData.ts), so
   * nothing but the creation order separates the two sets: the imported one is
   * newer and wins. The seeded children point at seeded parents, and so does
   * anything an admin added while the seeded rows were the visible ones.
   */
  async function seedNavigation(t: T) {
    return await t.run(async (ctx) => {
      const seededProblems = await makeNavItem(ctx, "problems", 1, { label: "Problems", legacyId: 1 });
      const seededAbout = await makeNavItem(ctx, "about", 6, { label: "About", legacyId: 6 });

      const seededStatus = await makeNavItem(ctx, "status", 7, {
        label: "Status",
        parentId: seededAbout,
        legacyId: 7,
      });

      const custom = await makeNavItem(ctx, "faq", 8, { label: "FAQ", parentId: seededAbout });

      const importedProblems = await makeNavItem(ctx, "problems", 1, { label: "Problems", legacyId: 1 });
      const importedAbout = await makeNavItem(ctx, "about", 6, { label: "About", legacyId: 6 });

      const importedStatus = await makeNavItem(ctx, "status", 7, {
        label: "Status",
        parentId: importedAbout,
        legacyId: 7,
      });

      return {
        seededProblems,
        seededAbout,
        seededStatus,
        custom,
        importedProblems,
        importedAbout,
        importedStatus,
      };
    });
  }

  test("keeps one row per key and repoints the children of the rows it drops", async () => {
    const t = setupTest();
    await makeRoot(t);
    const ids = await seedNavigation(t);

    const report = await runAsRoot(t);

    expect(report.keys).toEqual(["navigationBar/about", "navigationBar/problems", "navigationBar/status"]);
    expect(report.keysRepaired).toBe(3);
    expect(report.rowsDeleted).toBe(3);
    // The seeded status item and the hand-added FAQ both hung off the About
    // row that is going away.
    expect(report.referencesRewritten).toBe(2);
    expect(report.isDone).toBe(true);

    await t.run(async (ctx) => {
      const rows = await ctx.db.query("navigationBar").collect();
      expect(rows.map((row) => row.key).sort()).toEqual(["about", "faq", "problems", "status"]);

      for (const gone of [ids.seededProblems, ids.seededAbout, ids.seededStatus]) {
        expect(await ctx.db.get(gone)).toBeNull();
      }

      expect((await ctx.db.get(ids.custom))?.parentId).toBe(ids.importedAbout);
      expect((await ctx.db.get(ids.importedStatus))?.parentId).toBe(ids.importedAbout);

      // Nothing may still name a deleted row.
      for (const row of rows) {
        if (row.parentId === undefined) continue;
        expect(await ctx.db.get(row.parentId)).not.toBeNull();
      }
    });
  });

  test("is safe to run twice", async () => {
    const t = setupTest();
    await makeRoot(t);
    const ids = await seedNavigation(t);

    await runAsRoot(t);
    const second = await runAsRoot(t);

    expect(second).toEqual({
      keys: [],
      keysRepaired: 0,
      rowsDeleted: 0,
      referencesRewritten: 0,
      isDone: true,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("navigationBar").collect()).toHaveLength(4);
      expect((await ctx.db.get(ids.custom))?.parentId).toBe(ids.importedAbout);
    });
  });
});

describe("admin/dedupe.dedupeNaturalKeys on the problem taxonomy", () => {
  /**
   * What the staging deployment holds: the seed wrote `Uncategorized` with no
   * legacy id, the import wrote `uncategorized` with legacy id 1, and the
   * imported problems resolved their group through the legacy id mapping.
   */
  async function seedTaxonomy(t: T) {
    return await t.run(async (ctx) => {
      const seededType = await ctx.db.insert("problemTypes", {
        name: "uncategorized",
        fullName: "Uncategorized",
      });

      const importedType = await ctx.db.insert("problemTypes", {
        name: "uncategorized",
        fullName: "uncategorized",
        legacyId: 1,
      });

      const mathType = await ctx.db.insert("problemTypes", { name: "math", fullName: "Mathematics" });

      const seededGroup = await ctx.db.insert("problemGroups", {
        name: "uncategorized",
        fullName: "Uncategorized",
      });

      const importedGroup = await ctx.db.insert("problemGroups", {
        name: "uncategorized",
        fullName: "uncategorized",
        legacyId: 1,
      });

      const seededLicense = await makeLicense(ctx, "cc", { name: "Creative Commons" });
      const importedLicense = await makeLicense(ctx, "cc", { name: "CC BY-SA 3.0", legacyId: 3 });

      const seededSide = await insertProblem(ctx, {
        code: "aplusb",
        groupId: seededGroup,
        typeIds: [seededType, mathType],
      });

      await ctx.db.patch(seededSide, { licenseId: seededLicense });

      // A problem that was edited to carry both rows of the duplicated type.
      const bothSides = await insertProblem(ctx, {
        code: "helloworld",
        groupId: importedGroup,
        typeIds: [seededType, importedType],
      });

      const untouched = await insertProblem(ctx, {
        code: "fizzbuzz",
        groupId: importedGroup,
        typeIds: [mathType],
      });

      return {
        seededType,
        importedType,
        mathType,
        seededGroup,
        importedGroup,
        seededLicense,
        importedLicense,
        seededSide,
        bothSides,
        untouched,
      };
    });
  }

  test("repoints every problem field at the imported row", async () => {
    const t = setupTest();
    await makeRoot(t);
    const ids = await seedTaxonomy(t);

    const report = await runAsRoot(t);

    expect(report.keys).toEqual(["licenses/cc", "problemGroups/uncategorized", "problemTypes/uncategorized"]);
    expect(report.rowsDeleted).toBe(3);
    // Only the two problems that named a losing row are written.
    expect(report.referencesRewritten).toBe(2);
    expect(report.isDone).toBe(true);

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.seededType)).toBeNull();
      expect(await ctx.db.get(ids.seededGroup)).toBeNull();
      expect(await ctx.db.get(ids.seededLicense)).toBeNull();

      const seededSide = await ctx.db.get(ids.seededSide);
      expect(seededSide?.typeIds).toEqual([ids.importedType, ids.mathType]);
      expect(seededSide?.groupId).toBe(ids.importedGroup);
      expect(seededSide?.licenseId).toBe(ids.importedLicense);

      // The two halves of the duplicate fold into one entry, not two.
      expect((await ctx.db.get(ids.bothSides))?.typeIds).toEqual([ids.importedType]);
      const untouched = await ctx.db.get(ids.untouched);
      expect(untouched?.typeIds).toEqual([ids.mathType]);
      expect(untouched?.groupId).toBe(ids.importedGroup);
    });
  });

  test("runs from the command line, where there is no signed in superuser", async () => {
    const t = setupTest();
    const ids = await seedTaxonomy(t);

    const report = await t.mutation(internal.admin.dedupe.dedupeNaturalKeysStep, {});

    expect(report.isDone).toBe(true);
    expect(report.rowsDeleted).toBe(3);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.seededGroup)).toBeNull();
      expect((await ctx.db.get(ids.seededSide))?.groupId).toBe(ids.importedGroup);
    });
  });

  test("finishes a repair too big for one transaction on the scheduler", async () => {
    const t = setupTest();
    await makeRoot(t);
    const ids = await seedTaxonomy(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 520; i++) await insertProblem(ctx, { code: `bulk${i}`, groupId: ids.seededGroup });
    });

    const first = await runAsRoot(t);
    expect(first.isDone).toBe(false);
    expect(first.rowsDeleted).toBe(0);
    await t.run(async (ctx) => {
      // Nothing is deleted until every reference has moved.
      expect(await ctx.db.get(ids.seededGroup)).not.toBeNull();
    });

    await t.finishAllScheduledFunctions(() => {});

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.seededGroup)).toBeNull();

      const stragglers = await ctx.db
        .query("problems")
        .withIndex("by_group", (q) => q.eq("groupId", ids.seededGroup))
        .collect();

      expect(stragglers).toHaveLength(0);
      expect((await ctx.db.get(ids.seededSide))?.groupId).toBe(ids.importedGroup);
    });
  });

  test("refuses anyone who is not a superuser", async () => {
    const t = setupTest();
    await seedTaxonomy(t);
    await t.run(async (ctx) => {
      await insertProfile(ctx, {
        username: "clerk",
        isStaff: true,
        permissions: ["judge.change_problemtype"],
      });
    });

    await expect(asUser(t, "clerk").mutation(api.admin.dedupe.dedupeNaturalKeys, {})).rejects.toThrow(
      /Superusers only/,
    );
    await expect(t.mutation(api.admin.dedupe.dedupeNaturalKeys, {})).rejects.toThrow(/logged in/);

    await t.run(async (ctx) => {
      expect(await ctx.db.query("problemTypes").collect()).toHaveLength(3);
    });
  });
});

describe("admin/dedupe.dedupeNaturalKeys picks the survivor", () => {
  test("keeps the imported row even when it was created first", async () => {
    const t = setupTest();
    await makeRoot(t);

    const ids = await t.run(async (ctx) => {
      const imported = await ctx.db.insert("problemTypes", {
        name: "uncategorized",
        fullName: "uncategorized",
        legacyId: 1,
      });

      const seeded = await ctx.db.insert("problemTypes", {
        name: "uncategorized",
        fullName: "Uncategorized",
      });

      return { imported, seeded };
    });

    await runAsRoot(t);

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.seeded)).toBeNull();
      const survivor = await ctx.db.get(ids.imported);
      expect(survivor?.legacyId).toBe(1);
    });
  });

  test("keeps the newest row when the legacy ids do not decide it", async () => {
    const t = setupTest();
    await makeRoot(t);

    const ids = await t.run(async (ctx) => {
      // Neither row was imported.
      const oldMisc = await ctx.db.insert("miscConfig", { key: "announcement", value: "old" });
      const newMisc = await ctx.db.insert("miscConfig", { key: "announcement", value: "new" });

      // Both were, by two imports of the same dump.
      const oldPage = await ctx.db.insert("flatPages", {
        url: "/about/",
        title: "old",
        content: "",
        legacyId: 1,
      });

      const newPage = await ctx.db.insert("flatPages", {
        url: "/about/",
        title: "new",
        content: "",
        legacyId: 1,
      });

      return { oldMisc, newMisc, oldPage, newPage };
    });

    const report = await runAsRoot(t);

    expect(report.keys).toEqual(["flatPages//about/", "miscConfig/announcement"]);
    expect(report.rowsDeleted).toBe(2);
    // Neither table is named by anything, so nothing had to be rewritten.
    expect(report.referencesRewritten).toBe(0);

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.oldMisc)).toBeNull();
      expect((await ctx.db.get(ids.newMisc))?.value).toBe("new");
      expect(await ctx.db.get(ids.oldPage)).toBeNull();
      expect((await ctx.db.get(ids.newPage))?.title).toBe("new");
    });
  });

  test("records what it merged on the row it kept", async () => {
    const t = setupTest();
    await makeRoot(t);

    const ids = await t.run(async (ctx) => {
      const seeded = await ctx.db.insert("problemGroups", {
        name: "uncategorized",
        fullName: "Uncategorized",
      });

      const imported = await ctx.db.insert("problemGroups", {
        name: "uncategorized",
        fullName: "uncategorized",
        legacyId: 1,
      });

      return { seeded, imported };
    });

    await runAsRoot(t);

    await t.run(async (ctx) => {
      const revisions = await ctx.db
        .query("revisions")
        .withIndex("by_entity", (q) => q.eq("entityType", "problemGroup").eq("entityId", ids.imported))
        .collect();

      expect(revisions).toHaveLength(1);
      const revision = revisions[0];
      const snapshot = revision?.snapshot;
      const merged = isJsonObject(snapshot) ? snapshot.mergedFrom : undefined;
      expect(isJsonObject(merged) ? merged._id : null).toBe(ids.seeded);
      expect(revision?.reason).toBe("Merged duplicate rows by natural key");
    });
  });
});

describe("admin/dedupe.dedupeNaturalKeys on a clean deployment", () => {
  test("leaves a seeded deployment alone", async () => {
    const t = setupTest();
    await makeRoot(t);
    await t.mutation(internal.seed.run, {});

    const before = await t.run(async (ctx) => ({
      navigation: (await ctx.db.query("navigationBar").collect()).length,
      misc: (await ctx.db.query("miscConfig").collect()).length,
      types: (await ctx.db.query("problemTypes").collect()).length,
    }));

    const report = await runAsRoot(t);

    expect(report).toEqual({
      keys: [],
      keysRepaired: 0,
      rowsDeleted: 0,
      referencesRewritten: 0,
      isDone: true,
    });

    const after = await t.run(async (ctx) => ({
      navigation: (await ctx.db.query("navigationBar").collect()).length,
      misc: (await ctx.db.query("miscConfig").collect()).length,
      types: (await ctx.db.query("problemTypes").collect()).length,
    }));

    expect(after).toEqual(before);
  });

  test("leaves an empty deployment alone", async () => {
    const t = setupTest();
    const report = await t.mutation(internal.admin.dedupe.dedupeNaturalKeysStep, {});
    expect(report).toEqual({
      keys: [],
      keysRepaired: 0,
      rowsDeleted: 0,
      referencesRewritten: 0,
      isDone: true,
    });
  });
});
