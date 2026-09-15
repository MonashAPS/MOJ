/**
 * The legacy DMOJ API token: `/accounts/api/token/generate/` and the check the
 * problems API runs when a caller presents one. Keys minted by Better Auth's
 * api-key plugin live in Postgres; this is only the token DMOJ kept on the
 * profile, which stays valid until its owner revokes it.
 */

import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireViewer } from "../lib/auth";

export type ApiTokenInfo = {
  /** A legacy DMOJ token is still on the account and still works. */
  hasLegacyToken: boolean;
  /** Keys minted by Better Auth's api-key plugin live in Postgres, not here. */
  legacyTokenHint: string | null;
};

/**
 * `/accounts/api/token/generate/`. New tokens come from Better Auth's api-key
 * plugin in the web layer; this only reports on the imported DMOJ token, which
 * the API still accepts until the user replaces it.
 */
export const mine = query({
  args: {},
  handler: async (ctx): Promise<ApiTokenInfo> => {
    const profile = await requireViewer(ctx);
    return {
      hasLegacyToken: !!profile.legacyApiTokenHash,
      legacyTokenHint: profile.legacyApiTokenHash ? `${profile.legacyApiTokenHash.slice(0, 8)}...` : null,
    };
  },
});

/**
 * The legacy DMOJ Bearer token, checked from the API layer.
 *
 * DMOJ's token is `base64url(struct.pack('>I32s', user_id, secret))` and the
 * profile stores `hmac_sha256(SECRET_KEY, secret).hexdigest()`
 * (judge/models/profile.py:269, judge/middleware.py:117). The web layer decodes
 * the token and computes the digest with `LEGACY_SECRET_KEY`; this compares it
 * against the stored hash without ever handing the hash out.
 */
export const verifyLegacy = query({
  args: { legacyUserId: v.number(), digest: v.string() },
  handler: async (
    ctx,
    { legacyUserId, digest },
  ): Promise<{ userId: string; username: string; isStaff: boolean } | null> => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_legacyUserId", (q) => q.eq("legacyUserId", legacyUserId))
      .unique();
    if (!profile?.legacyApiTokenHash) return null;
    if (profile.isActive === false) return null;
    if (!constantTimeEquals(profile.legacyApiTokenHash, digest)) return null;
    return {
      userId: profile.userId,
      username: profile.username,
      isStaff: profile.isStaff || profile.isSuperuser,
    };
  },
});

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

/** `remove_api_token`. */
export const revokeLegacy = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await requireViewer(ctx);
    await ctx.db.patch(profile._id, { legacyApiTokenHash: undefined });
    return true;
  },
});

/** Used by the import tool and by the token page after a rotation. */
export const setLegacyHash = internalMutation({
  args: { profileId: v.id("profiles"), hash: v.optional(v.string()) },
  handler: async (ctx, { profileId, hash }) => {
    await ctx.db.patch(profileId, { legacyApiTokenHash: hash });
  },
});
