// Staff console: judges. judge/models/runtime.py:126 and judge/judgeapi.py.
//
// DMOJ stores `Judge.auth_key` in the clear and tells the bridge to drop a
// connection over a socket. MOJ stores only the SHA-256 of the key, shows the
// key once at creation, and records a disconnect request the judge picks up on
// its next heartbeat because the pull-model judge has no inbound socket.

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requirePerm } from "../lib/auth";
import { generateJudgeKey, writeRevision } from "../lib/community";
import { invalid, notFound } from "../lib/errors";
import { sha256Hex } from "../lib/hash";

const JUDGE_PERM = "judge.change_judge";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePerm(ctx, JUDGE_PERM);
    const rows = await ctx.db.query("judges").collect();
    rows.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;

      return a.name.localeCompare(b.name);
    });

    return rows.map((row) => ({
      _id: row._id,
      name: row.name,
      online: row.online,
      tier: row.tier,
      isBlocked: row.isBlocked,
      isDisabled: row.isDisabled,
      description: row.description,
      lastIp: row.lastIp ?? null,
      lastSeen: row.lastSeen ?? null,
      startTime: row.startTime ?? null,
      ping: row.ping ?? null,
      load: row.load ?? null,
      runtimeCount: row.runtimeKeys.length,
      disconnectRequestedAt: row.disconnectRequestedAt ?? null,
      createdAt: row.createdAt ?? row._creationTime,
    }));
  },
});

export const get = query({
  args: { id: v.id("judges") },
  handler: async (ctx, { id }) => {
    await requirePerm(ctx, JUDGE_PERM);

    return await ctx.db.get(id);
  },
});

/**
 * Creates a judge and returns the generated key once. Only its hash is stored,
 * so the key cannot be recovered afterwards; `regenerateKey` issues a new one.
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    tier: v.optional(v.number()),
    isBlocked: v.optional(v.boolean()),
    isDisabled: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ id: Id<"judges">; name: string; authKey: string }> => {
    const editor = await requirePerm(ctx, JUDGE_PERM);

    const name = args.name.trim();

    if (name.length === 0) throw invalid("A judge needs a name.");

    if (name.length > 50) throw invalid("Judge names are limited to 50 characters.");

    const clash = await ctx.db
      .query("judges")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();

    if (clash) throw invalid(`A judge named ${name} already exists.`);

    const authKey = generateJudgeKey();

    const id = await ctx.db.insert("judges", {
      name,
      authKeyHash: await sha256Hex(authKey),
      isBlocked: args.isBlocked ?? false,
      isDisabled: args.isDisabled ?? false,
      tier: args.tier ?? 1,
      online: false,
      description: args.description ?? "",
      runtimeKeys: [],
      createdAt: Date.now(),
    });

    await writeRevision(
      ctx,
      "judge",
      id,
      { name, tier: args.tier ?? 1, description: args.description ?? "" },
      editor._id,
      args.reason ?? "Created judge",
    );

    return { id, name, authKey };
  },
});

export const update = mutation({
  args: {
    id: v.id("judges"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    tier: v.optional(v.number()),
    isBlocked: v.optional(v.boolean()),
    isDisabled: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const editor = await requirePerm(ctx, JUDGE_PERM);
    const row = await ctx.db.get(args.id);

    if (!row) throw notFound("Judge");

    const patch: Partial<Doc<"judges">> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();

      if (name.length === 0) throw invalid("A judge needs a name.");

      if (name !== row.name) {
        const clash = await ctx.db
          .query("judges")
          .withIndex("by_name", (q) => q.eq("name", name))
          .unique();

        if (clash) throw invalid(`A judge named ${name} already exists.`);
      }

      patch.name = name;
    }

    if (args.description !== undefined) patch.description = args.description;

    if (args.tier !== undefined) {
      if (!Number.isInteger(args.tier) || args.tier < 0)
        throw invalid("A tier must be a non-negative integer.");
      patch.tier = args.tier;
    }

    if (args.isBlocked !== undefined) patch.isBlocked = args.isBlocked;

    if (args.isDisabled !== undefined) patch.isDisabled = args.isDisabled;

    await writeRevision(ctx, "judge", args.id, row, editor._id, args.reason ?? "Edited judge");
    await ctx.db.patch(args.id, patch);
  },
});

/** `Judge.toggle_disabled` (judge/models/runtime.py:160). */
export const toggleDisabled = mutation({
  args: { id: v.id("judges"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const editor = await requirePerm(ctx, JUDGE_PERM);
    const row = await ctx.db.get(id);

    if (!row) throw notFound("Judge");
    await writeRevision(ctx, "judge", id, row, editor._id, reason ?? "Toggled judge");
    await ctx.db.patch(id, { isDisabled: !row.isDisabled });

    return !row.isDisabled;
  },
});

/**
 * `Judge.disconnect` (judge/models/runtime.py:155). The pull-model judge reads
 * `disconnectRequestedAt` on its next heartbeat and shuts its session down.
 */
export const disconnect = mutation({
  args: { id: v.id("judges"), force: v.optional(v.boolean()) },
  handler: async (ctx, { id, force }) => {
    const editor = await requirePerm(ctx, JUDGE_PERM);
    const row = await ctx.db.get(id);

    if (!row) throw notFound("Judge");
    await ctx.db.patch(id, {
      disconnectRequestedAt: Date.now(),
      disconnectForce: force ?? false,
    });
    await writeRevision(
      ctx,
      "judge",
      id,
      row,
      editor._id,
      force ? "Forced disconnect" : "Requested disconnect",
    );
  },
});

/** Clears a served disconnect request; the judge API calls this on reconnect. */
export const clearDisconnect = mutation({
  args: { id: v.id("judges") },
  handler: async (ctx, { id }) => {
    await requirePerm(ctx, JUDGE_PERM);
    const row = await ctx.db.get(id);

    if (!row) throw notFound("Judge");
    await ctx.db.patch(id, { disconnectRequestedAt: undefined, disconnectForce: undefined });
  },
});

/** Issues a new key and returns it once; the old key stops working at once. */
export const regenerateKey = mutation({
  args: { id: v.id("judges"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }): Promise<{ authKey: string }> => {
    const editor = await requirePerm(ctx, JUDGE_PERM);
    const row = await ctx.db.get(id);

    if (!row) throw notFound("Judge");
    const authKey = generateJudgeKey();
    await ctx.db.patch(id, { authKeyHash: await sha256Hex(authKey) });
    await writeRevision(ctx, "judge", id, { name: row.name }, editor._id, reason ?? "Regenerated judge key");

    return { authKey };
  },
});

export const remove = mutation({
  args: { id: v.id("judges"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const editor = await requirePerm(ctx, JUDGE_PERM);
    const row = await ctx.db.get(id);

    if (!row) throw notFound("Judge");

    const versions = await ctx.db
      .query("runtimeVersions")
      .withIndex("by_judge", (q) => q.eq("judgeId", id))
      .collect();

    for (const version of versions) await ctx.db.delete(version._id);

    await writeRevision(ctx, "judge", id, row, editor._id, reason ?? "Deleted judge");
    await ctx.db.delete(id);
  },
});
