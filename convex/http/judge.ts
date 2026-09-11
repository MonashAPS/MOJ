/**
 * The judge API over HTTP.
 *
 * `apps/judge/judge-server/dmoj/moj_packet.py` is the only client and
 * `apps/judge/README.md` documents the format; both are authoritative. Every
 * request carries `judgeName` and `judgeKey`, in the JSON body for the POSTs and
 * in the query string for the two GETs. The site stores only `sha256(key)`, so
 * that is what is hashed here and compared in the mutation.
 *
 * Nothing in this file touches the database: each route validates, hashes and
 * hands over to an internal mutation in convex/judging.ts, so one request is one
 * transaction. `GET /judge/data` is the exception that reads a blob, which only
 * an action may do, and it streams the archive straight back.
 */

import {
  abortQuerySchema,
  claimRequestSchema,
  DATA_HASH_HEADER,
  DATA_SIZE_HEADER,
  disconnectRequestSchema,
  eventRequestSchema,
  handshakeRequestSchema,
  heartbeatRequestSchema,
  judgeDataQuerySchema,
} from "@moj/protocol/judge";
import type { HttpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction } from "../_generated/server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** sha256 of the judge key, lowercase hex, matching `judges.authKeyHash`. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip") ?? undefined;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * A failed authentication is a 403, as the mock server returns; anything else
 * the mutation throws is a 400 with the message, which the judge logs and
 * retries. Never a 500: the judge treats every failure the same way, but an
 * operator reading the log deserves the reason.
 */
function errorResponse(error: unknown): Response {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string; message?: string } | undefined;
    const status = data?.code === "FORBIDDEN" ? 403 : 400;
    return json({ error: data?.message ?? "request failed" }, status);
  }
  const message = error instanceof Error ? error.message : String(error);
  return json({ error: message }, 400);
}

/** `GET /judge/data` answers `{ok: false, error}` rather than a bare `{error}`. */
function dataErrorResponse(error: unknown): Response {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string; message?: string } | undefined;
    return json(
      { ok: false, error: data?.message ?? "request failed" },
      data?.code === "FORBIDDEN" ? 403 : 400,
    );
  }
  return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
}

export function registerJudgeRoutes(http: HttpRouter): void {
  http.route({
    path: "/judge/handshake",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const parsed = handshakeRequestSchema.safeParse(await readJson(request));
      if (!parsed.success) return json({ error: "malformed handshake" }, 400);
      try {
        const result = await ctx.runMutation(internal.judging.handshake, {
          judgeName: parsed.data.judgeName,
          authKeyHash: await sha256Hex(parsed.data.judgeKey),
          problems: parsed.data.problems as unknown[][],
          executors: parsed.data.executors as Record<string, unknown[][]>,
          ip: clientIp(request),
        });
        return json(result);
      } catch (error) {
        return errorResponse(error);
      }
    }),
  });

  http.route({
    path: "/judge/heartbeat",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const parsed = heartbeatRequestSchema.safeParse(await readJson(request));
      if (!parsed.success) return json({ error: "malformed heartbeat" }, 400);
      try {
        const result = await ctx.runMutation(internal.judging.heartbeat, {
          judgeName: parsed.data.judgeName,
          authKeyHash: await sha256Hex(parsed.data.judgeKey),
          load: parsed.data.load ?? undefined,
          problems: parsed.data.problems as unknown[][] | undefined,
          executors: parsed.data.executors as Record<string, unknown[][]> | undefined,
          ip: clientIp(request),
        });
        return json(result);
      } catch (error) {
        return errorResponse(error);
      }
    }),
  });

  http.route({
    path: "/judge/claim",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const parsed = claimRequestSchema.safeParse(await readJson(request));
      if (!parsed.success) return json({ error: "malformed claim" }, 400);
      try {
        const result = await ctx.runMutation(internal.judging.claim, {
          judgeName: parsed.data.judgeName,
          authKeyHash: await sha256Hex(parsed.data.judgeKey),
        });
        return json(result);
      } catch (error) {
        return errorResponse(error);
      }
    }),
  });

  http.route({
    path: "/judge/event",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const body = await readJson(request);
      const parsed = eventRequestSchema.safeParse(body);
      if (!parsed.success) {
        // Say which event type was rejected: the judge logs the body back.
        const type = (body as { event?: { type?: unknown } } | null)?.event?.type;
        return json({ ok: false, error: `malformed ${JSON.stringify(type ?? null)} event` }, 400);
      }
      try {
        const result = await ctx.runMutation(internal.judging.event, {
          judgeName: parsed.data.judgeName,
          authKeyHash: await sha256Hex(parsed.data.judgeKey),
          submissionId: parsed.data.submissionId,
          event: parsed.data.event,
        });
        return json(result);
      } catch (error) {
        return errorResponse(error);
      }
    }),
  });

  http.route({
    path: "/judge/abort",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const query = Object.fromEntries(new URL(request.url).searchParams.entries());
      const parsed = abortQuerySchema.safeParse(query);
      if (!parsed.success) return json({ abort: false });
      try {
        const result = await ctx.runQuery(internal.judging.abortFlag, {
          judgeName: parsed.data.judgeName,
          authKeyHash: await sha256Hex(parsed.data.judgeKey),
          submissionId: parsed.data.submissionId,
        });
        return json(result);
      } catch (error) {
        return errorResponse(error);
      }
    }),
  });

  /**
   * The test data archive for one problem, for a judge whose claim carried a
   * `problemDataHash`. The judge verifies the bytes against `X-Moj-Data-Hash`
   * before it extracts them, so a truncated download fails loudly.
   */
  http.route({
    path: "/judge/data",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const query = Object.fromEntries(new URL(request.url).searchParams.entries());
      const parsed = judgeDataQuerySchema.safeParse(query);
      if (!parsed.success) return json({ ok: false, error: "malformed request" }, 400);

      let archive: { storageId: Id<"_storage">; hash: string; size: number } | null;
      try {
        archive = await ctx.runQuery(internal.problemTestData.judgeArchive, {
          judgeName: parsed.data.judgeName,
          authKeyHash: await sha256Hex(parsed.data.judgeKey),
          code: parsed.data.code,
        });
      } catch (error) {
        return dataErrorResponse(error);
      }

      if (!archive) return json({ ok: false, error: "no data" }, 404);
      // The judge names the hash its claim carried; a newer archive means that
      // claim is stale, and grading the bytes it asked for would be wrong.
      if (parsed.data.hash && parsed.data.hash !== archive.hash) {
        return json({ ok: false, error: "hash mismatch" }, 409);
      }

      const blob = await ctx.storage.get(archive.storageId);
      if (!blob) return json({ ok: false, error: "no data" }, 404);

      // Streamed rather than handed over as a Blob: an archive is megabytes,
      // and the response should not be buffered again on its way out.
      return new Response(blob.stream(), {
        status: 200,
        headers: {
          "content-type": "application/zip",
          [DATA_HASH_HEADER]: archive.hash,
          [DATA_SIZE_HEADER]: String(archive.size),
          "cache-control": "no-store",
        },
      });
    }),
  });

  http.route({
    path: "/judge/disconnect",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const parsed = disconnectRequestSchema.safeParse(await readJson(request));
      if (!parsed.success) return json({ error: "malformed disconnect" }, 400);
      try {
        const result = await ctx.runMutation(internal.judging.disconnect, {
          judgeName: parsed.data.judgeName,
          authKeyHash: await sha256Hex(parsed.data.judgeKey),
        });
        return json(result);
      } catch (error) {
        return errorResponse(error);
      }
    }),
  });
}
