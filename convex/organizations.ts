/**
 * Organisations: `/organizations/` and `/organization/[pk]-[slug]/...`.
 *
 * Ports judge/views/organization.py (`OrganizationList`, `OrganizationHome`,
 * `OrganizationUsers`, `JoinOrganization`, `LeaveOrganization`,
 * `RequestJoinOrganization`, `OrganizationRequestView`,
 * `OrganizationRequestLog`, `EditOrganization`, `KickUserWidgetView`). Every
 * rule comes from `@moj/core`; nothing is re-derived here.
 *
 * `about` is returned as markdown source with the preset the page renders it
 * under, because `@moj/content` cannot run inside a Convex isolate.
 */

import {
  organizationCanEdit,
  organizationCanReviewAllRequests,
  organizationCanReviewClassRequests,
  ranker,
} from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { optionalViewer, requireViewer } from "./lib/auth";
import { forbidden, invalid, notFound } from "./lib/errors";
import { bumpMemberCount, MAX_OPEN_ORGANIZATIONS } from "./profiles";
import { type LeaderboardRow, userSort } from "./rankings";

/** `OrganizationUsers.paginate_by`. */
export const MEMBERS_PER_PAGE = 100;

export const requestState = v.union(v.literal("P"), v.literal("A"), v.literal("R"));

type OrganizationRow = {
  id: string;
  slug?: string;
  name?: string;
  adminProfileIds?: readonly string[];
  isOpen?: boolean;
  classRequired?: boolean;
};

type ViewerRow = {
  id: string;
  username: string;
  isStaff: boolean;
  isSuperuser: boolean;
  permissions: readonly string[];
} | null;

export function asOrganizationRow(organization: Doc<"organizations">): OrganizationRow {
  return {
    id: organization._id,
    slug: organization.slug,
    name: organization.name,
    adminProfileIds: organization.adminProfileIds,
    isOpen: organization.isOpen,
    classRequired: organization.classRequired,
  };
}

export function asViewerRow(profile: Doc<"profiles"> | null): ViewerRow {
  if (!profile) return null;

  return {
    id: profile._id,
    username: profile.username,
    isStaff: profile.isStaff,
    isSuperuser: profile.isSuperuser,
    permissions: profile.permissions,
  };
}

function asClassRow(klass: Doc<"classes">) {
  return {
    id: klass._id,
    organizationId: klass.organizationId,
    isActive: klass.isActive,
    adminProfileIds: klass.adminProfileIds,
    memberProfileIds: klass.memberProfileIds,
  };
}

