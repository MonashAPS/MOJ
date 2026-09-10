/**
 * Bearer authentication for API v2.
 *
 * DMOJ's `APITokenAuthenticationMiddleware` (judge/middleware.py:99) accepts
 * `Bearer <48 characters>` and nothing else, so both token families keep that
 * shape:
 *
 *   - Better Auth api-key plugin keys (`defaultKeyLength: 48`), verified with
 *     `auth.api.verifyApiKey`.
 *   - Imported DMOJ tokens, `base64url(struct.pack('>I32s', user_id, secret))`.
 *     The Django user id names the profile through `profiles.legacyUserId`; the
 *     digest is `hmac_sha256(LEGACY_SECRET_KEY, secret).hexdigest()`, compared
 *     against `profiles.legacyApiTokenHash` inside Convex.
 *
 * Once a token resolves to a Better Auth user, the route mints a short-lived
 * (five minute) JWT for that user through the jwt plugin's own signing keys and
 * hands it to `fetchQuery`. Convex already trusts those keys through the
 * `customJwt` provider in convex/auth.config.ts, so an API caller reaches the
 * same `ctx.auth.getUserIdentity()` a browser session would, with no second
 * trust path and no shared secret to keep in step.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { api } from "@convex/_generated/api";
import { API_VERSION, type ApiErrorBody } from "@moj/protocol";
import { fetchQuery } from "convex/nextjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/auth/db";
import { auth } from "@/auth/server";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210";

/** DMOJ's header pattern, verbatim. */
export const BEARER_PATTERN = /^Bearer ([a-zA-Z0-9_-]{48})$/;

/** How long the minted Convex JWT lives. */
const TOKEN_TTL_SECONDS = 300;

export type ApiIdentity = {
  kind: "api-key" | "legacy";
  userId: string;
  username: string;
  isStaff: boolean;
  /** Scopes from the api-key plugin, empty for a legacy token. */
  permissions: Record<string, string[]>;
};

export type BearerOutcome =
  | { status: "anonymous" }
  | { status: "malformed" }
  | { status: "invalid" }
  | { status: "ok"; identity: ApiIdentity };

