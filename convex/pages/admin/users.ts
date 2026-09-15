/**
 * The user editor's fields `convex/admin/users.ts` does not carry, because they
 * are not plain columns: the preferred language is a foreign key, organisation
 * membership is a join table with a denormalised count, and the API keys and
 * revisions come from tables of their own.
 */

import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { mutation, query } from "../../_generated/server";
import { requireProfileAdmin } from "../../admin/users";
import { forbidden, invalid, notFound } from "../../lib/errors";
import { type ConsoleApiKey, toApiKeyRow } from "./apiKeys";
import type { ConsoleRevision } from "./revisions";

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
export const extras = query({
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
export const setMemberships = mutation({
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

    const languageKey = args.languageKey;

    if (languageKey !== undefined) {
      if (languageKey === null) {
        await ctx.db.patch(profile._id, { languageId: undefined });
      } else {
        const language = await ctx.db
          .query("languages")
          .withIndex("by_key", (q) => q.eq("key", languageKey))
          .first();

        if (!language) throw invalid(`There is no language with the identifier ${languageKey}.`);
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