export async function organizationBySlug(ctx: QueryCtx, slug: string): Promise<Doc<"organizations"> | null> {
  return await ctx.db
    .query("organizations")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

async function membership(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  profileId: Id<"profiles">,
): Promise<Doc<"organizationMemberships"> | null> {
  const rows = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_profile", (q) => q.eq("profileId", profileId))
    .collect();

  return rows.find((row) => row.organizationId === organizationId) ?? null;
}

async function openOrganizationCount(ctx: QueryCtx, profileId: Id<"profiles">): Promise<number> {
  const rows = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_profile", (q) => q.eq("profileId", profileId))
    .collect();

  let count = 0;

  for (const row of rows) {
    const organization = await ctx.db.get(row.organizationId);

    if (organization?.isOpen) count += 1;
  }

  return count;
}

async function organizationClasses(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
): Promise<Doc<"classes">[]> {
  return await ctx.db
    .query("classes")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export type OrganizationListRow = {
  _id: Id<"organizations">;
  slug: string;
  /** DMOJ's primary key, which its URLs carry as `<pk>-<slug>`. */
  legacyId?: number;
  name: string;
  shortName: string;
  isOpen: boolean;
  memberCount: number;
  logoOverrideImage?: string;
  viewerIsMember: boolean;
};

/** `OrganizationList`: every organisation with its member count, by name. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<OrganizationListRow[]> => {
    const viewer = await optionalViewer(ctx);
    const mine = new Set<Id<"organizations">>();

    if (viewer) {
      const rows = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_profile", (q) => q.eq("profileId", viewer._id))
        .collect();

      for (const row of rows) mine.add(row.organizationId);
    }

    const organizations = await ctx.db.query("organizations").collect();

    return organizations
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((organization) => ({
        _id: organization._id,
        slug: organization.slug,
        legacyId: organization.legacyId,
        name: organization.name,
        shortName: organization.shortName,
        isOpen: organization.isOpen,
        memberCount: organization.memberCount,
        logoOverrideImage: organization.logoOverrideImage,
        viewerIsMember: mine.has(organization._id),
      }));
  },
});

export type OrganizationDetail = {
  _id: Id<"organizations">;
  slug: string;
  legacyId?: number;
  name: string;
  shortName: string;
  about: string;
  aboutPreset: "organization-about";
  isOpen: boolean;
  slots: number | null;
  memberCount: number;
  classRequired: boolean;
  logoOverrideImage?: string;
  requiresAccessCode: boolean;
  admins: { _id: Id<"profiles">; username: string; displayName: string; displayRank: string }[];
  classes: {
    _id: Id<"classes">;
    name: string;
    slug: string;
    legacyId?: number;
    description: string;
    isActive: boolean;
    memberCount: number;
    joined: boolean;
    viewerIsAdmin: boolean;
  }[];
  viewer: {
    isMember: boolean;
    isAdmin: boolean;
    canEdit: boolean;
    canJoin: boolean;
    canLeave: boolean;
    canRequest: boolean;
    hasPendingRequest: boolean;
    canReviewRequests: boolean;
  };
};

export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<OrganizationDetail | null> => {
    const organization = await organizationBySlug(ctx, slug);

    if (!organization) return null;

    const profile = await optionalViewer(ctx);
    const viewer = asViewerRow(profile);
    const row = asOrganizationRow(organization);

    const admins: OrganizationDetail["admins"] = [];

    for (const adminId of organization.adminProfileIds) {
      const admin = await ctx.db.get(adminId);

      if (!admin) continue;
      admins.push({
        _id: admin._id,
        username: admin.username,
        displayName: admin.usernameDisplayOverride || admin.username,
        displayRank: admin.displayRank,
      });
    }

    const allClasses = await organizationClasses(ctx, organization._id);
    const activeClasses = allClasses.filter((klass) => klass.isActive);

    const classes = activeClasses
      .map((klass) => ({
        _id: klass._id,
        name: klass.name,
        slug: klass.slug,
        legacyId: klass.legacyId,
        description: klass.description ?? "",
        isActive: klass.isActive,
        memberCount: klass.memberProfileIds.length,
        joined: !!profile && klass.memberProfileIds.includes(profile._id),
        viewerIsAdmin: !!profile && klass.adminProfileIds.includes(profile._id),
      }))
      // `OrganizationHome.get_context_data`: joined classes first, then by name.
      .sort((a, b) => (a.joined === b.joined ? a.name.localeCompare(b.name) : a.joined ? -1 : 1));

    const isMember = !!profile && (await membership(ctx, organization._id, profile._id)) !== null;
    const isAdmin = !!profile && organization.adminProfileIds.includes(profile._id);
    const canEdit = organizationCanEdit(row, viewer);

    let hasPendingRequest = false;

    if (profile) {
      const pending = await ctx.db
        .query("organizationRequests")
        .withIndex("by_profile_state", (q) => q.eq("profileId", profile._id).eq("state", "P"))
        .collect();

      hasPendingRequest = pending.some((entry) => entry.organizationId === organization._id);
    }

    const canReviewRequests =
      !organization.isOpen &&
      !!profile &&
      (organizationCanReviewAllRequests(row, viewer) ||
        organizationCanReviewClassRequests(allClasses.map(asClassRow), viewer));

    const full = organization.slots !== undefined && organization.memberCount >= organization.slots;

    return {
      _id: organization._id,
      slug: organization.slug,
      legacyId: organization.legacyId,
      name: organization.name,
      shortName: organization.shortName,
      about: organization.about,
      aboutPreset: "organization-about",
      isOpen: organization.isOpen,
      slots: organization.slots ?? null,
      memberCount: organization.memberCount,
      classRequired: organization.classRequired,
      logoOverrideImage: organization.logoOverrideImage,
      requiresAccessCode: !!organization.accessCode,
      admins,
      classes,
      viewer: {
        isMember,
        isAdmin,
        canEdit,
        canJoin: !!profile && !isMember && organization.isOpen && !full,
        canLeave: isMember,
        canRequest: !!profile && !isMember && !organization.isOpen && !hasPendingRequest,
        hasPendingRequest,
        canReviewRequests,
      },
    };
  },
});

export type OrganizationMemberRow = LeaderboardRow;

/** `OrganizationUsers`: listed members only, ranked, 100 per page. */
export const members = query({
  args: {
    slug: v.string(),
    page: v.optional(v.number()),
    sort: v.optional(userSort),
    descending: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    organization: { _id: Id<"organizations">; slug: string; name: string } | null;
    members: OrganizationMemberRow[];
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    isAdmin: boolean;
  }> => {
    const organization = await organizationBySlug(ctx, args.slug);
    const page = Math.max(1, Math.floor(args.page ?? 1));

    if (!organization) {
      return {
        organization: null,
        members: [],
        page,
        perPage: MEMBERS_PER_PAGE,
        total: 0,
        totalPages: 1,
        isAdmin: false,
      };
    }

    const profile = await optionalViewer(ctx);
    const sort = args.sort ?? "performancePoints";
    const descending = args.descending ?? true;

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
      .collect();

    const rows: Doc<"profiles">[] = [];

    for (const entry of memberships) {
      const member = await ctx.db.get(entry.profileId);

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

    const offset = (page - 1) * MEMBERS_PER_PAGE;
    const pageRows = rows.slice(offset, offset + MEMBERS_PER_PAGE);
    // `users_for_template` ranks with the default key, `points`.
    const ranked = ranker(pageRows, (member) => member.points, offset);

    return {
      organization: { _id: organization._id, slug: organization.slug, name: organization.name },
      members: ranked.map(({ rank, item }) => ({
        _id: item._id,
        username: item.username,
        displayName: item.usernameDisplayOverride || item.username,
        displayRank: item.displayRank,
        points: item.points,
        performancePoints: item.performancePoints,
        problemCount: item.problemCount,
        rating: item.rating,
        rank,
      })),
      page,
      perPage: MEMBERS_PER_PAGE,
      total: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / MEMBERS_PER_PAGE)),
      isAdmin: !!profile && organization.adminProfileIds.includes(profile._id),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Membership                                                                 */
/* -------------------------------------------------------------------------- */

async function requireOrganization(ctx: QueryCtx, slug: string): Promise<Doc<"organizations">> {
  const organization = await organizationBySlug(ctx, slug);

  if (!organization) throw notFound("Organization");

  return organization;
}

/**
 * `JoinOrganization.handle`, plus the access code and slot checks the fork
 * asked for (DMOJ only applies those when approving a join request).
 */
export const join = mutation({
  args: { slug: v.string(), accessCode: v.optional(v.string()) },
  handler: async (ctx, { slug, accessCode }) => {
    const profile = await requireViewer(ctx);
    const organization = await requireOrganization(ctx, slug);

    if (await membership(ctx, organization._id, profile._id)) {
      throw invalid("You are already in the organization.");
    }

    if (!organization.isOpen) throw invalid("This organization is not open.");

    if (organization.accessCode && accessCode !== organization.accessCode) {
      throw forbidden("That access code is not correct.");
    }

    if (organization.slots !== undefined && organization.memberCount >= organization.slots) {
      throw invalid("This organization is full.");
    }

    if ((await openOrganizationCount(ctx, profile._id)) >= MAX_OPEN_ORGANIZATIONS) {
      throw invalid(`You may not be part of more than ${MAX_OPEN_ORGANIZATIONS} public organizations.`);
    }

    await addMember(ctx, organization._id, profile._id);

    return organization._id;
  },
});

export async function addMember(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  profileId: Id<"profiles">,
): Promise<void> {
  const existing = await membership(ctx, organizationId, profileId);

  if (existing) return;

  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();

  await ctx.db.insert("organizationMemberships", {
    organizationId,
    profileId,
    order: memberships.length,
  });
  await bumpMemberCount(ctx, organizationId, 1);
}

export async function removeMember(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  profileId: Id<"profiles">,
): Promise<boolean> {
  const existing = await membership(ctx, organizationId, profileId);

  if (!existing) return false;
  await ctx.db.delete(existing._id);
  await bumpMemberCount(ctx, organizationId, -1);

  // Leaving an organisation leaves its classes too.
  const classes = await organizationClasses(ctx, organizationId);

  for (const klass of classes) {
    if (!klass.memberProfileIds.includes(profileId)) continue;
    await ctx.db.patch(klass._id, {
      memberProfileIds: klass.memberProfileIds.filter((id) => id !== profileId),
    });
  }

  return true;
}

/** `LeaveOrganization.handle`. */
export const leave = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const profile = await requireViewer(ctx);
    const organization = await requireOrganization(ctx, slug);
    const removed = await removeMember(ctx, organization._id, profile._id);

    if (!removed) throw invalid(`You are not in "${organization.shortName}".`);

    return organization._id;
  },
});

/** `KickUserWidgetView.post`. */
export const kick = mutation({
  args: { slug: v.string(), username: v.string() },
  handler: async (ctx, { slug, username }) => {
    const profile = await requireViewer(ctx);
    const organization = await requireOrganization(ctx, slug);

    if (!organizationCanEdit(asOrganizationRow(organization), asViewerRow(profile))) {
      throw forbidden("You are not allowed to kick people from this organization.");
    }

    const target = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (!target) throw invalid("The user you are trying to kick does not exist!");
    const removed = await removeMember(ctx, organization._id, target._id);

    if (!removed) {
      throw invalid(`The user you are trying to kick is not in organization: ${organization.name}`);
    }

    return organization._id;
  },
});

/** `EditOrganization`: about, logo and the admin list, admins only. */
export const edit = mutation({
  args: {
    slug: v.string(),
    about: v.optional(v.string()),
    logoOverrideImage: v.optional(v.string()),
    adminUsernames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);
    const organization = await requireOrganization(ctx, args.slug);

    if (!organizationCanEdit(asOrganizationRow(organization), asViewerRow(profile))) {
      throw forbidden("You are not allowed to edit this organization.");
    }

    const patch: Partial<Doc<"organizations">> = {};

    if (args.about !== undefined) patch.about = args.about;

    if (args.logoOverrideImage !== undefined) {
      patch.logoOverrideImage = args.logoOverrideImage || undefined;
    }

    if (args.adminUsernames !== undefined) {
      // `EditOrganization.get_form`: only members or existing admins may be picked.
      const adminIds: Id<"profiles">[] = [];

      for (const username of args.adminUsernames) {
        const candidate = await ctx.db
          .query("profiles")
          .withIndex("by_username", (q) => q.eq("username", username))
          .unique();

        if (!candidate) throw notFound(`User ${username}`);
        const isMember = (await membership(ctx, organization._id, candidate._id)) !== null;

        if (!isMember && !organization.adminProfileIds.includes(candidate._id)) {
          throw invalid(`${username} is not a member of ${organization.name}.`);
        }

        adminIds.push(candidate._id);
      }

      if (adminIds.length === 0) throw invalid("An organization needs at least one administrator.");
      patch.adminProfileIds = adminIds;
    }

    await ctx.db.patch(organization._id, patch);

    return organization._id;
  },
});

/* -------------------------------------------------------------------------- */
/* Join requests                                                              */
/* -------------------------------------------------------------------------- */

/** `RequestJoinOrganization`. */
export const request = mutation({
  args: { slug: v.string(), reason: v.string(), classSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);
    const organization = await requireOrganization(ctx, args.slug);

    if (organization.isOpen) throw notFound("Join request page");

    const pending = await ctx.db
      .query("organizationRequests")
      .withIndex("by_profile_state", (q) => q.eq("profileId", profile._id).eq("state", "P"))
      .collect();

    if (pending.some((entry) => entry.organizationId === organization._id)) {
      throw invalid(`You already have a pending request to join ${organization.name}.`);
    }

    let classId: Id<"classes"> | undefined;

    const classSlug = args.classSlug;

    if (classSlug) {
      const klass = await ctx.db
        .query("classes")
        .withIndex("by_organization_slug", (q) =>
          q.eq("organizationId", organization._id).eq("slug", classSlug),
        )
        .unique();

      if (!klass) throw notFound("Class");

      if (!klass.isActive) throw invalid("That class is not accepting members.");
      classId = klass._id;
    }

    // `OrganizationRequest.clean`.
    if (organization.classRequired && !classId) {
      throw invalid("Organization requires a class to be specified");
    }

    return await ctx.db.insert("organizationRequests", {
      profileId: profile._id,
      organizationId: organization._id,
      classId,
      time: Date.now(),
      state: "P",
      reason: args.reason,
    });
  },
});

