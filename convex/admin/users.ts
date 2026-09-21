/**
 * `/admin` users section.
 *
 * Ports judge/admin/profile.py: the changelist filters, the editable fields and
 * "Recalculate scores". Everything here is permission-checked; nothing is
 * reachable without `judge.change_profile` (or superuser).
 *
 * Two things live in the web layer rather than here, because they are Better
 * Auth's and not Convex's:
 *
 *   - Impersonation is `authClient.admin.impersonateUser({ userId })`, from the
 *     admin plugin configured in apps/web/src/auth/server.ts. It mints an
 *     impersonation session; Convex sees the impersonated user through the
 *     usual JWT, so no Convex function is involved and none is exposed here.
 *   - Deactivating an account is `auth.api.banUser` / `setUserPassword` against
 *     Postgres. `deactivate` below only records the state on the profile and
 *     returns the Better Auth user id for the route to act on.
 */

import { v } from "convex/values";
import type { Doc, Id } from "./../_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./../_generated/server";
import { requireStaff } from "./../lib/auth";
import { writeRevision } from "./../lib/community";
import { forbidden, invalid, notFound } from "./../lib/errors";
import { recalculateProfilePoints } from "./../profiles";
import { deleteProfileAggregates, patchProfile } from "./../rankings";
import { displayRank } from "./../schema";

const CHANGE_PROFILE = "judge.change_profile";

export async function requireProfileAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<"profiles">> {
  const staff = await requireStaff(ctx);

  if (!staff.isSuperuser && !staff.permissions.includes(CHANGE_PROFILE)) {
    throw forbidden(`Missing permission ${CHANGE_PROFILE}.`);
  }

  return staff;
}

export type AdminUserRow = {
  _id: Id<"profiles">;
  userId: string;
  username: string;
  displayName: string;
  displayRank: string;
  points: number;
  performancePoints: number;
  problemCount: number;
  rating?: number;
  isStaff: boolean;
  isSuperuser: boolean;
  isActive: boolean;
  isUnlisted: boolean;
  mute: boolean;
  isBannedFromProblemVoting: boolean;
  permissions: string[];
  notes: string;
  timezone: string;
  joinDate: number;
  lastAccess?: number;
  organizationSlugs: string[];
};

async function toRow(ctx: QueryCtx, profile: Doc<"profiles">): Promise<AdminUserRow> {
  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .collect();

  const organizationSlugs: string[] = [];

  for (const membership of memberships) {
    const organization = await ctx.db.get(membership.organizationId);

    if (organization) organizationSlugs.push(organization.slug);
  }

  return {
    _id: profile._id,
    userId: profile.userId,
    username: profile.username,
    displayName: profile.usernameDisplayOverride || profile.username,
    displayRank: profile.displayRank,
    points: profile.points,
    performancePoints: profile.performancePoints,
    problemCount: profile.problemCount,
    rating: profile.rating,
    isStaff: profile.isStaff,
    isSuperuser: profile.isSuperuser,
    isActive: profile.isActive ?? true,
    isUnlisted: profile.isUnlisted,
    mute: profile.mute,
    isBannedFromProblemVoting: profile.isBannedFromProblemVoting,
    permissions: profile.permissions,
    notes: profile.notes,
    timezone: profile.timezone,
    joinDate: profile.joinDate,
    lastAccess: profile.lastAccess,
    organizationSlugs,
  };
}

