import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { seedProblem, seedProfile, seedTaxonomy } from "./problemsFixtures";

const modules = import.meta.glob("../**/*.ts");

const KEY = "moj_test_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WEAK_KEY = "moj_test_key_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The API-key fallback path: `AUTH_URL` is unset here, so `authenticate` looks
 * the presented key up in the `apiKeys` table. See docs/SPEC_CHANGES.md.
 */
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const { groupId, languageId, cppId } = await seedTaxonomy(ctx);
    const setter = await seedProfile(ctx, {
      username: "setter",
      isStaff: true,
      permissions: ["judge.edit_own_problem", "judge.edit_all_problem", "judge.change_public_visibility"],
    });
    const weak = await seedProfile(ctx, { username: "weak" });
    await seedProfile(ctx, { username: "coauthor" });

    await ctx.db.insert("apiKeys", {
      keyHash: await sha256Hex(KEY),
      name: "problem repo",
      profileId: setter,
      scopes: ["problems:write"],
      enabled: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("apiKeys", {
      keyHash: await sha256Hex(WEAK_KEY),
      name: "read only",
      profileId: weak,
      scopes: ["problems:read"],
      enabled: true,
      createdAt: Date.now(),
    });
    return { groupId, languageId, cppId, setter };
  });
  return { t, ids };
}

