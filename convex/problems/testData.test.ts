// @vitest-environment edge-runtime
/**
 * Site-owned test data: publishing an archive, fetching it as a judge, and what
 * the claim says about it.
 *
 * The upload URL an endpoint hands out is a real Convex storage URL that
 * `convex-test` cannot serve, so these tests store the blob directly and post
 * the storage id, which is exactly what a publisher does with the id its PUT
 * returned.
 */

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { plainBytes } from "../lib/bytes";
import { sha256Hex } from "../lib/hash";
import type { JsonValue } from "../lib/json";
import {
  asUser,
  insertJudge,
  insertLanguage,
  insertProblem,
  insertProfile,
  insertSubmission,
} from "../test.fixtures";
import { claimResponse, judgeClient, setupTest, type T } from "../test.setup";

const KEY = "moj_test_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const READ_ONLY_KEY = "moj_test_key_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const OUTSIDER_KEY = "moj_test_key_cccccccccccccccccccccccccccccccc";

const uploadUrlResponse = z.object({ ok: z.boolean(), uploadUrl: z.string() });

function archive(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};

  for (const [name, content] of Object.entries(files)) entries[name] = strToU8(content);

  return zipSync(entries, { level: 0 });
}

async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", plainBytes(bytes));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function store(t: T, bytes: Uint8Array): Promise<Id<"_storage">> {
  return await t.run(
    async (ctx) => await ctx.storage.store(new Blob([plainBytes(bytes)], { type: "application/zip" })),
  );
}

async function blobExists(t: T, storageId: Id<"_storage">): Promise<boolean> {
  return await t.run(async (ctx) => (await ctx.storage.get(storageId)) !== null);
}