export const list = query({
  args: {
    search: v.optional(v.string()),
    displayRank: v.optional(displayRank),
    isStaff: v.optional(v.boolean()),
    isUnlisted: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    muted: v.optional(v.boolean()),
    organizationSlug: v.optional(v.string()),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ users: AdminUserRow[]; page: number; perPage: number; total: number }> => {
    await requireProfileAdmin(ctx);
    const page = Math.max(1, Math.floor(args.page ?? 1));
    const perPage = Math.max(1, Math.min(args.perPage ?? 50, 200));

    let candidates: Doc<"profiles">[];
    const search = args.search?.trim();

    if (search) {
      candidates = await ctx.db
        .query("profiles")
        .withSearchIndex("search_username", (q) => q.search("username", search))
        .take(1000);
    } else {
      candidates = await ctx.db.query("profiles").collect();
    }

    let allowed: Set<Id<"profiles">> | null = null;

    const organizationSlug = args.organizationSlug;

    if (organizationSlug) {
      const organization = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", organizationSlug))
        .unique();

      allowed = new Set();

      if (organization) {
        const memberships = await ctx.db
          .query("organizationMemberships")
          .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
          .collect();

        for (const membership of memberships) allowed.add(membership.profileId);
      }
    }

    const filtered = candidates.filter((profile) => {
      if (args.displayRank !== undefined && profile.displayRank !== args.displayRank) return false;

      if (args.isStaff !== undefined && (profile.isStaff || profile.isSuperuser) !== args.isStaff) {
        return false;
      }

      if (args.isUnlisted !== undefined && profile.isUnlisted !== args.isUnlisted) return false;

      if (args.isActive !== undefined && (profile.isActive ?? true) !== args.isActive) return false;

      if (args.muted !== undefined && profile.mute !== args.muted) return false;

      if (allowed && !allowed.has(profile._id)) return false;

      return true;
    });

    filtered.sort((a, b) => a.username.localeCompare(b.username));
    const slice = filtered.slice((page - 1) * perPage, (page - 1) * perPage + perPage);
    const users: AdminUserRow[] = [];

    for (const profile of slice) users.push(await toRow(ctx, profile));

    return { users, page, perPage, total: filtered.length };
  },
});

export const get = query({
  args: { username: v.string() },
  handler: async (ctx, { username }): Promise<AdminUserRow | null> => {
    await requireProfileAdmin(ctx);

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    return profile ? await toRow(ctx, profile) : null;
  },
});

async function loadTarget(ctx: MutationCtx, username: string): Promise<Doc<"profiles">> {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_username", (q) => q.eq("username", username))
    .unique();

  if (!profile) throw notFound("User");

  return profile;
}

export const edit = mutation({
  args: {
    username: v.string(),
    about: v.optional(v.string()),
    timezone: v.optional(v.string()),
    displayRank: v.optional(displayRank),
    usernameDisplayOverride: v.optional(v.string()),
    notes: v.optional(v.string()),
    isStaff: v.optional(v.boolean()),
    isSuperuser: v.optional(v.boolean()),
    permissions: v.optional(v.array(v.string())),
    mute: v.optional(v.boolean()),
    isUnlisted: v.optional(v.boolean()),
    isBannedFromProblemVoting: v.optional(v.boolean()),
    rating: v.optional(v.union(v.number(), v.null())),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requireProfileAdmin(ctx);
    const target = await loadTarget(ctx, args.username);

    // Only a superuser may hand out staff, superuser or permission codes:
    // Django's ModelAdmin never let a non-superuser widen its own powers.
    const escalating =
      args.isStaff !== undefined || args.isSuperuser !== undefined || args.permissions !== undefined;

    if (escalating && !staff.isSuperuser) {
      throw forbidden("Only superusers may change staff flags or permissions.");
    }

    if (target.isSuperuser && !staff.isSuperuser) {
      throw forbidden("Only superusers may edit a superuser.");
    }

    const patch: Partial<Doc<"profiles">> = {};

    if (args.about !== undefined) patch.about = args.about;

    if (args.timezone !== undefined) patch.timezone = args.timezone;

    if (args.displayRank !== undefined) patch.displayRank = args.displayRank;

    if (args.usernameDisplayOverride !== undefined) {
      patch.usernameDisplayOverride = args.usernameDisplayOverride || undefined;
    }

    if (args.notes !== undefined) patch.notes = args.notes;

    if (args.isStaff !== undefined) patch.isStaff = args.isStaff;

    if (args.isSuperuser !== undefined) patch.isSuperuser = args.isSuperuser;

    if (args.permissions !== undefined) patch.permissions = args.permissions;

    if (args.mute !== undefined) patch.mute = args.mute;

    if (args.isUnlisted !== undefined) patch.isUnlisted = args.isUnlisted;

    if (args.isBannedFromProblemVoting !== undefined) {
      patch.isBannedFromProblemVoting = args.isBannedFromProblemVoting;
    }

    if (args.rating !== undefined) patch.rating = args.rating === null ? undefined : args.rating;

    const updated = await patchProfile(ctx, target._id, patch);
    await writeRevision(ctx, "profiles", updated._id, updated, staff._id, args.reason ?? "Edited from admin");

    // The console mirrors the superuser flag into Better Auth's role, so the
    // caller needs the account it belongs to and the flag as it now stands.
    return { id: updated._id, userId: updated.userId, isSuperuser: updated.isSuperuser };
  },
});

