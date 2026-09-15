/**
 * Classes inside an organisation: `/organization/[pk]-[slug]/class/[cpk]-[cslug]`.
 *
 * Ports `ClassHome` and `RequestJoinClass` from judge/views/organization.py and
 * the `Class` model rules from judge/models/profile.py. Joining with an access
 * code is DMOJ's `Class.access_code` field, which an organisation uses instead of a
 * request when a tutor hands the code out in a lab.
 */

import { organizationCanEdit, ranker } from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { optionalViewer, requireViewer } from "./lib/auth";
import { forbidden, invalid, notFound } from "./lib/errors";
import { asOrganizationRow, asViewerRow, organizationBySlug } from "./organizations";
import { usernamesToIds } from "./profiles";
import { type LeaderboardRow, userSort } from "./rankings";

async function classBySlug(
  ctx: QueryCtx,
  organizationSlug: string,
  classSlug: string,
): Promise<{ organization: Doc<"organizations">; klass: Doc<"classes"> } | null> {
  const organization = await organizationBySlug(ctx, organizationSlug);

  if (!organization) return null;

  const klass = await ctx.db
    .query("classes")
    .withIndex("by_organization_slug", (q) => q.eq("organizationId", organization._id).eq("slug", classSlug))
    .unique();

  if (!klass) return null;

  return { organization, klass };
}

async function requireClass(
  ctx: QueryCtx,
  organizationSlug: string,
  classSlug: string,
): Promise<{ organization: Doc<"organizations">; klass: Doc<"classes"> }> {
  const found = await classBySlug(ctx, organizationSlug, classSlug);

  if (!found) throw notFound("Class");

  return found;
}

/** Organisation admins and the class's own admins may manage a class. */
function canManage(
  organization: Doc<"organizations">,
  klass: Doc<"classes">,
  profile: Doc<"profiles"> | null,
): boolean {
  if (!profile) return false;

  if (profile.isSuperuser || profile.permissions.includes("judge.edit_all_organization")) return true;

  if (organizationCanEdit(asOrganizationRow(organization), asViewerRow(profile))) return true;

  return klass.adminProfileIds.includes(profile._id);
}

export type ClassMemberRow = LeaderboardRow;

export type ClassDetail = {
  _id: Id<"classes">;
  name: string;
  slug: string;
  legacyId?: number;
  description: string;
  isActive: boolean;
  requiresAccessCode: boolean;
  organization: {
    _id: Id<"organizations">;
    slug: string;
    legacyId?: number;
    name: string;
    logoOverrideImage?: string;
  };
  admins: { _id: Id<"profiles">; username: string; displayName: string }[];
  memberCount: number;
  viewer: {
    isMember: boolean;
    isOrganizationMember: boolean;
    canManage: boolean;
    canJoin: boolean;
  };
};

export const get = query({
  args: { organizationSlug: v.string(), classSlug: v.string() },
  handler: async (ctx, args): Promise<ClassDetail | null> => {
    const found = await classBySlug(ctx, args.organizationSlug, args.classSlug);

    if (!found) return null;
    const { organization, klass } = found;
    const profile = await optionalViewer(ctx);

    const admins: ClassDetail["admins"] = [];

    for (const adminId of klass.adminProfileIds) {
      const admin = await ctx.db.get(adminId);

      if (!admin) continue;
      admins.push({
        _id: admin._id,
        username: admin.username,
        displayName: admin.usernameDisplayOverride || admin.username,
      });
    }

    let isOrganizationMember = false;

    if (profile) {
      const memberships = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
        .collect();

      isOrganizationMember = memberships.some((row) => row.organizationId === organization._id);
    }

    const isMember = !!profile && klass.memberProfileIds.includes(profile._id);

    return {
      _id: klass._id,
      name: klass.name,
      slug: klass.slug,
      legacyId: klass.legacyId,
      description: klass.description ?? "",
      isActive: klass.isActive,
      requiresAccessCode: !!klass.accessCode,
      organization: {
        _id: organization._id,
        slug: organization.slug,
        legacyId: organization.legacyId,
        name: organization.name,
        logoOverrideImage: organization.logoOverrideImage,
      },
      admins,
      memberCount: klass.memberProfileIds.length,
      viewer: {
        isMember,
        isOrganizationMember,
        canManage: canManage(organization, klass, profile),
        canJoin: !!profile && !isMember && klass.isActive && isOrganizationMember,
      },
    };
  },
});

