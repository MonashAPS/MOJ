/**
 * `/admin` organisations section: judge/admin/organization.py.
 *
 * `judge.change_organization` plus either `judge.edit_all_organization` or
 * being an admin of the organisation, exactly as `organizationIsEditableBy`
 * in `@moj/core` states it. Creation and deletion are `edit_all_organization`
 * only, because a new organisation has no admins to check against.
 */

import { organizationIsEditableBy } from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "./../_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./../_generated/server";
import { requireStaff } from "./../lib/auth";
import { forbidden, invalid, notFound } from "./../lib/errors";

const CHANGE = "judge.change_organization";
const EDIT_ALL = "judge.edit_all_organization";

function asViewerRow(profile: Doc<"profiles">) {
  return {
    id: profile._id,
    username: profile.username,
    isStaff: profile.isStaff,
    isSuperuser: profile.isSuperuser,
    permissions: profile.permissions,
  };
}

function asOrganizationRow(organization: Doc<"organizations">) {
  return {
    id: organization._id,
    slug: organization.slug,
    name: organization.name,
    adminProfileIds: organization.adminProfileIds,
    isOpen: organization.isOpen,
    classRequired: organization.classRequired,
  };
}

async function requireOrganizationAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<"profiles">> {
  const staff = await requireStaff(ctx);
  if (!staff.isSuperuser && !staff.permissions.includes(CHANGE)) {
    throw forbidden(`Missing permission ${CHANGE}.`);
  }
  return staff;
}

function requireEditAll(staff: Doc<"profiles">): void {
  if (!staff.isSuperuser && !staff.permissions.includes(EDIT_ALL)) {
    throw forbidden(`Missing permission ${EDIT_ALL}.`);
  }
}

export type AdminOrganizationRow = {
  _id: Id<"organizations">;
  name: string;
  slug: string;
  shortName: string;
  about: string;
  isOpen: boolean;
  slots: number | null;
  accessCode: string | null;
  classRequired: boolean;
  logoOverrideImage?: string;
  memberCount: number;
  adminUsernames: string[];
  classCount: number;
  pendingRequests: number;
  canEdit: boolean;
};

async function toRow(
  ctx: QueryCtx,
  organization: Doc<"organizations">,
  staff: Doc<"profiles">,
): Promise<AdminOrganizationRow> {
  const adminUsernames: string[] = [];
  for (const adminId of organization.adminProfileIds) {
    const admin = await ctx.db.get(adminId);
    if (admin) adminUsernames.push(admin.username);
  }
  const classes = await ctx.db
    .query("classes")
    .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
    .collect();
  const pending = await ctx.db
    .query("organizationRequests")
    .withIndex("by_organization_state", (q) => q.eq("organizationId", organization._id).eq("state", "P"))
    .collect();

  return {
    _id: organization._id,
    name: organization.name,
    slug: organization.slug,
    shortName: organization.shortName,
    about: organization.about,
    isOpen: organization.isOpen,
    slots: organization.slots ?? null,
    accessCode: organization.accessCode ?? null,
    classRequired: organization.classRequired,
    logoOverrideImage: organization.logoOverrideImage,
    memberCount: organization.memberCount,
    adminUsernames,
    classCount: classes.length,
    pendingRequests: pending.length,
    canEdit: organizationIsEditableBy(asOrganizationRow(organization), asViewerRow(staff)),
  };
}

export const list = query({
  args: { search: v.optional(v.string()), isOpen: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<AdminOrganizationRow[]> => {
    const staff = await requireOrganizationAdmin(ctx);
    const search = args.search?.trim();
    const organizations = search
      ? await ctx.db
          .query("organizations")
          .withSearchIndex("search_name", (q) => q.search("name", search))
          .take(200)
      : await ctx.db.query("organizations").collect();

    const filtered = organizations
      .filter((organization) => args.isOpen === undefined || organization.isOpen === args.isOpen)
      .sort((a, b) => a.name.localeCompare(b.name));

    const rows: AdminOrganizationRow[] = [];
    for (const organization of filtered) rows.push(await toRow(ctx, organization, staff));
    return rows;
  },
});

export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<AdminOrganizationRow | null> => {
    const staff = await requireOrganizationAdmin(ctx);
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    return organization ? await toRow(ctx, organization, staff) : null;
  },
});

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw invalid("A slug is lowercase letters, digits and hyphens.");
  }
  if (slug.length > 128) throw invalid("That slug is too long.");
}