/** judge/admin/profile.py "Recalculate scores". */
export const recalculatePoints = mutation({
  args: { usernames: v.array(v.string()) },
  handler: async (ctx, { usernames }) => {
    await requireProfileAdmin(ctx);
    const results: { username: string; points: number; performancePoints: number }[] = [];

    for (const username of usernames) {
      const profile = await loadTarget(ctx, username);
      const result = await recalculateProfilePoints(ctx, profile._id);
      results.push({
        username,
        points: result.points,
        performancePoints: result.performancePoints,
      });
    }

    return results;
  },
});

/**
 * Mark the account inactive. The Better Auth side (revoking sessions, banning
 * the user row) is the route's job; this returns the user id it needs.
 */
export const deactivate = mutation({
  args: { username: v.string(), active: v.optional(v.boolean()), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const staff = await requireProfileAdmin(ctx);
    const target = await loadTarget(ctx, args.username);

    if (target.isSuperuser && !staff.isSuperuser) {
      throw forbidden("Only superusers may deactivate a superuser.");
    }

    if (target._id === staff._id) throw invalid("You cannot deactivate your own account.");

    const active = args.active ?? false;

    const updated = await patchProfile(ctx, target._id, {
      isActive: active,
      // DMOJ hides deactivated users from the leaderboard and the API.
      isUnlisted: active ? target.isUnlisted : true,
    });

    await writeRevision(
      ctx,
      "profiles",
      updated._id,
      updated,
      staff._id,
      args.reason ?? (active ? "Reactivated from admin" : "Deactivated from admin"),
    );

    return { userId: target.userId, username: target.username, isActive: active };
  },
});

/** Removing a profile outright, e.g. a spam registration that never solved anything. */
export const remove = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const staff = await requireStaff(ctx);

    if (!staff.isSuperuser) throw forbidden("Only superusers may delete a profile.");
    const target = await loadTarget(ctx, username);

    if (target._id === staff._id) throw invalid("You cannot delete your own account.");

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_profile", (q) => q.eq("profileId", target._id))
      .collect();

    for (const membership of memberships) {
      const organization = await ctx.db.get(membership.organizationId);

      if (organization) {
        await ctx.db.patch(organization._id, {
          memberCount: Math.max(0, organization.memberCount - 1),
        });
      }

      await ctx.db.delete(membership._id);
    }

    await deleteProfileAggregates(ctx, target);
    await ctx.db.delete(target._id);

    return { userId: target.userId };
  },
});

/** The permission picker in the user editor. */
export const permissionCodes = query({
  args: {},
  handler: async (ctx) => {
    await requireProfileAdmin(ctx);

    return [
      "judge.change_profile",
      "judge.edit_all_problem",
      "judge.edit_own_problem",
      "judge.edit_public_problem",
      "judge.clone_problem",
      "judge.change_public_visibility",
      "judge.problem_full_markup",
      "judge.see_private_problem",
      "judge.see_organization_problem",
      "judge.edit_all_contest",
      "judge.edit_own_contest",
      "judge.see_private_contest",
      "judge.contest_rating",
      "judge.contest_access_code",
      "judge.lock_contest",
      "judge.moss_contest",
      "judge.rejudge_submission",
      "judge.rejudge_submission_lot",
      "judge.view_all_submission",
      "judge.spam_submission",
      "judge.edit_all_post",
      "judge.organization_admin",
      "judge.edit_all_organization",
      "judge.change_organization",
      "judge.test_site",
      "judge.totp",
      "judge.change_site_settings",
    ];
  },
});