/** `base64url` decode without the padding Node insists on. */
function decodeBase64Url(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

export type LegacyToken = { legacyUserId: number; digest: string };

/**
 * Decode a DMOJ token and compute the digest the profile should carry.
 * Returns null when the token is not 36 bytes or no secret key is configured.
 */
export function legacyTokenDigest(token: string, secretKey: string): LegacyToken | null {
  const raw = decodeBase64Url(token);
  if (raw.length !== 36) return null;
  const legacyUserId = raw.readUInt32BE(0);
  const secret = raw.subarray(4);
  const digest = createHmac("sha256", secretKey).update(secret).digest("hex");
  return { legacyUserId, digest };
}

/** Build a DMOJ token from a user id and secret, which is what the tests need. */
export function buildLegacyToken(legacyUserId: number, secret: Buffer): string {
  const packed = Buffer.alloc(36);
  packed.writeUInt32BE(legacyUserId, 0);
  secret.copy(packed, 4, 0, 32);
  return packed.toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function verifyApiKeyToken(token: string): Promise<ApiIdentity | null> {
  try {
    const result = await auth.api.verifyApiKey({ body: { key: token } });
    if (!result?.valid || !result.key) return null;
    const userId = (result.key as { userId?: string }).userId;
    if (!userId) return null;

    const rows = await db
      .select({
        username: schema.user.username,
        name: schema.user.name,
        isStaff: schema.user.isStaff,
        isSuperuser: schema.user.isSuperuser,
        banned: schema.user.banned,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    const record = rows[0];
    if (!record || record.banned) return null;

    let permissions: Record<string, string[]> = {};
    const raw = (result.key as { permissions?: unknown }).permissions;
    if (typeof raw === "string") {
      try {
        permissions = JSON.parse(raw) as Record<string, string[]>;
      } catch {
        permissions = {};
      }
    } else if (raw && typeof raw === "object") {
      permissions = raw as Record<string, string[]>;
    }

    return {
      kind: "api-key",
      userId,
      username: record.username ?? record.name,
      isStaff: Boolean(record.isStaff || record.isSuperuser),
      permissions,
    };
  } catch {
    return null;
  }
}

async function verifyLegacyToken(token: string): Promise<ApiIdentity | null> {
  const secretKey = process.env.LEGACY_SECRET_KEY;
  if (!secretKey) return null;

  const decoded = legacyTokenDigest(token, secretKey);
  if (!decoded) return null;

  const profile = await fetchQuery(
    api.profiles.verifyLegacyApiToken,
    { legacyUserId: decoded.legacyUserId, digest: decoded.digest },
    { url: convexUrl },
  );
  if (!profile) return null;

  return {
    kind: "legacy",
    userId: profile.userId,
    username: profile.username,
    isStaff: profile.isStaff,
    permissions: {},
  };
}

/** Resolve the `Authorization` header of an API v2 request. */
export async function authenticateRequest(request: Request): Promise<BearerOutcome> {
  const header = request.headers.get("authorization");
  if (!header) return { status: "anonymous" };

  const match = BEARER_PATTERN.exec(header);
  if (!match) return { status: "malformed" };
  const token = match[1] as string;

  const identity = (await verifyApiKeyToken(token)) ?? (await verifyLegacyToken(token));
  if (!identity) return { status: "invalid" };
  return { status: "ok", identity };
}

/**
 * A short-lived Convex JWT for an API caller, signed with the same JWKS the jwt
 * plugin uses for browser sessions.
 */
export async function mintConvexToken(identity: ApiIdentity): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const result = await auth.api.signJWT({
    body: {
      payload: {
        sub: identity.userId,
        username: identity.username,
        isStaff: identity.isStaff,
        iat: issuedAt,
        exp: issuedAt + TOKEN_TTL_SECONDS,
      },
    },
  });
  return (result as { token: string }).token;
}

export type ConvexCallOptions = { url: string; token?: string };

/** Convex options for a request: the caller's identity, or anonymous. */
export async function convexOptionsFor(outcome: BearerOutcome): Promise<ConvexCallOptions> {
  if (outcome.status !== "ok") return { url: convexUrl };
  const token = await mintConvexToken(outcome.identity);
  return { url: convexUrl, token };
}

/* -------------------------------------------------------------------------- */
/* Envelope                                                                   */
/* -------------------------------------------------------------------------- */

function baseResponse(request: Request) {
  return {
    api_version: API_VERSION,
    method: request.method.toLowerCase(),
    fetched: new Date().toISOString(),
  };
}

export function apiJson(request: Request, data: unknown, status = 200): Response {
  return Response.json({ ...baseResponse(request), data }, { status });
}

export function apiError(request: Request, code: number, message: string): Response {
  const error: ApiErrorBody = { code, message };
  return Response.json({ ...baseResponse(request), error }, { status: code });
}

/** DMOJ's `APIMixin.get_error` table. */
export const API_ERRORS = {
  invalidFilter: { code: 400, message: "invalid filter value type" },
  permissionDenied: { code: 403, message: "permission denied" },
  loginRequired: { code: 403, message: "login required" },
  notFound: { code: 404, message: "page/object not found" },
} as const;

type ConvexErrorData = { code?: string; message?: string };

/** Map a `ConvexError` thrown by convex/apiV2.ts onto DMOJ's error envelope. */
export function errorResponse(request: Request, error: unknown): Response {
  const data = (error as { data?: ConvexErrorData })?.data;
  const code = data?.code;

  if (code === "NOT_FOUND") {
    return apiError(request, API_ERRORS.notFound.code, API_ERRORS.notFound.message);
  }
  if (code === "FORBIDDEN") {
    const message = data?.message === "login required" ? "login required" : "permission denied";
    return apiError(request, 403, message);
  }
  if (code === "UNAUTHENTICATED" || code === "NO_PROFILE") {
    return apiError(request, API_ERRORS.loginRequired.code, API_ERRORS.loginRequired.message);
  }
  if (code === "INVALID") {
    return apiError(request, API_ERRORS.invalidFilter.code, API_ERRORS.invalidFilter.message);
  }
  throw error;
}

/**
 * Everything a route handler does around its Convex query: authenticate,
 * reject a malformed or unknown token the way DMOJ's middleware does, and turn
 * a thrown `ConvexError` into the error envelope.
 */
export async function handleApiRequest(
  request: Request,
  run: (options: ConvexCallOptions, identity: ApiIdentity | null) => Promise<unknown>,
): Promise<Response> {
  const outcome = await authenticateRequest(request);

  if (outcome.status === "malformed") {
    return new Response("Invalid authorization header", { status: 400 });
  }
  if (outcome.status === "invalid") {
    return new Response("Invalid token", {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="API"' },
    });
  }

  try {
    const options = await convexOptionsFor(outcome);
    const data = await run(options, outcome.status === "ok" ? outcome.identity : null);
    return apiJson(request, data);
  } catch (error) {
    return errorResponse(request, error);
  }
}

/* -------------------------------------------------------------------------- */
/* Query string                                                               */
/* -------------------------------------------------------------------------- */

/** A `basic_filter`: the single value DMOJ's `request.GET.get(key)` returns. */
export function basicFilter(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key);
  return value === null ? undefined : value;
}

/** A `list_filter`: every repetition, as `request.GET.getlist(key)` returns. */
export function listFilter(url: URL, key: string): string[] | undefined {
  const values = url.searchParams.getAll(key);
  return values.length > 0 ? values : undefined;
}

export function booleanFilter(url: URL, key: string): boolean | undefined {
  const value = basicFilter(url, key);
  if (value === undefined) return undefined;
  const lowered = value.trim().toLowerCase();
  if (lowered === "true" || lowered === "1") return true;
  if (lowered === "false" || lowered === "0") return false;
  throw new TypeError("invalid filter value type");
}

export function numberFilter(url: URL, key: string): number | undefined {
  const value = basicFilter(url, key);
  if (value === undefined) return undefined;
  if (!/^-?\d+$/.test(value.trim())) throw new TypeError("invalid filter value type");
  return Number.parseInt(value, 10);
}

/** `?page=`: not a positive integer means DMOJ's paginator raises Http404. */
export function pageFilter(url: URL): number {
  const value = url.searchParams.get("page");
  if (value === null || value === "") return 1;
  if (!/^\d+$/.test(value)) throw new RangeError("page");
  const page = Number.parseInt(value, 10);
  if (page < 1) throw new RangeError("page");
  return page;
}

/** Wrap a handler so a bad filter or page value becomes DMOJ's error envelope. */
export function withFilters(request: Request, build: (url: URL) => Promise<Response>): Promise<Response> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return Promise.resolve(
      apiError(request, API_ERRORS.invalidFilter.code, API_ERRORS.invalidFilter.message),
    );
  }
  return build(url).catch((error: unknown) => {
    if (error instanceof RangeError) {
      return apiError(request, API_ERRORS.notFound.code, API_ERRORS.notFound.message);
    }
    if (error instanceof TypeError) {
      return apiError(request, API_ERRORS.invalidFilter.code, API_ERRORS.invalidFilter.message);
    }
    return errorResponse(request, error);
  });
}
