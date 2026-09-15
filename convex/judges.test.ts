// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/hash";
import {
  judgeRow,
  languageRow,
  problemRow,
  profileRow,
  siteSettingsRow,
  solvedSubmissionRow,
} from "./lib/testing";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("siteSettings", siteSettingsRow());
    await ctx.db.insert("profiles", profileRow("plain"));
    await ctx.db.insert("profiles", profileRow("staffy", { isStaff: true }));
    const admin = await ctx.db.insert(
      "profiles",
      profileRow("judgeadmin", { permissions: ["judge.change_judge"], isStaff: true }),
    );
    return { admin };
  });
  return { t, ids };
}

describe("judge keys", () => {
  test("creation returns the key once and stores only its hash", async () => {
    const { t } = await seed();
    const created = await t
      .withIdentity({ subject: "user-judgeadmin" })
      .mutation(api.admin.judges.create, { name: "judge.example.com", description: "Main judge" });

    expect(created.authKey).toHaveLength(64);
    expect(created.authKey).toMatch(/^[A-Za-z0-9]+$/);

    const stored = await t.run(async (ctx) => await ctx.db.get(created.id));
    expect(stored?.authKeyHash).toBe(await sha256Hex(created.authKey));
    expect(stored?.authKeyHash).toHaveLength(64);
    expect(JSON.stringify(stored)).not.toContain(created.authKey);
  });

  test("two judges never get the same key", async () => {
    const { t } = await seed();
    const admin = t.withIdentity({ subject: "user-judgeadmin" });
    const first = await admin.mutation(api.admin.judges.create, { name: "a" });
    const second = await admin.mutation(api.admin.judges.create, { name: "b" });
    expect(first.authKey).not.toBe(second.authKey);
  });

  test("regenerating replaces the stored hash", async () => {
    const { t } = await seed();
    const admin = t.withIdentity({ subject: "user-judgeadmin" });
    const created = await admin.mutation(api.admin.judges.create, { name: "a" });
    const before = await t.run(async (ctx) => (await ctx.db.get(created.id))?.authKeyHash);

    const { authKey } = await admin.mutation(api.admin.judges.regenerateKey, { id: created.id });
    const after = await t.run(async (ctx) => (await ctx.db.get(created.id))?.authKeyHash);

    expect(after).not.toBe(before);
    expect(after).toBe(await sha256Hex(authKey));
  });

  test("duplicate names are refused and the permission is enforced", async () => {
    const { t } = await seed();
    const admin = t.withIdentity({ subject: "user-judgeadmin" });
    await admin.mutation(api.admin.judges.create, { name: "a" });
    await expect(admin.mutation(api.admin.judges.create, { name: "a" })).rejects.toThrow(/already exists/);
    await expect(
      t.withIdentity({ subject: "user-staffy" }).mutation(api.admin.judges.create, { name: "c" }),
    ).rejects.toThrow();
  });

  test("disconnect records a flag the judge picks up on its heartbeat", async () => {
    const { t } = await seed();
    const admin = t.withIdentity({ subject: "user-judgeadmin" });
    const created = await admin.mutation(api.admin.judges.create, { name: "a" });

    await admin.mutation(api.admin.judges.disconnect, { id: created.id, force: true });
    let row = await t.run(async (ctx) => await ctx.db.get(created.id));
    expect(row?.disconnectRequestedAt).toBeTypeOf("number");
    expect(row?.disconnectForce).toBe(true);

    await admin.mutation(api.admin.judges.clearDisconnect, { id: created.id });
    row = await t.run(async (ctx) => await ctx.db.get(created.id));
    expect(row?.disconnectRequestedAt).toBeUndefined();
  });
});

describe("status page", () => {
  test("offline judges are staff-only", async () => {
    const { t } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert(
        "judges",
        judgeRow("online.example.com", "hash-a", { online: true, ping: 0.021, load: 0.5 }),
      );
      await ctx.db.insert("judges", judgeRow("offline.example.com", "hash-b"));
    });

    const anonymous = await t.query(api.status.page, {});
    expect(anonymous.judges.map((judge) => judge.name)).toEqual(["online.example.com"]);
    expect(anonymous.seeAllJudges).toBe(false);
    expect(anonymous.judges[0]?.pingMs).toBeCloseTo(21);

    const staff = await t.withIdentity({ subject: "user-staffy" }).query(api.status.page, {});
    expect(staff.judges.map((judge) => judge.name)).toEqual(["online.example.com", "offline.example.com"]);
    expect(staff.seeAllJudges).toBe(true);
  });

  test("runtime versions group by judge and language", async () => {
    const { t } = await seed();
    await t.run(async (ctx) => {
      const judgeId = await ctx.db.insert("judges", judgeRow("j.example.com", "hash", { online: true }));
      const python = await ctx.db.insert("languages", languageRow("PY3", "Python 3"));
      const cpp = await ctx.db.insert("languages", languageRow("CPP17", "C++17"));
      await ctx.db.insert("runtimeVersions", {
        languageId: python,
        judgeId,
        name: "cpython",
        version: "3.12.0",
        priority: 0,
      });
      await ctx.db.insert("runtimeVersions", {
        languageId: cpp,
        judgeId,
        name: "g++",
        version: "13.2.0",
        priority: 0,
      });
    });

    const data = await t.query(api.judges.runtimeVersionData, {});
    expect(Object.keys(data)).toEqual(["j.example.com"]);
    const entries = data["j.example.com"];
    expect(entries?.map((entry) => entry.key)).toEqual(["CPP17", "PY3"]);
    expect(entries?.[1]?.runtime).toEqual([{ name: "cpython", version: "3.12.0" }]);

    const runtimes = await t.query(api.status.runtimes, {});
    expect(runtimes.map((entry) => entry.key)).toEqual(["CPP17", "PY3"]);

    const matrix = await t.query(api.status.matrix, {});
    expect(matrix.judges).toEqual(["j.example.com"]);
    expect(matrix.matrix["j.example.com"]?.PY3?.isLatest).toBe(true);
  });
});

