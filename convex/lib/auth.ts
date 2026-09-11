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

export async function optionalViewer(ctx: AuthCtx): Promise<Viewer | null> {
  const userId = await viewerUserId(ctx);
  if (!userId) return null;
  return await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

export async function requireViewer(ctx: AuthCtx): Promise<Viewer> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw mojError("UNAUTHENTICATED", "You must be logged in to do that.");
  }
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
    .unique();
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
