/**
 * The judge side of the judge API: authentication and everything that writes to
 * the `judges` row.
 *
 * The endpoints themselves are internal mutations in convex/judging.ts, called
 * by the HTTP actions in convex/http/judge.ts. This module holds what they share
 * and what the crons need, so the grading bookkeeping does not have to know how
 * a judge proves who it is.
 *
 * Ported from judge/bridge/judge_handler.py (`_authenticate`, `_connected`,
 * `_disconnected`, `on_supported_problems`, `_update_ping`).
 */

import type { WithoutSystemFields } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { mojError } from "./lib/errors";
import { isJsonString, type JsonValue } from "./lib/json";

/** No heartbeat for this long and the judge is treated as gone. */
export const JUDGE_HEARTBEAT_TIMEOUT_MS = 60_000;

/** `_connected`: a `[runtime name, version parts]` row, as the wire sends it. */
export type JudgeExecutorEntry = readonly JsonValue[];

/** `_connected`: executor key to its `[runtime name, version parts]` rows. */
export type JudgeExecutorMap = Record<string, readonly JudgeExecutorEntry[]>;

/** The fields a judge handshake or heartbeat writes back onto its row. */
type JudgePatch = Partial<WithoutSystemFields<Doc<"judges">>>;

export function judgeAuthError(message: string) {
  return mojError("FORBIDDEN", message);
}

/**
 * `JudgeHandler._authenticate`: the name identifies the judge and sha256 of the
 * key must match `authKeyHash`; a blocked judge is refused even with a good key.
 *
 * The hash is computed by the HTTP action, which has Web Crypto; a mutation does
 * not. Comparison is over lowercase hex on both sides.
 */
export async function authenticateJudge(
  ctx: QueryCtx,
  judgeName: string,
  authKeyHash: string,
): Promise<Doc<"judges">> {
  const judge = await ctx.db
    .query("judges")
    .withIndex("by_name", (q) => q.eq("name", judgeName))
    .unique();

  if (!judge) throw judgeAuthError("Unknown judge.");

  if (judge.authKeyHash.toLowerCase() !== authKeyHash.toLowerCase()) {
    throw judgeAuthError("Bad judge key.");
  }

  if (judge.isBlocked) throw judgeAuthError("This judge is blocked.");

  return judge;
}

function runtimeKeys(executors: JudgeExecutorMap | undefined): string[] | null {
  if (!executors) return null;

  return Object.keys(executors).sort();
}

/**
 * `_connected`: replace the judge's `runtimeVersions` rows with what the
 * executors map says. DMOJ deletes and bulk-creates, and so do we, because a
 * judge that lost an executor must stop advertising it.
 */
async function replaceRuntimeVersions(
  ctx: MutationCtx,
  judgeId: Id<"judges">,
  executors: JudgeExecutorMap,
): Promise<void> {
  const existing = await ctx.db
    .query("runtimeVersions")
    .withIndex("by_judge", (q) => q.eq("judgeId", judgeId))
    .collect();

  for (const row of existing) await ctx.db.delete(row._id);

  for (const [key, runtimes] of Object.entries(executors)) {
    // First match rather than `unique`: a deployment that was seeded and then
    // imported by a pre-upsert importer holds two rows for a key, and throwing
    // here failed the whole handshake with a 400 instead of losing one
    // executor. `admin/languages.dedupeByKey` is the repair.
    const language = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    // A judge may run an executor the site has no Language row for; DMOJ's
    // `judge.runtimes.set(...)` silently drops those too.
    if (!language) continue;
    let priority = 0;

    for (const runtime of runtimes ?? []) {
      const name = runtime?.[0];
      const version = runtime?.[1];

      if (!isJsonString(name)) continue;
      await ctx.db.insert("runtimeVersions", {
        languageId: language._id,
        judgeId,
        name,
        version: Array.isArray(version) ? version.join(".") : String(version ?? ""),
        priority,
      });
      priority += 1;
    }
  }
}

export async function deleteRuntimeVersions(ctx: MutationCtx, judgeId: Id<"judges">): Promise<void> {
  const existing = await ctx.db
    .query("runtimeVersions")
    .withIndex("by_judge", (q) => q.eq("judgeId", judgeId))
    .collect();

  for (const row of existing) await ctx.db.delete(row._id);
}

