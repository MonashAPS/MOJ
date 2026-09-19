import { hasPerm as coreHasPerm, isStaff as coreIsStaff, type ProfileRow } from "@moj/core";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { forbidden, mojError } from "./errors";

export type AuthCtx = QueryCtx | MutationCtx;

export type Viewer = Doc<"profiles">;

export async function viewerUserId(ctx: AuthCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();

  return identity?.subject ?? null;
}

/**
 * The profile an account signs in as.
 *
 * `unique()` was what this used, and a deployment that grew a second row for one
 * account answered every page with a server error instead: an import landing on
 * a live deployment is enough to grow one, because `ProfileBootstrap` creates a
 * profile for whoever is signed in while the table is empty and the import then
 * writes the account's own. `convex/importer.ts` upserts profiles by `userId`
 * now, so that no longer happens; this reads past the damage a deployment may
 * already carry rather than taking the site down over it.
 *
 * The oldest `joinDate` wins, which is the account as it has existed longest: a
 * row invented mid-import joins today, and the account's own row joined when the
 * account did.
 */
export async function profileForUserId(ctx: AuthCtx, userId: string): Promise<Viewer | null> {
  const profiles = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(2);

  const [first, second] = profiles;

  if (!first || !second) return first ?? null;

  // The index reads oldest row first, so `first` also wins an equal join date.
  return second.joinDate < first.joinDate ? second : first;
}

export async function optionalViewer(ctx: AuthCtx): Promise<Viewer | null> {
  const userId = await viewerUserId(ctx);

  if (!userId) return null;

  return await profileForUserId(ctx, userId);
}

export async function requireViewer(ctx: AuthCtx): Promise<Viewer> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw mojError("UNAUTHENTICATED", "You must be logged in to do that.");
  }

  const profile = await profileForUserId(ctx, identity.subject);

  if (!profile) {
    throw mojError("NO_PROFILE", "Your account has no profile yet.");
  }

  return profile;
}

/** `@moj/core` speaks plain rows: a profile document is one, once its Convex id
 *  is published under the name the pure rules read. */
function asProfileRow(profile: Viewer | null): ProfileRow | null {
  return profile ? { ...profile, id: profile._id } : null;
}

export function hasPerm(profile: Viewer | null, code: string): boolean {
  return coreHasPerm(asProfileRow(profile), code);
}

export function isStaff(profile: Viewer | null): boolean {
  return coreIsStaff(asProfileRow(profile));
}

export async function requireStaff(ctx: AuthCtx): Promise<Viewer> {
  const profile = await requireViewer(ctx);

  if (!isStaff(profile)) throw forbidden("Staff only.");

  return profile;
}

export async function requireSuperuser(ctx: AuthCtx): Promise<Viewer> {
  const profile = await requireViewer(ctx);

  if (!profile.isSuperuser) throw forbidden("Superusers only.");

  return profile;
}

export async function requirePerm(ctx: AuthCtx, code: string): Promise<Viewer> {
  const profile = await requireViewer(ctx);

  if (!hasPerm(profile, code)) throw forbidden(`Missing permission ${code}.`);

  return profile;
}
