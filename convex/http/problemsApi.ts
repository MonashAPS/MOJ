/**
 * The problems API (SPEC section 8).
 *
 *   PUT  /api/problems/:code           create or update a problem
 *   POST /api/problems/:code/images    upload a statement image
 *   GET  /api/problems/images/:id      serve one back
 *
 * This replaces the club's Playwright uploader
 * (mcpc-problems/frontend-automation/scripts/create-problem.mjs), which drove
 * the Django admin form with a browser. The partial-update semantics are that
 * script's, with the one deviation SPEC section 8 asks for: `authors: []` means
 * "unchanged" rather than "clear the author list", because almost every
 * config.json in the club's repo carries an empty authors array and a literal
 * reading would wipe the authors on every push.
 *
 * Authentication: `Authorization: Bearer <key>` with the `problems:write`
 * scope. Keys are verified against Better Auth's api-key plugin when `AUTH_URL`
 * is set, and against the `apiKeys` table otherwise. See docs/SPEC_CHANGES.md.
 */

import { hasPerm, problemIsEditableBy } from "@moj/core";
import {
  API_ERROR_STATUS,
  type ApiErrorCode,
  MAX_IMAGE_BYTES,
  PROBLEMS_WRITE_SCOPE,
  problemUpsertInput,
} from "@moj/protocol";
import type { HttpRouter } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  type ActionCtx,
  httpAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { groupIdByName, typeIdsByName, writeRevision } from "../admin/problems";
import { problemByCode, toCoreProblem } from "../problems";

/* -------------------------------------------------------------------------- */
/* Responses                                                                  */
/* -------------------------------------------------------------------------- */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" } as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function errorResponse(code: ApiErrorCode, message: string): Response {
  return jsonResponse({ error: { code, message } }, API_ERROR_STATUS[code]);
}

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