/** `ClassHome`: members ranked, same shape as the organisation member list. */
export const members = query({
  args: {
    organizationSlug: v.string(),
    classSlug: v.string(),
    sort: v.optional(userSort),
    descending: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ClassMemberRow[]> => {
    const found = await classBySlug(ctx, args.organizationSlug, args.classSlug);

    if (!found) return [];
    const sort = args.sort ?? "performancePoints";
    const descending = args.descending ?? true;

    const rows: Doc<"profiles">[] = [];

    for (const profileId of found.klass.memberProfileIds) {
      const member = await ctx.db.get(profileId);

      if (member && !member.isUnlisted) rows.push(member);
    }

    const value = (member: Doc<"profiles">): number => {
      switch (sort) {
        case "problemCount":
          return member.problemCount;
        case "rating":
          return member.rating ?? Number.NEGATIVE_INFINITY;
        case "points":
          return member.points;
        default:
          return member.performancePoints;
      }
    };

    rows.sort((a, b) => {
      const delta = value(a) - value(b);

      if (delta !== 0) return descending ? -delta : delta;

      return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
    });

    return ranker(rows, (member) => member.points).map(({ rank, item }) => ({
      _id: item._id,
      username: item.username,
      displayName: item.usernameDisplayOverride || item.username,
      displayRank: item.displayRank,
      points: item.points,
      performancePoints: item.performancePoints,
      problemCount: item.problemCount,
      rating: item.rating,
      rank,
    }));
  },
});

/**
 * Join with the class access code. `RequestJoinClass` bounces anyone who is not
 * already in the organisation to the organisation's own request page, so the
 * same rule applies here.
 */
export const join = mutation({
  args: { organizationSlug: v.string(), classSlug: v.string(), accessCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);
    const { organization, klass } = await requireClass(ctx, args.organizationSlug, args.classSlug);

    if (!klass.isActive) throw invalid("That class is not accepting members.");

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();

    if (!memberships.some((row) => row.organizationId === organization._id)) {
      throw forbidden(`You must join ${organization.name} first.`);
    }

    if (klass.memberProfileIds.includes(profile._id)) {
      throw invalid("You are already in that class.");
    }

    if (!klass.accessCode) {
      throw forbidden("This class does not accept access codes; ask to join instead.");
    }

    if (args.accessCode !== klass.accessCode) {
      throw forbidden("That access code is not correct.");
    }

    await ctx.db.patch(klass._id, {
      memberProfileIds: [...klass.memberProfileIds, profile._id],
    });

    return klass._id;
  },
});

export const leave = mutation({
  args: { organizationSlug: v.string(), classSlug: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);
    const { klass } = await requireClass(ctx, args.organizationSlug, args.classSlug);

    if (!klass.memberProfileIds.includes(profile._id)) throw invalid("You are not in that class.");
    await ctx.db.patch(klass._id, {
      memberProfileIds: klass.memberProfileIds.filter((id) => id !== profile._id),
    });

    return klass._id;
  },
});

/* -------------------------------------------------------------------------- */
/* Administration                                                             */
/* -------------------------------------------------------------------------- */