async function usernamesToIds(ctx: MutationCtx, usernames: readonly string[]): Promise<Id<"profiles">[]> {
  const ids: Id<"profiles">[] = [];
  for (const username of usernames) {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile) throw notFound(`User ${username}`);
    ids.push(profile._id);
  }
  return ids;
}

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    shortName: v.string(),
    about: v.optional(v.string()),
    isOpen: v.optional(v.boolean()),
    slots: v.optional(v.union(v.number(), v.null())),
    accessCode: v.optional(v.string()),
    classRequired: v.optional(v.boolean()),
    logoOverrideImage: v.optional(v.string()),
    adminUsernames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requireOrganizationAdmin(ctx);
    requireEditAll(staff);
    validateSlug(args.slug);

    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) throw invalid("An organization with that slug already exists.");

    const isOpen = args.isOpen ?? true;
    const classRequired = args.classRequired ?? false;
    // `Organization.clean`.
    if (classRequired && isOpen) {
      throw invalid("Class membership cannot be enforced when organization has open enrollment.");
    }
    if (args.shortName.length > 20) throw invalid("A short name is at most 20 characters.");
    if (args.accessCode && args.accessCode.length > 7) {
      throw invalid("An access code is at most 7 characters.");
    }

    const adminProfileIds = await usernamesToIds(ctx, args.adminUsernames);
    if (adminProfileIds.length === 0) {
      throw invalid("An organization needs at least one administrator.");
    }

    return await ctx.db.insert("organizations", {
      name: args.name,
      slug: args.slug,
      shortName: args.shortName,
      about: args.about ?? "",
      adminProfileIds,
      isOpen,
      slots: args.slots === null ? undefined : args.slots,
      accessCode: args.accessCode || undefined,
      logoOverrideImage: args.logoOverrideImage || undefined,
      classRequired,
      memberCount: 0,
    });
  },
});

export const update = mutation({
  args: {
    slug: v.string(),
    name: v.optional(v.string()),
    newSlug: v.optional(v.string()),
    shortName: v.optional(v.string()),
    about: v.optional(v.string()),
    isOpen: v.optional(v.boolean()),
    slots: v.optional(v.union(v.number(), v.null())),
    accessCode: v.optional(v.union(v.string(), v.null())),
    classRequired: v.optional(v.boolean()),
    logoOverrideImage: v.optional(v.string()),
    adminUsernames: v.optional(v.array(v.string())),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requireOrganizationAdmin(ctx);
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!organization) throw notFound("Organization");
    if (!organizationIsEditableBy(asOrganizationRow(organization), asViewerRow(staff))) {
      throw forbidden("You are not allowed to edit this organization.");
    }

    const patch: Partial<Doc<"organizations">> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.newSlug !== undefined && args.newSlug !== organization.slug) {
      validateSlug(args.newSlug);
      const clash = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", args.newSlug as string))
        .unique();
      if (clash) throw invalid("An organization with that slug already exists.");
      patch.slug = args.newSlug;
    }
    if (args.shortName !== undefined) {
      if (args.shortName.length > 20) throw invalid("A short name is at most 20 characters.");
      patch.shortName = args.shortName;
    }
    if (args.about !== undefined) patch.about = args.about;
    if (args.isOpen !== undefined) patch.isOpen = args.isOpen;
    if (args.slots !== undefined) patch.slots = args.slots === null ? undefined : args.slots;
    if (args.accessCode !== undefined) {
      if (args.accessCode && args.accessCode.length > 7) {
        throw invalid("An access code is at most 7 characters.");
      }
      patch.accessCode = args.accessCode || undefined;
    }
    if (args.classRequired !== undefined) patch.classRequired = args.classRequired;
    if (args.logoOverrideImage !== undefined) {
      patch.logoOverrideImage = args.logoOverrideImage || undefined;
    }
    if (args.adminUsernames !== undefined) {
      const adminProfileIds = await usernamesToIds(ctx, args.adminUsernames);
      if (adminProfileIds.length === 0) {
        throw invalid("An organization needs at least one administrator.");
      }
      patch.adminProfileIds = adminProfileIds;
    }

    const isOpen = patch.isOpen ?? organization.isOpen;
    const classRequired = patch.classRequired ?? organization.classRequired;
    if (classRequired && isOpen) {
      throw invalid("Class membership cannot be enforced when organization has open enrollment.");
    }

    await ctx.db.patch(organization._id, patch);
    await ctx.db.insert("revisions", {
      entityType: "organizations",
      entityId: organization._id,
      snapshot: { ...organization, ...patch },
      authorProfileId: staff._id,
      reason: args.reason ?? "Edited from admin",
      createdAt: Date.now(),
    });
    return organization._id;
  },
});

export const remove = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const staff = await requireOrganizationAdmin(ctx);
    requireEditAll(staff);
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!organization) throw notFound("Organization");

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
      .collect();
    for (const membership of memberships) await ctx.db.delete(membership._id);

    const classes = await ctx.db
      .query("classes")
      .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
      .collect();
    for (const klass of classes) await ctx.db.delete(klass._id);

    for (const state of ["P", "A", "R"] as const) {
      const requests = await ctx.db
        .query("organizationRequests")
        .withIndex("by_organization_state", (q) =>
          q.eq("organizationId", organization._id).eq("state", state),
        )
        .collect();
      for (const entry of requests) await ctx.db.delete(entry._id);
    }

    await ctx.db.delete(organization._id);
    return true;
  },
});

/** Recount `memberCount` from the membership rows, for after an import. */
export const recountMembers = mutation({
  args: {},
  handler: async (ctx) => {
    const staff = await requireOrganizationAdmin(ctx);
    requireEditAll(staff);
    const organizations = await ctx.db.query("organizations").collect();
    let fixed = 0;
    for (const organization of organizations) {
      const memberships = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
        .collect();
      if (memberships.length !== organization.memberCount) {
        await ctx.db.patch(organization._id, { memberCount: memberships.length });
        fixed += 1;
      }
    }
    return fixed;
  },
});