function put(
  t: Awaited<ReturnType<typeof setup>>["t"],
  code: string,
  body: unknown,
  key: string | null = KEY,
) {
  return t.fetch(`/api/problems/${code}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/problems/:code authentication", () => {
  test("401 without a key, 401 with a bad one", async () => {
    const { t } = await setup();

    const anonymous = await put(t, "aplusb", { name: "A" }, null);
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({
      error: { code: "unauthenticated", message: "A valid API key is required." },
    });

    const bogus = await put(t, "aplusb", { name: "A" }, "not-a-key");
    expect(bogus.status).toBe(401);
  });

  test("403 when the key lacks the problems:write scope", async () => {
    const { t } = await setup();
    const response = await put(t, "aplusb", { name: "A" }, WEAK_KEY);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toContain("problems:write");
  });

  test("a disabled key is rejected", async () => {
    const { t } = await setup();
    const keyHash = await sha256Hex(KEY);
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("apiKeys")
        .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
        .unique();
      if (row) await ctx.db.patch(row._id, { enabled: false });
    });
    expect((await put(t, "aplusb", { name: "A" })).status).toBe(401);
  });

  test("an expired key is rejected", async () => {
    const { t } = await setup();
    const keyHash = await sha256Hex(KEY);
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("apiKeys")
        .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
        .unique();
      if (row) await ctx.db.patch(row._id, { expiresAt: Date.now() - 1000 });
    });
    expect((await put(t, "aplusb", { name: "A" })).status).toBe(401);
  });
});

describe("PUT /api/problems/:code create", () => {
  test("creates with the uploader's defaults", async () => {
    const { t } = await setup();
    const response = await put(t, "aplusb", {
      name: "A plus B",
      statement: "Read two integers.\n",
    });
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(body.problem).toMatchObject({
      code: "aplusb",
      name: "A plus B",
      points: 100,
      timeLimit: 1,
      memoryLimit: 1_000_000,
      shortCircuit: true,
      isPublic: false,
      group: "uncategorized",
      types: ["uncategorized"],
    });
    // checkAll: every language is allowed on create.
    expect(body.problem.allowedLanguages.sort()).toEqual(["CPP20", "PY3"]);

    await t.run(async (ctx) => {
      const problem = await ctx.db
        .query("problems")
        .withIndex("by_code", (q) => q.eq("code", "aplusb"))
        .unique();
      // The statement is stored verbatim.
      expect(problem?.description).toBe("Read two integers.\n");
      // The publish date defaults to now.
      expect(problem?.date).toBeGreaterThan(Date.now() - 60_000);
    });
  });

  test("422 without a name, and for a bad code", async () => {
    const { t } = await setup();

    const nameless = await put(t, "aplusb", { statement: "Hello." });
    expect(nameless.status).toBe(422);
    expect((await nameless.json()).error.message).toContain("requires a name");

    const badCode = await t.fetch("/api/problems/NotACode", {
      method: "PUT",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(badCode.status).toBe(404);
  });

  test("422 for a body that is not valid JSON, or carries unknown keys", async () => {
    const { t } = await setup();

    const notJson = await t.fetch("/api/problems/aplusb", {
      method: "PUT",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: "{",
    });
    expect(notJson.status).toBe(422);

    const unknown = await put(t, "aplusb", { name: "A", surprise: true });
    expect(unknown.status).toBe(422);
  });

  test("honours group, types and publishOn on create", async () => {
    const { t } = await setup();
    const publishOn = Date.parse("2024-03-01T00:00:00Z");
    const response = await put(t, "graphy", {
      name: "Graphy",
      statement: "Graph things.",
      group: "olympiad",
      types: ["graphs", "trees"],
      publishOn,
    });
    const body = await response.json();
    expect(body.problem.group).toBe("olympiad");
    expect(body.problem.types.sort()).toEqual(["graphs", "trees"]);
    expect(body.problem.date).toBe(publishOn);
  });

  test("writes the python language limits it is given", async () => {
    const { t } = await setup();
    const response = await put(t, "aplusb", {
      name: "A plus B",
      statement: "Hello.",
      timeLimit: 1,
      memoryLimit: 512_000,
      languageLimits: {
        PY3: { timeLimit: 3, memoryLimit: 512_000 },
      },
    });
    const body = await response.json();
    expect(body.problem.languageLimits).toEqual({
      PY3: { timeLimit: 3, memoryLimit: 512_000 },
    });
  });
});

describe("PUT /api/problems/:code partial update", () => {
  let harness: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    harness = await setup();
    await harness.t.run(async (ctx) => {
      const group = await ctx.db
        .query("problemGroups")
        .withIndex("by_name", (q) => q.eq("name", "uncategorized"))
        .unique();
      const setter = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "setter"))
        .unique();
      await seedProblem(ctx, {
        code: "aplusb",
        name: "A plus B",
        description: "Original statement.",
        groupId: group?._id as Id<"problemGroups">,
        points: 42,
        authorProfileIds: [setter?._id as Id<"profiles">],
      });
    });
  });

  test("absent keys leave the field alone", async () => {
    const response = await put(harness.t, "aplusb", { statement: "New statement." });
    const body = await response.json();
    expect(body.created).toBe(false);
    expect(body.problem.name).toBe("A plus B");
    expect(body.problem.points).toBe(42);

    await harness.t.run(async (ctx) => {
      const problem = await ctx.db
        .query("problems")
        .withIndex("by_code", (q) => q.eq("code", "aplusb"))
        .unique();
      expect(problem?.description).toBe("New statement.");
    });
  });

  test("an empty authors list means unchanged, a non-empty one replaces", async () => {
    const unchanged = await put(harness.t, "aplusb", { authors: [] });
    expect((await unchanged.json()).problem.authors).toEqual(["setter"]);

    const replaced = await put(harness.t, "aplusb", { authors: ["coauthor"] });
    expect((await replaced.json()).problem.authors).toEqual(["coauthor"]);
  });

  test("group, types and publishOn are create-only and ignored on update", async () => {
    const before = await harness.t.run(async (ctx) =>
      ctx.db
        .query("problems")
        .withIndex("by_code", (q) => q.eq("code", "aplusb"))
        .unique(),
    );

    const response = await put(harness.t, "aplusb", {
      group: "olympiad",
      types: ["graphs"],
      publishOn: 1,
      checkAll: true,
    });
    const body = await response.json();
    expect(body.problem.group).toBe("uncategorized");
    expect(body.problem.types).toEqual([]);
    expect(body.problem.date).toBe(before?.date);
  });

  test("names a user it could not find without failing the write", async () => {
    const response = await put(harness.t, "aplusb", {
      statement: "Still fine.",
      authors: ["ghost"],
    });
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.warnings).toEqual(["No such user: ghost"]);
    expect(body.problem.authors).toEqual([]);
  });

  test("the editorial lands as a public solution", async () => {
    const response = await put(harness.t, "aplusb", {
      editorial: { content: "Add the two numbers." },
    });
    expect((await response.json()).problem.hasEditorial).toBe(true);

    await harness.t.run(async (ctx) => {
      const solution = await ctx.db.query("solutions").first();
      expect(solution?.content).toBe("Add the two numbers.");
      expect(solution?.isPublic).toBe(true);
      expect(solution?.publishOn).toBeLessThanOrEqual(Date.now());
    });
  });

  test("an empty editorial leaves the existing one alone", async () => {
    await put(harness.t, "aplusb", { editorial: { content: "First draft." } });
    await put(harness.t, "aplusb", { editorial: { content: "   " } });
    await harness.t.run(async (ctx) => {
      const solution = await ctx.db.query("solutions").first();
      expect(solution?.content).toBe("First draft.");
    });
  });

  test("every write leaves a revision behind", async () => {
    await put(harness.t, "aplusb", { statement: "One." });
    await put(harness.t, "aplusb", { statement: "Two." });
    const revisions = await harness.t.run(async (ctx) => ctx.db.query("revisions").collect());
    expect(revisions).toHaveLength(2);
    expect(revisions[0]?.reason).toBe("Updated through the problems API.");
    expect(revisions[1]?.snapshot.description).toBe("Two.");
  });

  test("403 when the key's owner may not edit the problem", async () => {
    // Give the read-only key the write scope: the scope gets it past the door,
    // and Problem.is_editable_by stops it at the problem.
    const weakHash = await sha256Hex(WEAK_KEY);
    await harness.t.run(async (ctx) => {
      const row = await ctx.db
        .query("apiKeys")
        .withIndex("by_keyHash", (q) => q.eq("keyHash", weakHash))
        .unique();
      if (row) await ctx.db.patch(row._id, { scopes: ["problems:write"] });
    });

    const response = await put(harness.t, "aplusb", { statement: "Mine now." }, WEAK_KEY);
    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toContain("may not edit");
  });

  test("403 when making a problem public without the permission", async () => {
    await harness.t.run(async (ctx) => {
      const setter = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "setter"))
        .unique();
      if (setter) {
        await ctx.db.patch(setter._id, {
          permissions: ["judge.edit_own_problem", "judge.edit_all_problem"],
        });
      }
    });
    const response = await put(harness.t, "aplusb", { isPublic: true });
    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toContain("change_public_visibility");
  });

  test("DELETE is not supported", async () => {
    const response = await harness.t.fetch("/api/problems/aplusb", {
      method: "DELETE",
      headers: { authorization: `Bearer ${KEY}` },
    });
    expect(response.status).toBe(405);
  });
});

describe("POST /api/problems/:code/images", () => {
  test("stores the image and answers with a link", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      const group = await ctx.db
        .query("problemGroups")
        .withIndex("by_name", (q) => q.eq("name", "uncategorized"))
        .unique();
      await seedProblem(ctx, { code: "aplusb", groupId: group?._id as Id<"problemGroups"> });
    });

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }), "d.png");

    const response = await t.fetch("/api/problems/aplusb/images", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}` },
      body: form,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe(200);
    expect(body.link).toContain("/api/problems/images/");

    // The same bytes come back with the same link rather than a second copy.
    const again = new FormData();
    again.append("file", new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }), "d.png");
    const second = await t.fetch("/api/problems/aplusb/images", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}` },
      body: again,
    });
    expect((await second.json()).link).toBe(body.link);

    const uploads = await t.run(async (ctx) => ctx.db.query("uploads").collect());
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.kind).toBe("statement-image");
  });

  test("404 for a problem that does not exist, 401 without a key", async () => {
    const { t } = await setup();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([1])], { type: "image/png" }), "d.png");

    const missing = await t.fetch("/api/problems/nope/images", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}` },
      body: form,
    });
    expect(missing.status).toBe(404);

    const form2 = new FormData();
    form2.append("file", new Blob([new Uint8Array([1])], { type: "image/png" }), "d.png");
    const anonymous = await t.fetch("/api/problems/nope/images", { method: "POST", body: form2 });
    expect(anonymous.status).toBe(401);
  });
});