async function fixture() {
  const t = setupTest();
  const languageId = await insertLanguage(t, { key: "PY3" });
  const problemId = await insertProblem(t, { code: "aplusb", allowedLanguageIds: [languageId] });

  const setterId = await insertProfile(t, {
    username: "setter",
    isStaff: true,
    permissions: ["judge.edit_own_problem", "judge.edit_all_problem"],
  });

  const outsiderId = await insertProfile(t, { username: "outsider" });

  await t.run(async (ctx) => {
    await ctx.db.insert("apiKeys", {
      keyHash: await sha256Hex(KEY),
      name: "problem repo",
      profileId: setterId,
      scopes: ["problems:write"],
      enabled: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("apiKeys", {
      keyHash: await sha256Hex(READ_ONLY_KEY),
      name: "read only",
      profileId: setterId,
      scopes: ["read"],
      enabled: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("apiKeys", {
      keyHash: await sha256Hex(OUTSIDER_KEY),
      name: "outsider",
      profileId: outsiderId,
      scopes: ["problems:write"],
      enabled: true,
      createdAt: Date.now(),
    });
  });

  return { t, languageId, problemId, setterId, outsiderId };
}

function getData(t: T, code: string, key: string | null = KEY) {
  return t.fetch(`/api/problems/${code}/data`, {
    method: "GET",
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });
}

function postData(t: T, code: string, body: JsonValue, key: string | null = KEY) {
  const headers = new Headers({ "content-type": "application/json" });

  if (key) headers.set("authorization", `Bearer ${key}`);

  return t.fetch(`/api/problems/${code}/data`, { method: "POST", headers, body: JSON.stringify(body) });
}

/** Store an archive and record it, the way a repository publishes one. */
async function publish(t: T, code: string, bytes: Uint8Array, key: string = KEY) {
  const storageId = await store(t, bytes);

  const response = await postData(
    t,
    code,
    {
      storageId,
      hash: await sha256OfBytes(bytes),
      size: bytes.byteLength,
      fileCount: 2,
    },
    key,
  );

  return { storageId, response };
}

async function revisionReasons(t: T, problemId: Id<"problems">): Promise<string[]> {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("revisions")
      .withIndex("by_entity", (q) => q.eq("entityType", "problem").eq("entityId", problemId))
      .collect();

    return rows.map((row) => row.reason);
  });
}

const FIRST = archive({ "init.yml": "archive: tests.zip\n", "tests/1.in": "1 2\n" });

const SECOND = archive({ "init.yml": "archive: tests.zip\n", "tests/1.in": "3 4\n" });

describe("POST /api/problems/:code/data", () => {
  it("publishes a new archive and writes a revision naming the hash", async () => {
    const { t, problemId } = await fixture();

    const before = await getData(t, "aplusb");
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({ ok: true, hash: null });

    const hash = await sha256OfBytes(FIRST);
    const { response } = await publish(t, "aplusb", FIRST);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, hash, changed: true });

    const after = await getData(t, "aplusb");
    expect(await after.json()).toEqual({
      ok: true,
      hash,
      size: FIRST.byteLength,
      fileCount: 2,
      uploadedAt: expect.any(Number),
    });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("problemTestData")
        .withIndex("by_problem", (q) => q.eq("problemId", problemId))
        .unique(),
    );

    expect(row?.hash).toBe(hash);
    expect(row?.fileCount).toBe(2);
    expect(await revisionReasons(t, problemId)).toEqual([
      `setter published test data ${hash} through the problems API.`,
    ]);
  });

  it("republishing the same hash changes nothing and deletes the fresh blob", async () => {
    const { t, problemId } = await fixture();
    const first = await publish(t, "aplusb", FIRST);
    expect(first.response.status).toBe(200);

    const again = await publish(t, "aplusb", FIRST);
    expect(await again.response.json()).toEqual({
      ok: true,
      hash: await sha256OfBytes(FIRST),
      changed: false,
    });

    // The upload that just arrived is gone; the stored copy is untouched.
    expect(await blobExists(t, again.storageId)).toBe(false);
    expect(await blobExists(t, first.storageId)).toBe(true);

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("problemTestData")
        .withIndex("by_problem", (q) => q.eq("problemId", problemId))
        .unique(),
    );

    expect(row?.storageId).toBe(first.storageId);
    expect(await revisionReasons(t, problemId)).toHaveLength(1);
  });

  it("replacing an archive deletes the previous blob and writes a revision", async () => {
    const { t, problemId } = await fixture();
    const first = await publish(t, "aplusb", FIRST);
    const second = await publish(t, "aplusb", SECOND);

    expect(await second.response.json()).toEqual({
      ok: true,
      hash: await sha256OfBytes(SECOND),
      changed: true,
    });
    expect(await blobExists(t, first.storageId)).toBe(false);
    expect(await blobExists(t, second.storageId)).toBe(true);

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("problemTestData")
        .withIndex("by_problem", (q) => q.eq("problemId", problemId))
        .unique(),
    );

    expect(row?.storageId).toBe(second.storageId);
    expect(await revisionReasons(t, problemId)).toHaveLength(2);
  });

  it("refuses an unauthenticated, unscoped or unauthorised key, and an unknown problem", async () => {
    const { t } = await fixture();
    const storageId = await store(t, FIRST);

    const body = {
      storageId,
      hash: await sha256OfBytes(FIRST),
      size: FIRST.byteLength,
      fileCount: 2,
    };

    expect((await postData(t, "aplusb", body, null)).status).toBe(401);
    expect((await postData(t, "aplusb", body, READ_ONLY_KEY)).status).toBe(403);

    const outsider = await postData(t, "aplusb", body, OUTSIDER_KEY);
    expect(outsider.status).toBe(403);
    expect((await outsider.json()).error.message).toMatch(/may not edit/);

    const missing = await postData(t, "nosuch", body);
    expect(missing.status).toBe(404);
    expect((await getData(t, "nosuch")).status).toBe(404);
    expect((await getData(t, "aplusb", null)).status).toBe(401);
  });

  it("refuses a body that is not the documented shape and an upload that is gone", async () => {
    const { t } = await fixture();
    const storageId = await store(t, FIRST);

    const badHash = await postData(t, "aplusb", {
      storageId,
      hash: "not-a-hash",
      size: 1,
      fileCount: 1,
    });

    expect(badHash.status).toBe(422);
    expect((await badHash.json()).error.message).toMatch(/hash/);

    const gone = await postData(t, "aplusb", {
      storageId: "kg2b8not8a8real8storage8id",
      hash: await sha256OfBytes(FIRST),
      size: 1,
      fileCount: 1,
    });

    expect(gone.status).toBe(422);
  });

  it("refuses an invalid zip and a member that escapes the extraction root", async () => {
    const { t } = await fixture();

    const notAZip = new TextEncoder().encode("this is not a zip file at all");
    const junk = await publish(t, "aplusb", notAZip);
    expect(junk.response.status).toBe(422);
    expect((await junk.response.json()).error.message).toMatch(/invalid/i);

    const traversal = archive({ "init.yml": "x\n", "../../etc/passwd": "root\n" });
    const escaped = await publish(t, "aplusb", traversal);
    expect(escaped.response.status).toBe(422);
    expect((await escaped.response.json()).error.message).toMatch(/escapes the extraction root/);

    // Nothing was recorded by either attempt.
    expect(await (await getData(t, "aplusb")).json()).toEqual({ ok: true, hash: null });
  });
});

