// @vitest-environment edge-runtime

/**
 * `/data/prepare/` and the `userExport` job.
 *
 * The zip layout is DMOJ's `prepare_user_data`: `submissions/<id>.<ext>`,
 * `submissions/info.json`, `comments/<id>.txt`, `comments/info.json`, with the
 * same keys inside the two manifests. The rate limit is one prepare a day.
 */

import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { globToRegExp, sortedJson } from "../jobs/users";
import {
  asUser,
  insertLanguage,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSubmission,
} from "../test.fixtures";
import { setupTest, type T } from "../test.setup";

async function seed() {
  const t = setupTest();
  await t.run(async (ctx) => {
    const profileId = await insertProfile(ctx, { username: "downloader" });
    const groupId = await insertProblemGroup(ctx);
    const languageId = await insertLanguage(ctx, { key: "PY3", extension: "py" });

    const aplusb = await insertProblem(ctx, { code: "aplusb", groupId, points: 100 });
    const hello = await insertProblem(ctx, { code: "hello", groupId, points: 50 });

    await insertSubmission(ctx, {
      profileId,
      problemId: aplusb,
      languageId,
      points: 100,
      result: "AC",
      casePoints: 1,
      caseTotal: 1,
      time: 0.1,
      memory: 1024,
      legacyId: 101,
      date: Date.UTC(2025, 0, 1),
      source: "print(sum(map(int, input().split())))",
    });

    await insertSubmission(ctx, {
      profileId,
      problemId: hello,
      languageId,
      points: 0,
      result: "WA",
      casePoints: 1,
      caseTotal: 1,
      time: 0.1,
      memory: 1024,
      legacyId: 102,
      date: Date.UTC(2025, 0, 2),
      source: "print('hi')",
    });

    await ctx.db.insert("comments", {
      targetType: "problem",
      targetKey: "aplusb",
      authorProfileId: profileId,
      time: Date.UTC(2025, 0, 3),
      score: 4,
      body: "Nice problem.",
      hidden: false,
      revisions: 1,
      legacyId: 201,
    });
  });
  return t;
}

async function runExport(
  t: T,
  options: {
    submissionDownload: boolean;
    commentDownload: boolean;
    submissionProblemGlob?: string;
    submissionResults?: string[];
  },
) {
  const jobId = (await asUser(t, "downloader").mutation(api.profiles.dataExport.prepare, {
    options,
  })) as Id<"jobs">;
  await t.finishAllScheduledFunctions(async () => {});
  return jobId;
}

async function readZip(t: T, jobId: Id<"jobs">) {
  const job = await t.run(async (ctx) => await ctx.db.get(jobId));
  if (!job) throw new Error("the job is gone");
  const storageId = (job.result as { storageId: Id<"_storage"> }).storageId;
  const buffer = await t.run(async (ctx) => {
    const blob = await ctx.storage.get(storageId);
    if (!blob) throw new Error("the export is not in storage");
    return await blob.arrayBuffer();
  });
  return unzipSync(new Uint8Array(buffer));
}

