/**
 * Reads and writes the part-2 console pages need on top of `convex/admin/*`:
 * the generic revision history every edit form shows, the profile fields
 * `admin/users.edit` does not carry (preferred language, organisation
 * membership), the cross-organisation class and join-request overviews, and
 * the `apiKeys` rows the problems API verifies a key against when Better Auth
 * is not reachable from the Convex container.
 */

import { API_SCOPES, isApiScope } from "@moj/protocol";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "../_generated/server";
import { requireStaff, requireSuperuser } from "../lib/auth";
import { forbidden, invalid, notFound } from "../lib/errors";
import { themeDefault } from "../schema";

const CHANGE_PROFILE = "judge.change_profile";

async function requireProfileAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<"profiles">> {
  const staff = await requireStaff(ctx);
  if (!staff.isSuperuser && !staff.permissions.includes(CHANGE_PROFILE)) {
    throw forbidden(`Missing permission ${CHANGE_PROFILE}.`);
  }
  return staff;
}

export type ConsoleRevision = {
  _id: Id<"revisions">;
  createdAt: number;
  reason: string;
  author: string | null;
};

/** Newest first, so the panel reads as a changelog. */
export const revisions = query({
  args: {
    entityType: v.string(),
    entityId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConsoleRevision[]> => {
    await requireStaff(ctx);
    const rows = await ctx.db
      .query("revisions")
      .withIndex("by_entity", (q) => q.eq("entityType", args.entityType).eq("entityId", args.entityId))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);

    const limited = rows.slice(0, Math.max(1, Math.min(args.limit ?? 25, 200)));
    const out: ConsoleRevision[] = [];
    for (const row of limited) {
      const author = row.authorProfileId ? await ctx.db.get(row.authorProfileId) : null;
      out.push({
        _id: row._id,
        createdAt: row.createdAt,
        reason: row.reason,
        author: author ? author.usernameDisplayOverride || author.username : null,
      });
    }
    return out;
  },
});

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export type UserExtras = {
  username: string;
  about: string;
  usernameDisplayOverride: string;
  languageKey: string | null;
  organizationSlugs: string[];
  apiKeys: ConsoleApiKey[];
  revisions: ConsoleRevision[];
};

/** The user editor's fields that `admin/users.get` does not carry. */
export const userExtras = query({
  args: { username: v.string() },
  handler: async (ctx, { username }): Promise<UserExtras | null> => {
    await requireProfileAdmin(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile) return null;

    const language = profile.languageId ? await ctx.db.get(profile.languageId) : null;
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();
    const organizationSlugs: string[] = [];
    for (const membership of memberships) {
      const organization = await ctx.db.get(membership.organizationId);
      if (organization) organizationSlugs.push(organization.slug);
    }

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();
    keys.sort((a, b) => b.createdAt - a.createdAt);

    const history = await ctx.db
      .query("revisions")
      .withIndex("by_entity", (q) => q.eq("entityType", "profiles").eq("entityId", profile._id))
      .collect();
    history.sort((a, b) => b.createdAt - a.createdAt);
    const revisionRows: ConsoleRevision[] = [];
    for (const row of history.slice(0, 25)) {
      const author = row.authorProfileId ? await ctx.db.get(row.authorProfileId) : null;
      revisionRows.push({
        _id: row._id,
        createdAt: row.createdAt,
        reason: row.reason,
        author: author ? author.usernameDisplayOverride || author.username : null,
      });
    }

    return {
      username: profile.username,
      about: profile.about,
      usernameDisplayOverride: profile.usernameDisplayOverride ?? "",
      languageKey: language?.key ?? null,
      organizationSlugs: organizationSlugs.sort((a, b) => a.localeCompare(b)),
      apiKeys: keys.map(toApiKeyRow),
      revisions: revisionRows,
    };
  },
});

/**
 * The two profile fields `admin/users.edit` leaves alone, because they are not
 * plain columns: the preferred language is a foreign key and organisation
 * membership is a join table with a denormalised count.
 */