describe("POST /api/problems/:code/data/upload-url", () => {
  it("hands out an upload URL to a key that may edit the problem", async () => {
    const { t } = await fixture();

    const response = await t.fetch("/api/problems/aplusb/data/upload-url", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}` },
    });

    expect(response.status).toBe(200);
    const body = uploadUrlResponse.parse(await response.json());
    expect(body.ok).toBe(true);
    expect(body.uploadUrl).toMatch(/^https?:\/\//);

    const anonymous = await t.fetch("/api/problems/aplusb/data/upload-url", { method: "POST" });
    expect(anonymous.status).toBe(401);

    const unknown = await t.fetch("/api/problems/nosuch/data/upload-url", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}` },
    });

    expect(unknown.status).toBe(404);
  });
});

describe("GET /judge/data", () => {
  const LOCAL = { name: "local", key: "secret" };
  const BLOCKED = { name: "blocked", key: "secret" };

  function dataUrl(judge: { name: string; key: string }, code: string, hash?: string) {
    const query = new URLSearchParams({ judgeName: judge.name, judgeKey: judge.key, code });

    if (hash) query.set("hash", hash);

    return `/judge/data?${query.toString()}`;
  }

  it("streams the archive back with its hash and size", async () => {
    const { t } = await fixture();
    await insertJudge(t, LOCAL);
    await publish(t, "aplusb", FIRST);

    const response = await t.fetch(dataUrl(LOCAL, "aplusb"), { method: "GET" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("x-moj-data-hash")).toBe(await sha256OfBytes(FIRST));
    expect(response.headers.get("x-moj-data-size")).toBe(String(FIRST.byteLength));

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBe(FIRST.byteLength);
    expect(await sha256OfBytes(bytes)).toBe(await sha256OfBytes(FIRST));
  });

  it("survives an archive far larger than a request body may be", async () => {
    const { t } = await fixture();
    await insertJudge(t, LOCAL);

    // Incompressible, so the stored blob really is this big.
    const big = archive({
      "init.yml": "x\n",
      "tests/1.in": Array.from({ length: 3_000_000 }, (_, i) => String.fromCharCode(33 + (i % 90))).join(""),
    });

    expect(big.byteLength).toBeGreaterThan(3_000_000);

    const storageId = await store(t, big);

    const recorded = await postData(t, "aplusb", {
      storageId,
      hash: await sha256OfBytes(big),
      size: big.byteLength,
      fileCount: 2,
    });

    expect(recorded.status).toBe(200);

    const response = await t.fetch(dataUrl(LOCAL, "aplusb"), { method: "GET" });
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBe(big.byteLength);
    expect(await sha256OfBytes(bytes)).toBe(await sha256OfBytes(big));
  });

  it("answers 404 when the site holds nothing and 409 on a stale hash", async () => {
    const { t } = await fixture();
    await insertJudge(t, LOCAL);

    const nothing = await t.fetch(dataUrl(LOCAL, "aplusb"), { method: "GET" });
    expect(nothing.status).toBe(404);
    expect(await nothing.json()).toEqual({ ok: false, error: "no data" });

    const unknownProblem = await t.fetch(dataUrl(LOCAL, "nosuch"), { method: "GET" });
    expect(unknownProblem.status).toBe(404);

    await publish(t, "aplusb", FIRST);
    const current = await sha256OfBytes(FIRST);
    const stale = await sha256OfBytes(SECOND);

    const matched = await t.fetch(dataUrl(LOCAL, "aplusb", current), { method: "GET" });
    expect(matched.status).toBe(200);

    const mismatched = await t.fetch(dataUrl(LOCAL, "aplusb", stale), { method: "GET" });
    expect(mismatched.status).toBe(409);
    expect(await mismatched.json()).toEqual({ ok: false, error: "hash mismatch" });
  });

  it("answers 403 to an unknown judge, a bad key and a blocked judge", async () => {
    const { t } = await fixture();
    await insertJudge(t, LOCAL);
    await insertJudge(t, { ...BLOCKED, isBlocked: true });
    await publish(t, "aplusb", FIRST);

    const unknown = await t.fetch(dataUrl({ name: "nope", key: "secret" }, "aplusb"), { method: "GET" });
    expect(unknown.status).toBe(403);
    expect((await unknown.json()).ok).toBe(false);

    expect(
      (await t.fetch(dataUrl({ name: LOCAL.name, key: "wrong" }, "aplusb"), { method: "GET" })).status,
    ).toBe(403);
    expect((await t.fetch(dataUrl(BLOCKED, "aplusb"), { method: "GET" })).status).toBe(403);
    expect((await t.fetch("/judge/data?judgeName=local", { method: "GET" })).status).toBe(400);
  });
});

describe("claiming with site-owned data", () => {
  async function queued(t: T, languageId: Id<"languages">, problemId: Id<"problems">) {
    const profileId = await insertProfile(t);

    return await insertSubmission(t, { profileId, problemId, languageId, status: "QU" });
  }

  it("the claim names the archive the site holds", async () => {
    const { t, languageId, problemId } = await fixture();
    await insertJudge(t, { name: "local", runtimeKeys: ["PY3"] });
    const submissionId = await queued(t, languageId, problemId);
    await publish(t, "aplusb", FIRST);

    const body = await claimResponse(await judgeClient(t, "local").claim());
    expect(body.submission?.problemCode).toBe("aplusb");
    expect(body.submission?.problemDataHash).toBe(await sha256OfBytes(FIRST));

    const submission = await t.run(async (ctx) => ctx.db.get(submissionId));
    expect(submission?.status).toBe("P");
  });

  it("a problem with nothing published still claims, with no hash", async () => {
    const { t, languageId, problemId } = await fixture();
    await insertJudge(t, { name: "local", runtimeKeys: ["PY3"] });
    await queued(t, languageId, problemId);

    const body = await claimResponse(await judgeClient(t, "local").claim());
    expect(body.submission?.problemCode).toBe("aplusb");
    expect(body.submission?.problemDataHash).toBeNull();
  });

  it("the executor must still match", async () => {
    const { t, languageId, problemId } = await fixture();
    await insertJudge(t, { name: "local", runtimeKeys: ["CPP17"] });
    await queued(t, languageId, problemId);
    await publish(t, "aplusb", FIRST);

    const response = await judgeClient(t, "local").claim();
    expect((await response.json()).submission).toBeNull();
  });
});

describe("the test data editor", () => {
  it("publishes an uploaded zip through the same storage and reports its state", async () => {
    const { t, problemId } = await fixture();
    const asSetter = asUser(t, "setter");
    const storageId = await store(t, FIRST);

    const published = await asSetter.action(api.problems.data.publishArchive, {
      code: "aplusb",
      zipfile: "aplusb.zip",
      storageId,
    });

    expect(published.changed).toBe(true);
    expect(published.hash).toBe(await sha256OfBytes(FIRST));
    expect(published.files.sort()).toEqual(["init.yml", "tests/1.in"]);

    const page = await asSetter.query(api.problems.data.get, { code: "aplusb" });
    expect(page.published).toEqual({
      hash: await sha256OfBytes(FIRST),
      size: FIRST.byteLength,
      fileCount: 2,
      uploadedAt: expect.any(Number),
      uploadedByUsername: "setter",
    });
    expect(page.data?.zipfile).toBe("aplusb.zip");
    expect(await revisionReasons(t, problemId)).toEqual([
      `setter published test data ${published.hash} through the test data editor.`,
    ]);

    // A second upload of the same bytes is a no-op, as it is over the API.
    const again = await asSetter.action(api.problems.data.publishArchive, {
      code: "aplusb",
      zipfile: "aplusb.zip",
      storageId: await store(t, FIRST),
    });

    expect(again.changed).toBe(false);
    expect(await revisionReasons(t, problemId)).toHaveLength(1);
  });

  it("shows what a repository published, and refuses a traversing archive", async () => {
    const { t } = await fixture();
    await publish(t, "aplusb", FIRST);

    const page = await asUser(t, "setter").query(api.problems.data.get, { code: "aplusb" });
    expect(page.published?.hash).toBe(await sha256OfBytes(FIRST));

    const traversal = await store(t, archive({ "init.yml": "x\n", "../escape.txt": "no\n" }));
    await expect(
      asUser(t, "setter").action(api.problems.data.publishArchive, {
        code: "aplusb",
        zipfile: "evil.zip",
        storageId: traversal,
      }),
    ).rejects.toThrow(/escapes the extraction root/);
    // The refused upload is not left lying in storage.
    expect(await blobExists(t, traversal)).toBe(false);
  });

  it("refuses an anonymous visitor", async () => {
    const { t } = await fixture();
    const storageId = await store(t, FIRST);
    await expect(
      t.action(api.problems.data.publishArchive, {
        code: "aplusb",
        zipfile: "aplusb.zip",
        storageId,
      }),
    ).rejects.toThrow();
  });
});