export const create = mutation({
  args: {
    organizationSlug: v.string(),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    accessCode: v.optional(v.string()),
    adminUsernames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);
    const organization = await organizationBySlug(ctx, args.organizationSlug);

    if (!organization) throw notFound("Organization");

    if (!organizationCanEdit(asOrganizationRow(organization), asViewerRow(profile))) {
      if (!profile.isSuperuser && !profile.permissions.includes("judge.edit_all_organization")) {
        throw forbidden("You are not allowed to edit this organization.");
      }
    }

    const existing = await ctx.db
      .query("classes")
      .withIndex("by_organization_slug", (q) =>
        q.eq("organizationId", organization._id).eq("slug", args.slug),
      )
      .unique();

    if (existing) throw invalid("A class with that slug already exists.");

    return await ctx.db.insert("classes", {
      organizationId: organization._id,
      name: args.name,
      slug: args.slug,
      description: args.description ?? "",
      isActive: args.isActive ?? true,
      accessCode: args.accessCode || undefined,
      adminProfileIds: args.adminUsernames ? await usernamesToIds(ctx, args.adminUsernames) : [profile._id],
      memberProfileIds: [],
    });
  },
});

export const update = mutation({
  args: {
    organizationSlug: v.string(),
    classSlug: v.string(),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    accessCode: v.optional(v.string()),
    adminUsernames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);
    const { organization, klass } = await requireClass(ctx, args.organizationSlug, args.classSlug);

    if (!canManage(organization, klass, profile)) throw forbidden();

    const patch: Partial<Doc<"classes">> = {};

    if (args.name !== undefined) patch.name = args.name;

    if (args.slug !== undefined) patch.slug = args.slug;

    if (args.description !== undefined) patch.description = args.description;

    if (args.isActive !== undefined) patch.isActive = args.isActive;

    if (args.accessCode !== undefined) patch.accessCode = args.accessCode || undefined;

    if (args.adminUsernames !== undefined) {
      patch.adminProfileIds = await usernamesToIds(ctx, args.adminUsernames);
    }

    await ctx.db.patch(klass._id, patch);

    return klass._id;
  },
});

export const setMembers = mutation({
  args: {
    organizationSlug: v.string(),
    classSlug: v.string(),
    usernames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);
    const { organization, klass } = await requireClass(ctx, args.organizationSlug, args.classSlug);

    if (!canManage(organization, klass, profile)) throw forbidden();
    const ids = await usernamesToIds(ctx, args.usernames);
    await ctx.db.patch(klass._id, { memberProfileIds: ids });

    return klass._id;
  },
});

export const remove = mutation({
  args: { organizationSlug: v.string(), classSlug: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);
    const { organization, klass } = await requireClass(ctx, args.organizationSlug, args.classSlug);

    if (!organizationCanEdit(asOrganizationRow(organization), asViewerRow(profile))) {
      if (!profile.isSuperuser && !profile.permissions.includes("judge.edit_all_organization")) {
        throw forbidden();
      }
    }

    // Join requests pointing at this class would dangle otherwise.
    const requests = await ctx.db
      .query("organizationRequests")
      .withIndex("by_organization_state", (q) => q.eq("organizationId", organization._id).eq("state", "P"))
      .collect();

    for (const entry of requests) {
      if (entry.classId === klass._id) await ctx.db.patch(entry._id, { classId: undefined });
    }

    await ctx.db.delete(klass._id);

    return true;
  },
});

/** The organisation's class list, for the join-request form's picker. */
export const listForOrganization = query({
  args: { organizationSlug: v.string(), activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const organization = await organizationBySlug(ctx, args.organizationSlug);

    if (!organization) return [];

    const rows = await ctx.db
      .query("classes")
      .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
      .collect();

    return rows
      .filter((klass) => (args.activeOnly === false ? true : klass.isActive))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((klass) => ({
        _id: klass._id,
        name: klass.name,
        slug: klass.slug,
        isActive: klass.isActive,
        memberCount: klass.memberProfileIds.length,
        requiresAccessCode: !!klass.accessCode,
      }));
  },
});