export const setUserMemberships = mutation({
  args: {
    username: v.string(),
    languageKey: v.optional(v.union(v.string(), v.null())),
    organizationSlugs: v.optional(v.array(v.string())),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requireProfileAdmin(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
    if (!profile) throw notFound("User");
    if (profile.isSuperuser && !staff.isSuperuser) {
      throw forbidden("Only superusers may edit a superuser.");
    }

    if (args.languageKey !== undefined) {
      if (args.languageKey === null) {
        await ctx.db.patch(profile._id, { languageId: undefined });
      } else {
        const language = await ctx.db
          .query("languages")
          .withIndex("by_key", (q) => q.eq("key", args.languageKey as string))
          .unique();
        if (!language) throw invalid(`There is no language with the identifier ${args.languageKey}.`);
        await ctx.db.patch(profile._id, { languageId: language._id });
      }
    }

    if (args.organizationSlugs !== undefined) {
      const wanted = new Map<Id<"organizations">, Doc<"organizations">>();
      for (const slug of args.organizationSlugs) {
        const organization = await ctx.db
          .query("organizations")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .unique();
        if (!organization) throw notFound(`Organization ${slug}`);
        wanted.set(organization._id, organization);
      }

      const existing = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
        .collect();
      const have = new Set(existing.map((row) => row.organizationId));

      for (const membership of existing) {
        if (wanted.has(membership.organizationId)) continue;
        const organization = await ctx.db.get(membership.organizationId);
        if (organization) {
          await ctx.db.patch(organization._id, {
            memberCount: Math.max(0, organization.memberCount - 1),
          });
        }
        await ctx.db.delete(membership._id);
      }
      for (const [organizationId, organization] of wanted) {
        if (have.has(organizationId)) continue;
        await ctx.db.insert("organizationMemberships", {
          organizationId,
          profileId: profile._id,
          order: organization.memberCount,
        });
        await ctx.db.patch(organizationId, { memberCount: organization.memberCount + 1 });
      }
    }

    const updated = await ctx.db.get(profile._id);
    await ctx.db.insert("revisions", {
      entityType: "profiles",
      entityId: profile._id,
      snapshot: updated,
      authorProfileId: staff._id,
      reason: args.reason ?? "Edited from admin",
      createdAt: Date.now(),
    });
    return profile._id;
  },
});

/** Removes the profile side of a two-factor reset; Better Auth owns the rest. */
export const clearLegacyApiToken = mutation({
  args: { username: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const staff = await requireProfileAdmin(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
    if (!profile) throw notFound("User");
    await ctx.db.patch(profile._id, { legacyApiTokenHash: undefined });
    await ctx.db.insert("revisions", {
      entityType: "profiles",
      entityId: profile._id,
      snapshot: await ctx.db.get(profile._id),
      authorProfileId: staff._id,
      reason: args.reason ?? "Revoked the legacy API token",
      createdAt: Date.now(),
    });
  },
});

/* -------------------------------------------------------------------------- */
/* API keys                                                                   */
/* -------------------------------------------------------------------------- */

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

function toApiKeyRow(row: Doc<"apiKeys">): ConsoleApiKey {
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
export const myApiKeys = query({
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
export const recordApiKey = mutation({
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
export const revokeApiKey = mutation({
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

/* -------------------------------------------------------------------------- */
/* Branding (SPEC section 24)                                                 */
/* -------------------------------------------------------------------------- */

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The console posts the file straight to this URL; only the id comes back. */
export const generateBrandingUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    await requireSuperuser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Rebranding without a deploy. Every field is optional and clearing one (an
 * empty string, or `null` for an upload) puts the design system's own value
 * back, so `tokens.css` stays the source of the defaults.
 */
export const updateBranding = mutation({
  args: {
    siteName: v.optional(v.string()),
    siteLongName: v.optional(v.string()),
    logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    faviconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    accentColor: v.optional(v.string()),
    navColor: v.optional(v.string()),
    customCss: v.optional(v.string()),
    themeDefault: v.optional(themeDefault),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const editor = await requireSuperuser(ctx);
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
      .unique();
    if (!existing) throw notFound("Site settings");

    const patch: Record<string, unknown> = {};
    if (args.siteName !== undefined) {
      const name = args.siteName.trim();
      if (name.length === 0) throw invalid("The site needs a name.");
      if (name.length > 40) throw invalid("Site names are limited to 40 characters.");
      patch.siteName = name;
    }
    if (args.siteLongName !== undefined) {
      const name = args.siteLongName.trim();
      if (name.length === 0) throw invalid("The site needs a long name.");
      patch.siteLongName = name;
    }
    for (const [key, value] of [
      ["accentColor", args.accentColor],
      ["navColor", args.navColor],
    ] as const) {
      if (value === undefined) continue;
      const trimmed = value.trim();
      if (trimmed === "") {
        patch[key] = undefined;
        continue;
      }
      if (!HEX.test(trimmed)) throw invalid("A colour must be a hex value like #2941a5.");
      patch[key] = trimmed.toLowerCase();
    }
    if (args.customCss !== undefined) {
      if (args.customCss.length > 20_000) throw invalid("That is more custom CSS than the page will carry.");
      patch.customCss = args.customCss || undefined;
    }
    if (args.themeDefault !== undefined) patch.themeDefault = args.themeDefault;

    // A replaced upload is deleted, so the storage does not fill with old logos.
    if (args.logoStorageId !== undefined) {
      if (existing.logoStorageId && existing.logoStorageId !== args.logoStorageId) {
        await ctx.storage.delete(existing.logoStorageId);
      }
      patch.logoStorageId = args.logoStorageId ?? undefined;
    }
    if (args.faviconStorageId !== undefined) {
      if (existing.faviconStorageId && existing.faviconStorageId !== args.faviconStorageId) {
        await ctx.storage.delete(existing.faviconStorageId);
      }
      patch.faviconStorageId = args.faviconStorageId ?? undefined;
    }

    await ctx.db.insert("revisions", {
      entityType: "siteSettings",
      entityId: existing._id,
      snapshot: existing,
      authorProfileId: editor._id,
      reason: args.reason ?? "Edited the branding",
      createdAt: Date.now(),
    });
    await ctx.db.patch(existing._id, patch);
  },
});