export type ApiKeyIdentity = {
  profileId: Id<"profiles">;
  username: string;
  scopes: string[];
  source: "better-auth" | "table";
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Better Auth's api-key plugin exposes `POST /api/auth/api-key/verify`, which
 * answers `{ valid, error, key }`. The key row carries the Better Auth user id,
 * which `profiles.by_userId` maps to a profile.
 */
async function verifyWithBetterAuth(
  key: string,
): Promise<{ userId: string; scopes: string[] } | null | "unreachable"> {
  const base = process.env.AUTH_URL;
  if (!base) return "unreachable";

  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/+$/, "")}/api/auth/api-key/verify`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ key }),
    });
  } catch {
    return "unreachable";
  }
  if (response.status >= 500) return "unreachable";
  if (!response.ok) return null;

  let body: {
    valid?: boolean;
    key?: { userId?: string; permissions?: Record<string, string[]> | null; enabled?: boolean };
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return null;
  }
  if (!body.valid || !body.key?.userId) return null;
  if (body.key.enabled === false) return null;

  // Better Auth models scopes as `{resource: [action, ...]}`; the wire scope
  // `problems:write` is `{problems: ["write"]}`.
  const scopes: string[] = [];
  for (const [resource, actions] of Object.entries(body.key.permissions ?? {})) {
    for (const action of actions ?? []) scopes.push(`${resource}:${action}`);
  }
  return { userId: body.key.userId, scopes };
}

export const profileForUserId = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return profile ? { profileId: profile._id, username: profile.username } : null;
  },
});

/** The fallback: a local `apiKeys` row keyed by sha256 of the presented key. */
export const profileForKeyHash = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    const row = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (!row?.enabled) return null;
    if (row.expiresAt !== undefined && row.expiresAt <= Date.now()) return null;
    const profile = await ctx.db.get(row.profileId);
    if (!profile) return null;
    return { profileId: profile._id, username: profile.username, scopes: row.scopes };
  },
});

export const touchApiKey = internalMutation({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    const row = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (row) await ctx.db.patch(row._id, { lastUsedAt: Date.now() });
  },
});

async function authenticate(ctx: ActionCtx, request: Request): Promise<ApiKeyIdentity | null> {
  const key = bearerToken(request);
  if (!key) return null;

  const verified = await verifyWithBetterAuth(key);
  if (verified && verified !== "unreachable") {
    const profile = await ctx.runQuery(internal.http.problemsApi.profileForUserId, {
      userId: verified.userId,
    });
    if (!profile) return null;
    return { ...profile, scopes: verified.scopes, source: "better-auth" };
  }
  if (verified === null) return null;

  const keyHash = await sha256Hex(key);
  const row = await ctx.runQuery(internal.http.problemsApi.profileForKeyHash, { keyHash });
  if (!row) return null;
  await ctx.runMutation(internal.http.problemsApi.touchApiKey, { keyHash });
  return { ...row, source: "table" };
}

/* -------------------------------------------------------------------------- */
/* The upsert                                                                 */
/* -------------------------------------------------------------------------- */

const CODE_PATTERN = /^[a-z.0-9]+$/;

const languageLimitValidator = v.object({
  timeLimit: v.number(),
  memoryLimit: v.number(),
});

export const upsertProblem = internalMutation({
  args: {
    code: v.string(),
    actorProfileId: v.id("profiles"),
    body: v.object({
      name: v.optional(v.string()),
      statement: v.optional(v.string()),
      editorial: v.optional(
        v.union(
          v.null(),
          v.object({
            content: v.string(),
            isPublic: v.optional(v.boolean()),
            publishOn: v.optional(v.number()),
          }),
        ),
      ),
      points: v.optional(v.number()),
      timeLimit: v.optional(v.number()),
      memoryLimit: v.optional(v.number()),
      shortCircuit: v.optional(v.boolean()),
      partial: v.optional(v.boolean()),
      isPublic: v.optional(v.boolean()),
      authors: v.optional(v.array(v.string())),
      testers: v.optional(v.array(v.string())),
      curators: v.optional(v.array(v.string())),
      summary: v.optional(v.string()),
      group: v.optional(v.string()),
      types: v.optional(v.array(v.string())),
      publishOn: v.optional(v.number()),
      checkAll: v.optional(v.boolean()),
      languageLimits: v.optional(v.record(v.string(), languageLimitValidator)),
    }),
  },
  handler: async (ctx, { code, actorProfileId, body }) => {
    const actor = await ctx.db.get(actorProfileId);
    if (!actor) {
      return { status: "forbidden" as const, message: "The API key has no profile." };
    }
    const core = {
      id: actor._id,
      username: actor.username,
      isStaff: actor.isStaff,
      isSuperuser: actor.isSuperuser,
      permissions: actor.permissions,
    };

    const existing = await problemByCode(ctx, code);
    const created = existing === null;
    const warnings: string[] = [];

    if (created) {
      if (!CODE_PATTERN.test(code) || code.length > 20) {
        return {
          status: "invalid" as const,
          message: "Problem codes may only contain lowercase letters, digits and dots.",
        };
      }
      if (!body.name?.trim()) {
        return { status: "invalid" as const, message: "A new problem requires a name." };
      }
      if (!hasPerm(core, "judge.edit_own_problem")) {
        return { status: "forbidden" as const, message: "Missing permission judge.edit_own_problem." };
      }
    } else if (!problemIsEditableBy(toCoreProblem(existing), core)) {
      return { status: "forbidden" as const, message: "You may not edit this problem." };
    }

    if (body.isPublic === true && !hasPerm(core, "judge.change_public_visibility")) {
      return {
        status: "forbidden" as const,
        message: "Missing permission judge.change_public_visibility.",
      };
    }

    const resolveProfiles = async (usernames: readonly string[]) => {
      const ids: Id<"profiles">[] = [];
      for (const username of usernames) {
        const row = await ctx.db
          .query("profiles")
          .withIndex("by_username", (q) => q.eq("username", username))
          .unique();
        if (row) ids.push(row._id);
        else warnings.push(`No such user: ${username}`);
      }
      return ids;
    };

    // `authors: []` is a no-op, per SPEC section 8; a non-empty list replaces.
    const wantsPeople = (list: string[] | undefined) => list !== undefined && list.length > 0;

    let problemId: Id<"problems">;

    if (created) {
      // Create-only fields: group, types, publishOn, checkAll.
      const groupId = await groupIdByName(ctx, body.group ?? "uncategorized", true);
      const typeIds = await typeIdsByName(
        ctx,
        body.types && body.types.length > 0 ? body.types : ["uncategorized"],
        true,
      );
      // `checkAll` on the add form ticks every allowed language; the uploader
      // always sets it, so all languages is the create default either way.
      const allLanguages = await ctx.db.query("languages").collect();

      problemId = await ctx.db.insert("problems", {
        code,
        name: (body.name as string).trim(),
        description: body.statement ?? "",
        authorProfileIds: wantsPeople(body.authors) ? await resolveProfiles(body.authors ?? []) : [],
        curatorProfileIds: wantsPeople(body.curators) ? await resolveProfiles(body.curators ?? []) : [],
        testerProfileIds: wantsPeople(body.testers) ? await resolveProfiles(body.testers ?? []) : [],
        typeIds,
        groupId,
        timeLimit: body.timeLimit ?? 1,
        memoryLimit: body.memoryLimit ?? 1_000_000,
        shortCircuit: body.shortCircuit ?? true,
        points: body.points ?? 100,
        partial: body.partial ?? false,
        allowedLanguageIds: allLanguages.map((row) => row._id),
        isPublic: body.isPublic ?? false,
        isManuallyManaged: false,
        date: body.publishOn ?? Date.now(),
        bannedProfileIds: [],
        summary: body.summary,
        userCount: 0,
        acRate: 0,
        isFullMarkup: false,
        submissionSourceVisibility: "F",
        organizationIds: [],
        isOrganizationPrivate: false,
      });
    } else {
      problemId = existing._id;
      const patch: Partial<Doc<"problems">> = {};
      // Absent means unchanged, exactly as the uploader's `*Provided` flags did.
      if (body.name?.trim()) patch.name = body.name.trim();
      if (body.statement !== undefined) patch.description = body.statement;
      if (body.points !== undefined) patch.points = body.points;
      if (body.timeLimit !== undefined) patch.timeLimit = body.timeLimit;
      if (body.memoryLimit !== undefined) patch.memoryLimit = body.memoryLimit;
      if (body.shortCircuit !== undefined) patch.shortCircuit = body.shortCircuit;
      if (body.partial !== undefined) patch.partial = body.partial;
      if (body.isPublic !== undefined) patch.isPublic = body.isPublic;
      if (body.summary !== undefined) patch.summary = body.summary;
      if (wantsPeople(body.authors)) {
        patch.authorProfileIds = await resolveProfiles(body.authors ?? []);
      }
      if (wantsPeople(body.curators)) {
        patch.curatorProfileIds = await resolveProfiles(body.curators ?? []);
      }
      if (wantsPeople(body.testers)) {
        patch.testerProfileIds = await resolveProfiles(body.testers ?? []);
      }
      // group, types, publishOn and checkAll are create-only and ignored here.
      if (Object.keys(patch).length > 0) await ctx.db.patch(problemId, patch);
    }

    // Language limits: replace every named key, leave the rest alone.
    if (body.languageLimits) {
      const rows = await ctx.db
        .query("languageLimits")
        .withIndex("by_problem", (q) => q.eq("problemId", problemId))
        .collect();
      for (const [key, limit] of Object.entries(body.languageLimits)) {
        const language = await languageForKey(ctx, key);
        if (!language) {
          warnings.push(`No such language: ${key}`);
          continue;
        }
        const current = rows.find((row) => row.languageId === language._id);
        if (current) {
          await ctx.db.patch(current._id, {
            timeLimit: limit.timeLimit,
            memoryLimit: limit.memoryLimit,
          });
        } else {
          await ctx.db.insert("languageLimits", {
            problemId,
            languageId: language._id,
            timeLimit: limit.timeLimit,
            memoryLimit: limit.memoryLimit,
          });
        }
      }
    }

    // The editorial becomes a public solution dated now, as the uploader's
    // inline-solution handling did. An empty body leaves the existing one be.
    if (body.editorial?.content.trim()) {
      const solution = await ctx.db
        .query("solutions")
        .withIndex("by_problem", (q) => q.eq("problemId", problemId))
        .unique();
      const isPublic = body.editorial.isPublic ?? true;
      const publishOn = body.editorial.publishOn ?? Date.now();
      if (solution) {
        await ctx.db.patch(solution._id, { content: body.editorial.content, isPublic, publishOn });
      } else {
        await ctx.db.insert("solutions", {
          problemId,
          isPublic,
          publishOn,
          authorProfileIds: [],
          content: body.editorial.content,
        });
      }
    }

    await writeRevision(
      ctx,
      problemId,
      actorProfileId,
      created ? "Created through the problems API." : "Updated through the problems API.",
    );

    const problem = (await ctx.db.get(problemId)) as Doc<"problems">;
    const group = await ctx.db.get(problem.groupId);
    const typeNames: string[] = [];
    for (const id of problem.typeIds) {
      const row = await ctx.db.get(id);
      if (row) typeNames.push(row.name);
    }
    const usernames = async (ids: readonly Id<"profiles">[]) => {
      const out: string[] = [];
      for (const id of ids) {
        const row = await ctx.db.get(id);
        if (row) out.push(row.username);
      }
      return out;
    };
    const languageKeys: string[] = [];
    for (const id of problem.allowedLanguageIds) {
      const row = await ctx.db.get(id);
      if (row) languageKeys.push(row.key);
    }
    const limitRows = await ctx.db
      .query("languageLimits")
      .withIndex("by_problem", (q) => q.eq("problemId", problemId))
      .collect();
    const languageLimits: Record<string, { timeLimit: number; memoryLimit: number }> = {};
    for (const row of limitRows) {
      const language = await ctx.db.get(row.languageId);
      if (language) {
        languageLimits[language.key] = {
          timeLimit: row.timeLimit,
          memoryLimit: row.memoryLimit,
        };
      }
    }
    const solution = await ctx.db
      .query("solutions")
      .withIndex("by_problem", (q) => q.eq("problemId", problemId))
      .unique();

    return {
      status: "ok" as const,
      created,
      warnings,
      problem: {
        code: problem.code,
        name: problem.name,
        points: problem.points,
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
        shortCircuit: problem.shortCircuit,
        partial: problem.partial,
        isPublic: problem.isPublic,
        group: group?.name ?? "uncategorized",
        types: typeNames,
        authors: await usernames(problem.authorProfileIds),
        testers: await usernames(problem.testerProfileIds),
        date: problem.date,
        hasEditorial: solution !== null,
        languageLimits,
        allowedLanguages: languageKeys,
      },
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Images                                                                     */
/* -------------------------------------------------------------------------- */

export const problemSummaryFor = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const problem = await problemByCode(ctx, code);
    return problem ? { id: problem._id, code: problem.code } : null;
  },
});

export const recordUpload = internalMutation({
  args: {
    storageId: v.id("_storage"),
    uploaderProfileId: v.id("profiles"),
    name: v.string(),
    cacheKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = args.cacheKey
      ? await ctx.db
          .query("uploads")
          .withIndex("by_cacheKey", (q) => q.eq("cacheKey", args.cacheKey))
          .first()
      : null;
    if (existing) return { storageId: existing.storageId, reused: true };

    await ctx.db.insert("uploads", {
      storageId: args.storageId,
      uploaderProfileId: args.uploaderProfileId,
      kind: "statement-image",
      name: args.name,
      createdAt: Date.now(),
      cacheKey: args.cacheKey,
    });
    return { storageId: args.storageId, reused: false };
  },
});

function imageLink(storageId: string): string {
  const base = (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
  return `${base}/api/problems/images/${storageId}`;
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

const UPSERT_PATH = /^\/api\/problems\/([a-z.0-9]+)\/?$/;
const IMAGES_PATH = /^\/api\/problems\/([a-z.0-9]+)\/images\/?$/;
const IMAGE_FETCH_PATH = /^\/api\/problems\/images\/([^/]+)\/?$/;

const upsertHandler = httpAction(async (ctx, request) => {
  const match = UPSERT_PATH.exec(new URL(request.url).pathname);
  if (!match) return errorResponse("not_found", "No such endpoint.");
  const code = match[1] as string;

  const identity = await authenticate(ctx, request);
  if (!identity) return errorResponse("unauthenticated", "A valid API key is required.");
  if (!identity.scopes.includes(PROBLEMS_WRITE_SCOPE)) {
    return errorResponse("forbidden", `This API key lacks the ${PROBLEMS_WRITE_SCOPE} scope.`);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("invalid", "The request body must be JSON.");
  }

  const parsed = problemUpsertInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".");
    return errorResponse(
      "invalid",
      where ? `${where}: ${issue?.message}` : (issue?.message ?? "The request body is invalid."),
    );
  }

  const result = await ctx.runMutation(internal.http.problemsApi.upsertProblem, {
    code,
    actorProfileId: identity.profileId,
    body: parsed.data,
  });

  if (result.status === "forbidden") return errorResponse("forbidden", result.message);
  if (result.status === "invalid") return errorResponse("invalid", result.message);

  return jsonResponse({
    ok: true,
    created: result.created,
    problem: result.problem,
    ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
  });
});

const imageUploadHandler = httpAction(async (ctx, request) => {
  const match = IMAGES_PATH.exec(new URL(request.url).pathname);
  if (!match) return errorResponse("not_found", "No such endpoint.");
  const code = match[1] as string;

  const identity = await authenticate(ctx, request);
  if (!identity) return errorResponse("unauthenticated", "A valid API key is required.");
  if (!identity.scopes.includes(PROBLEMS_WRITE_SCOPE)) {
    return errorResponse("forbidden", `This API key lacks the ${PROBLEMS_WRITE_SCOPE} scope.`);
  }

  const problem = await ctx.runQuery(internal.http.problemsApi.problemSummaryFor, { code });
  if (!problem) return errorResponse("not_found", `Could not find a problem with the code "${code}".`);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("invalid", "The request body must be multipart/form-data.");
  }
  // DMOJ's martor widget posted `markdown-image-upload`; `file` is the name
  // SPEC section 8 gives. Both are accepted so old tooling keeps working.
  const file = form.get("file") ?? form.get("markdown-image-upload");
  if (!(file instanceof Blob)) {
    return errorResponse("invalid", "The request must carry a file field.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return errorResponse("payload_too_large", "That image is too large.");
  }

  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const cacheKey = `statement-image:${hash}`;

  const storageId = await ctx.storage.store(new Blob([bytes], { type: file.type }));
  const recorded = await ctx.runMutation(internal.http.problemsApi.recordUpload, {
    storageId,
    uploaderProfileId: identity.profileId,
    name: file instanceof File ? file.name : `${code}.bin`,
    cacheKey,
  });
  // The same bytes were uploaded before: reuse the stored copy and drop this one.
  if (recorded.reused && recorded.storageId !== storageId) {
    await ctx.storage.delete(storageId);
  }

  return jsonResponse({ status: 200, link: imageLink(recorded.storageId) });
});

const imageFetchHandler = httpAction(async (ctx, request) => {
  const match = IMAGE_FETCH_PATH.exec(new URL(request.url).pathname);
  if (!match) return new Response("Not found", { status: 404 });
  const blob = await ctx.storage.get(match[1] as Id<"_storage">);
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(blob, {
    status: 200,
    headers: {
      "content-type": blob.type || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
});

const methodNotAllowed = httpAction(async () =>
  jsonResponse({ error: { code: "invalid", message: "Only PUT is supported on this endpoint." } }, 405),
);

export function registerProblemsApiRoutes(http: HttpRouter): void {
  http.route({ pathPrefix: "/api/problems/images/", method: "GET", handler: imageFetchHandler });
  http.route({ pathPrefix: "/api/problems/", method: "PUT", handler: upsertHandler });
  http.route({ pathPrefix: "/api/problems/", method: "POST", handler: imageUploadHandler });
  // SPEC section 8: DELETE is not supported.
  http.route({ pathPrefix: "/api/problems/", method: "DELETE", handler: methodNotAllowed });
}

/**
 * A problem repository names a language the way SPEC section 8 documents it
 * (`python3`, `pypy3`), while `languages.key` holds the judge executor's name
 * (`PY3`, `PYPY3`). Match the key as written first, then the documented
 * aliases, then case-insensitively, so a repo can write either.
 */
const LANGUAGE_KEY_ALIASES: Record<string, string> = {
  python2: "PY2",
  python3: "PY3",
  pypy2: "PYPY",
  pypy3: "PYPY3",
};

async function languageForKey(ctx: MutationCtx, key: string): Promise<Doc<"languages"> | null> {
  const exact = await ctx.db
    .query("languages")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (exact) return exact;

  const alias = LANGUAGE_KEY_ALIASES[key.toLowerCase()];
  if (alias) {
    const aliased = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", alias))
      .unique();
    if (aliased) return aliased;
  }

  const upper = key.toUpperCase();
  if (upper !== key) {
    const uppercased = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", upper))
      .unique();
    if (uppercased) return uppercased;
  }

  const wanted = key.toLowerCase();
  const all = await ctx.db.query("languages").collect();
  return (
    all.find(
      (row) => row.commonName.toLowerCase() === wanted || row.shortName.toLowerCase() === wanted,
    ) ?? null
  );
}
