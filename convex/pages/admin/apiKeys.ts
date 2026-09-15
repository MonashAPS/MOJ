/**
 * The `apiKeys` rows the problems API verifies a key against when Better Auth
 * is not reachable from the Convex container. Only the hash and the visible
 * prefix are stored, so a key is never readable again once it is minted.
 */

import { API_SCOPES, isApiScope } from "@moj/protocol";
import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { mutation, query } from "../../_generated/server";
import { requireStaff } from "../../lib/auth";
import { forbidden, invalid, notFound } from "../../lib/errors";

export type ConsoleApiKey = {
  _id: Id<"apiKeys">;
  name: string;
  prefix: string | null;
  scopes: string[];
  enabled: boolean;
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
};

export function toApiKeyRow(row: Doc<"apiKeys">): ConsoleApiKey {
  return {
    _id: row._id,
    name: row.name,
    prefix: row.prefix ?? null,
    scopes: row.scopes,
    enabled: row.enabled,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
  };
}

/** The signed-in staff member's own keys. A key is never readable again. */
export const mine = query({
  args: {},
  handler: async (ctx): Promise<ConsoleApiKey[]> => {
    const staff = await requireStaff(ctx);
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_profile", (q) => q.eq("profileId", staff._id))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.map(toApiKeyRow);
  },
});

/**
 * Mirrors a key Better Auth's api-key plugin just minted into the `apiKeys`
 * table, so `http/problemsApi` can verify it by sha256 when it cannot reach the
 * web app. Only the hash and the visible prefix are stored.
 */
export const record = mutation({
  args: {
    keyHash: v.string(),
    prefix: v.optional(v.string()),
    name: v.string(),
    scopes: v.array(v.string()),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args): Promise<Id<"apiKeys">> => {
    const staff = await requireStaff(ctx);
    const name = args.name.trim();
    if (name.length === 0) throw invalid("A key needs a name.");
    if (!/^[0-9a-f]{64}$/.test(args.keyHash)) throw invalid("That is not a sha256 hash.");
    if (args.scopes.length === 0) throw invalid("A key needs at least one scope.");
    const unknown = args.scopes.filter((scope) => !isApiScope(scope));
    if (unknown.length > 0) {
      throw invalid(`Not a scope: ${unknown.join(", ")}. The scopes are ${API_SCOPES.join(" and ")}.`);
    }

    const clash = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash))
      .unique();
    if (clash) throw invalid("That key has already been recorded.");

    return await ctx.db.insert("apiKeys", {
      keyHash: args.keyHash,
      prefix: args.prefix,
      name,
      profileId: staff._id,
      scopes: args.scopes,
      enabled: true,
      expiresAt: args.expiresAt ?? undefined,
      createdAt: Date.now(),
    });
  },
});

/** Revoking is immediate: the row is deleted, not just disabled. */
export const revoke = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    const staff = await requireStaff(ctx);
    const row = await ctx.db.get(id);
    if (!row) throw notFound("API key");
    if (row.profileId !== staff._id && !staff.isSuperuser) {
      throw forbidden("You can only revoke your own keys.");
    }
    await ctx.db.delete(id);
  },
});