export type JoinRequestRow = {
  _id: Id<"organizationRequests">;
  username: string;
  displayName: string;
  time: number;
  state: "P" | "A" | "R";
  reason: string;
  className: string | null;
};

/**
 * `OrganizationRequestView` and `OrganizationRequestLog`. Organisation admins
 * see everything; class admins see only requests for their classes.
 */
export const reviewRequests = query({
  args: {
    slug: v.string(),
    tab: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("log")),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    organization: { _id: Id<"organizations">; slug: string; name: string } | null;
    tab: "pending" | "approved" | "rejected" | "log";
    editAll: boolean;
    requests: JoinRequestRow[];
    slotsRemaining: number | null;
  }> => {
    const tab = args.tab ?? "pending";
    const profile = await optionalViewer(ctx);
    const organization = await organizationBySlug(ctx, args.slug);

    if (!organization || !profile) {
      return { organization: null, tab, editAll: false, requests: [], slotsRemaining: null };
    }

    const viewer = asViewerRow(profile);
    const row = asOrganizationRow(organization);
    const allClasses = await organizationClasses(ctx, organization._id);

    const editAll = organizationCanReviewAllRequests(row, viewer);
    const editClasses = organizationCanReviewClassRequests(allClasses.map(asClassRow), viewer);

    if (!editAll && !editClasses) throw forbidden();

    const myClassIds = new Set(
      allClasses.filter((klass) => klass.adminProfileIds.includes(profile._id)).map((k) => k._id),
    );

    const states: ("P" | "A" | "R")[] =
      tab === "pending" ? ["P"] : tab === "approved" ? ["A"] : tab === "rejected" ? ["R"] : ["A", "R"];

    const rows: JoinRequestRow[] = [];

    for (const state of states) {
      const entries = await ctx.db
        .query("organizationRequests")
        .withIndex("by_organization_state", (q) =>
          q.eq("organizationId", organization._id).eq("state", state),
        )
        .collect();

      for (const entry of entries) {
        if (!editAll && (!entry.classId || !myClassIds.has(entry.classId))) continue;
        const requester = await ctx.db.get(entry.profileId);

        if (!requester) continue;
        const klass = entry.classId ? await ctx.db.get(entry.classId) : null;
        rows.push({
          _id: entry._id,
          username: requester.username,
          displayName: requester.usernameDisplayOverride || requester.username,
          time: entry.time,
          state: entry.state,
          reason: entry.reason,
          className: klass?.name ?? null,
        });
      }
    }

    rows.sort((a, b) => a.time - b.time);

    return {
      organization: { _id: organization._id, slug: organization.slug, name: organization.name },
      tab,
      editAll,
      requests: rows,
      slotsRemaining:
        organization.slots === undefined ? null : Math.max(0, organization.slots - organization.memberCount),
    };
  },
});