/** `_connected`: the judge is online, and these are the executors it runs. */
export async function applyHandshake(
  ctx: MutationCtx,
  judge: Doc<"judges">,
  args: { executors: JudgeExecutorMap; ip?: string },
): Promise<void> {
  const now = Date.now();

  const patch: JudgePatch = {
    online: true,
    startTime: now,
    lastSeen: now,
    runtimeKeys: runtimeKeys(args.executors) ?? [],
    // A judge that reconnects mid-grade is not holding anything any more; the
    // recovery cron picks up whatever it dropped.
    currentSubmissionId: undefined,
  };

  if (args.ip) patch.lastIp = args.ip;
  await ctx.db.patch(judge._id, patch);
  await replaceRuntimeVersions(ctx, judge._id, args.executors);
}

/**
 * `_update_ping`: liveness and load every ten seconds, and the executor list
 * when it changed.
 */
export async function applyHeartbeat(
  ctx: MutationCtx,
  judge: Doc<"judges">,
  args: {
    load?: number | null;
    executors?: JudgeExecutorMap;
    ip?: string;
  },
): Promise<void> {
  const keys = runtimeKeys(args.executors);
  const patch: JudgePatch = { online: true, lastSeen: Date.now() };

  if (args.load !== null && args.load !== undefined) patch.load = args.load;

  if (keys) patch.runtimeKeys = keys;

  if (args.ip) patch.lastIp = args.ip;
  await ctx.db.patch(judge._id, patch);

  if (args.executors) await replaceRuntimeVersions(ctx, judge._id, args.executors);
}

/** `_disconnected`: offline, and its runtime versions go with it. */
export async function markJudgeOffline(ctx: MutationCtx, judge: Doc<"judges">): Promise<void> {
  await ctx.db.patch(judge._id, { online: false, currentSubmissionId: undefined });
  await deleteRuntimeVersions(ctx, judge._id);
}

/** `JudgeList.on_judge_free`: the judge is no longer holding a submission. */
export async function freeJudge(
  ctx: MutationCtx,
  judgeId: Id<"judges"> | undefined,
  submissionId: Id<"submissions">,
): Promise<void> {
  if (!judgeId) return;
  const judge = await ctx.db.get(judgeId);

  if (!judge) return;

  if (judge.currentSubmissionId === submissionId) {
    await ctx.db.patch(judgeId, { currentSubmissionId: undefined });
  }
}

/**
 * Cron, every minute: a judge that has not heartbeat in a minute is gone.
 *
 * DMOJ learns this from the TCP connection dropping. A pull judge has no
 * connection to drop, so the gap between heartbeats is all there is.
 */
export const markOfflineJudges = internalMutation({
  args: { timeoutMs: v.optional(v.number()) },
  handler: async (ctx, { timeoutMs }) => {
    const cutoff = Date.now() - (timeoutMs ?? JUDGE_HEARTBEAT_TIMEOUT_MS);
    const judges = await ctx.db.query("judges").collect();
    let marked = 0;

    for (const judge of judges) {
      if (!judge.online) continue;
      const lastSeen = judge.lastSeen ?? judge.startTime ?? 0;

      if (lastSeen >= cutoff) continue;
      await markJudgeOffline(ctx, judge);
      marked += 1;
    }

    return { marked };
  },
});

/**
 * Setup for `infra/scripts/e2e-judge.mjs`.
 *
 * The end to end test needs a judge row whose key it knows and the identity of
 * the user it submits as. Both are one transaction here rather than two ad hoc
 * pokes at the database from a script.
 */
export const prepareEndToEnd = internalMutation({
  args: { judgeName: v.string(), authKeyHash: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    let judge = await ctx.db
      .query("judges")
      .withIndex("by_name", (q) => q.eq("name", args.judgeName))
      .unique();

    let created = false;

    if (!judge) {
      const judgeId = await ctx.db.insert("judges", {
        name: args.judgeName,
        authKeyHash: args.authKeyHash,
        isBlocked: false,
        isDisabled: false,
        tier: 0,
        online: false,
        description: "created by npm run e2e:judge",
        runtimeKeys: [],
      });

      judge = await ctx.db.get(judgeId);
      created = true;
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();

    return {
      judgeId: judge?._id ?? null,
      created,
      keyMatches: judge?.authKeyHash === args.authKeyHash,
      userId: profile?.userId ?? null,
      profileId: profile?._id ?? null,
    };
  },
});