describe("the zip layout", () => {
  test("submissions and comments land where DMOJ puts them", async () => {
    const t = await seed();
    const jobId = await runExport(t, { submissionDownload: true, commentDownload: true });

    const job = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(job?.status).toBe("done");
    expect(job?.result).toMatchObject({
      submissionCount: 2,
      commentCount: 1,
      name: "downloader-data.zip",
    });

    const files = await readZip(t, jobId);
    expect(Object.keys(files).sort()).toEqual([
      "comments/201.txt",
      "comments/info.json",
      "submissions/101.py",
      "submissions/102.py",
      "submissions/info.json",
    ]);

    expect(strFromU8(files["submissions/101.py"] as Uint8Array)).toBe(
      "print(sum(map(int, input().split())))",
    );
    expect(strFromU8(files["comments/201.txt"] as Uint8Array)).toBe("Nice problem.");

    const info = JSON.parse(strFromU8(files["submissions/info.json"] as Uint8Array));
    expect(info["101"]).toEqual({
      problem: "aplusb",
      date: "2025-01-01T00:00:00.000Z",
      time: 0.1,
      memory: 1024,
      language: "PY3",
      status: "D",
      result: "AC",
      case_points: 1,
      case_total: 1,
    });

    const comments = JSON.parse(strFromU8(files["comments/info.json"] as Uint8Array));
    expect(comments["201"]).toEqual({
      date: "2025-01-03T00:00:00.000Z",
      related_object: "problem",
      page: "aplusb",
      score: 4,
    });
  });

  test("comments only means no submissions directory", async () => {
    const t = await seed();
    const jobId = await runExport(t, { submissionDownload: false, commentDownload: true });
    const files = await readZip(t, jobId);
    expect(Object.keys(files)).toEqual(["comments/201.txt", "comments/info.json"]);
  });

  test("the problem glob filters submissions", async () => {
    const t = await seed();
    const jobId = await runExport(t, {
      submissionDownload: true,
      commentDownload: false,
      submissionProblemGlob: "hel*",
    });
    const files = await readZip(t, jobId);
    expect(Object.keys(files).sort()).toEqual(["submissions/102.py", "submissions/info.json"]);
  });

  test("the result filter keeps only those verdicts", async () => {
    const t = await seed();
    const jobId = await runExport(t, {
      submissionDownload: true,
      commentDownload: false,
      submissionResults: ["AC"],
    });
    const files = await readZip(t, jobId);
    expect(Object.keys(files).sort()).toEqual(["submissions/101.py", "submissions/info.json"]);
  });
});

describe("prepareDataExport", () => {
  test("at least one thing has to be selected", async () => {
    const t = await seed();
    await expect(
      asUser(t, "downloader").mutation(api.profiles.dataExport.prepare, {
        options: { submissionDownload: false, commentDownload: false },
      }),
    ).rejects.toThrow(/at least one thing/);
  });

  test("one prepare a day", async () => {
    const t = await seed();
    await runExport(t, { submissionDownload: true, commentDownload: false });

    await expect(
      asUser(t, "downloader").mutation(api.profiles.dataExport.prepare, {
        options: { submissionDownload: true, commentDownload: false },
      }),
    ).rejects.toThrow(/once a day/);

    const status = await asUser(t, "downloader").query(api.profiles.dataExport.status, {});
    expect(status.canPrepare).toBe(false);
    expect(status.msUntilCanPrepare).toBeGreaterThan(0);
    expect(status.rateLimitMs).toBe(24 * 60 * 60 * 1000);
    expect(status.download?.name).toBe("downloader-data.zip");
    expect(status.job?.status).toBe("done");
  });

  test("a muted user cannot prepare data", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "toad", mute: true });
    });
    await expect(
      asUser(t, "toad").mutation(api.profiles.dataExport.prepare, {
        options: { submissionDownload: true, commentDownload: false },
      }),
    ).rejects.toThrow(/silent, little toad/);
  });

  test("an export is recorded as an upload", async () => {
    const t = await seed();
    await runExport(t, { submissionDownload: true, commentDownload: true });
    const uploads = await t.run(async (ctx) => await ctx.db.query("uploads").collect());
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({ kind: "export", name: "downloader-data.zip" });
  });
});

describe("helpers", () => {
  test("the glob translation compresses runs of stars", () => {
    expect(globToRegExp("***").source).toBe("^.*$");
    expect(globToRegExp("dmopc*").test("dmopc19c1p1")).toBe(true);
    expect(globToRegExp("dmopc*").test("ccc19s1")).toBe(false);
    expect(globToRegExp("a?c").test("abc")).toBe(true);
    expect(globToRegExp("a.c").test("abc")).toBe(false);
    expect(globToRegExp("a.c").test("a.c")).toBe(true);
  });

  test("the manifests are written with sorted keys and four-space indent", () => {
    const json = sortedJson({ b: 2, a: 1 });
    expect(json).toBe('{\n    "a": 1,\n    "b": 2\n}');
  });
});