async function loadReviewableRequest(
  ctx: MutationCtx,
  requestId: Id<"organizationRequests">,
): Promise<{ entry: Doc<"organizationRequests">; organization: Doc<"organizations"> }> {
  const profile = await requireViewer(ctx);
  const entry = await ctx.db.get(requestId);

  if (!entry) throw notFound("Join request");
  const organization = await ctx.db.get(entry.organizationId);

  if (!organization) throw notFound("Organization");

  const viewer = asViewerRow(profile);
  const row = asOrganizationRow(organization);

  if (organizationCanReviewAllRequests(row, viewer)) return { entry, organization };

  const klass = entry.classId ? await ctx.db.get(entry.classId) : null;

  if (klass?.adminProfileIds.includes(profile._id)) return { entry, organization };
  throw forbidden();
}

/** `OrganizationRequestView.post` for a single row, slot check included. */
export const approve = mutation({
  args: { requestId: v.id("organizationRequests") },
  handler: async (ctx, { requestId }) => {
    const { entry, organization } = await loadReviewableRequest(ctx, requestId);

    if (entry.state !== "P") throw invalid("That request has already been reviewed.");

    if (organization.slots !== undefined) {
      const canAdd = organization.slots - organization.memberCount;

      if (canAdd < 1) {
        throw invalid("Your organization can only receive 0 more members.");
      }
    }

    await ctx.db.patch(entry._id, { state: "A" });
    await addMember(ctx, organization._id, entry.profileId);

    if (entry.classId) {
      const klass = await ctx.db.get(entry.classId);

      if (klass && !klass.memberProfileIds.includes(entry.profileId)) {
        await ctx.db.patch(klass._id, {
          memberProfileIds: [...klass.memberProfileIds, entry.profileId],
        });
      }
    }

    return entry._id;
  },
});

export const reject = mutation({
  args: { requestId: v.id("organizationRequests") },
  handler: async (ctx, { requestId }) => {
    const { entry } = await loadReviewableRequest(ctx, requestId);

    if (entry.state !== "P") throw invalid("That request has already been reviewed.");
    await ctx.db.patch(entry._id, { state: "R" });

    return entry._id;
  },
});

/** The registration form's organisation picker. */
export const openOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.db.query("organizations").collect();

    return organizations
      .filter((organization) => organization.isOpen)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((organization) => ({
        _id: organization._id,
        slug: organization.slug,
        name: organization.name,
        shortName: organization.shortName,
      }));
  },
});