describe("languages", () => {
  test("copy_language mirrors the allowed problems and the limits", async () => {
    const { t } = await seed();
    const ids = await t.run(async (ctx) => {
      const admin = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "judgeadmin"))
        .unique();
      if (admin) await ctx.db.patch(admin._id, { permissions: ["judge.change_language"] });

      const groupId = await ctx.db.insert("problemGroups", { name: "misc", fullName: "Misc" });
      const source = await ctx.db.insert("languages", languageRow("PY3", "Python 3"));
      const target = await ctx.db.insert("languages", languageRow("PYPY3", "PyPy 3"));
      const problemId = await ctx.db.insert("problems", problemRow("alpha", groupId));
      await ctx.db.patch(problemId, { allowedLanguageIds: [source] });
      await ctx.db.insert("languageLimits", {
        problemId,
        languageId: source,
        timeLimit: 3,
        memoryLimit: 131072,
      });
      return { source, target, problemId };
    });

    const result = await t
      .withIdentity({ subject: "user-judgeadmin" })
      .mutation(api.admin.languages.copyLanguage, { sourceKey: "PY3", targetKey: "PYPY3" });
    expect(result).toEqual({ problems: 1, limits: 1 });

    const problem = await t.run(async (ctx) => await ctx.db.get(ids.problemId));
    expect(problem?.allowedLanguageIds).toContain(ids.target as Id<"languages">);

    const limits = await t.run(async (ctx) => await ctx.db.query("languageLimits").collect());
    const copied = limits.find((row) => row.languageId === ids.target);
    expect(copied?.timeLimit).toBe(3);
    expect(copied?.memoryLimit).toBe(131072);
  });

  test("an unknown language key is refused", async () => {
    const { t } = await seed();
    await t.run(async (ctx) => {
      const admin = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "judgeadmin"))
        .unique();
      if (admin) await ctx.db.patch(admin._id, { permissions: ["judge.change_language"] });
      await ctx.db.insert("languages", languageRow("PY3", "Python 3"));
    });
    await expect(
      t.withIdentity({ subject: "user-judgeadmin" }).mutation(api.admin.languages.copyLanguage, {
        sourceKey: "PY3",
        targetKey: "NOPE",
      }),
    ).rejects.toThrow(/Invalid target language/);
  });
});

describe("language statistics", () => {
  test("the charts count submissions and AC per language", async () => {
    const { t } = await seed();
    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("problemGroups", { name: "misc", fullName: "Misc" });
      const problemId = await ctx.db.insert("problems", problemRow("alpha", groupId));
      const python = await ctx.db.insert("languages", languageRow("PY3", "Python 3"));
      const cpp = await ctx.db.insert("languages", languageRow("CPP17", "C++17"));
      const profileId = await ctx.db.insert("profiles", profileRow("submitter"));

      await ctx.db.insert("submissions", solvedSubmissionRow(profileId, problemId, python));
      await ctx.db.insert("submissions", solvedSubmissionRow(profileId, problemId, python));
      await ctx.db.insert("submissions", {
        ...solvedSubmissionRow(profileId, problemId, cpp),
        result: "WA" as const,
        casePoints: 0,
        points: 0,
      });
    });

    await t.mutation(internal.stats.refresh, {});
    const stats = await t.query(api.stats.language, {});

    expect(stats.languageData.labels).toEqual(["Python 3", "C++17", "Other"]);
    expect(stats.languageData.datasets[0]?.data).toEqual([2, 1, 0]);
    expect(stats.acLanguageData.labels).toEqual(["Python 3", "Other"]);
    expect(stats.acLanguageData.datasets[0]?.data).toEqual([2, 0]);
    expect(stats.statusData.labels).toEqual(["Accepted", "Wrong Answer"]);
    expect(stats.statusData.datasets[0]?.data).toEqual([2, 1]);

    // Ordered by volume ascending, so C++17 (1 submission) comes first.
    expect(stats.acRate.labels).toEqual(["C++17", "Python 3"]);
    expect(stats.acRate.datasets[0]?.data).toEqual([0, 100]);
  });
});
