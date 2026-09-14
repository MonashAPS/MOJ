/**
 * Screen-share proctoring: whether an account is currently being watched.
 *
 * Proctoring is a state the account is in rather than something a contest
 * owns. Someone can start a session with no contest in sight, and a contest
 * that asks for proctoring simply checks whether they are in one. That keeps
 * the two independent: the same session covers every contest they touch, and
 * ending it closes all of them at once.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { forbidden } from "./errors";

export type AnyProctorCtx = QueryCtx | MutationCtx;

/**
 * How long a heartbeat vouches for the session.
 *
 * The page beats every ten seconds, so this tolerates two missed beats before
 * the session reads as gone. Long enough to survive a stall, short enough that
 * closing the tab locks the questions while the person is still looking at
 * them.
 */
export const PROCTOR_LIVE_WINDOW_MS = 30_000;

/** Only a whole screen counts. A tab or a window would show us what they chose. */
export const PROCTOR_REQUIRED_SURFACE = "monitor";

/** The session this account is currently in, or null. */
export async function activeProctorSession(
  ctx: AnyProctorCtx,
  profileId: Id<"profiles">,
  now: number = Date.now(),
): Promise<Doc<"proctorSessions"> | null> {
  const latest = await ctx.db
    .query("proctorSessions")
    .withIndex("by_profile_started", (q) => q.eq("profileId", profileId))
    .order("desc")
    .first();
  if (!latest || latest.endedAt !== undefined) return null;
  return latest.lastSeenAt + PROCTOR_LIVE_WINDOW_MS > now ? latest : null;
}

export async function isProctored(
  ctx: AnyProctorCtx,
  profileId: Id<"profiles"> | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (!profileId) return false;
  return (await activeProctorSession(ctx, profileId, now)) !== null;
}

/**
 * Whether contest mode should stop opening this contest's problems because the
 * viewer is not being proctored.
 *
 * The shape matches the Safe Exam Browser gate deliberately: both answer the
 * same question about the same bypass, and a contest may ask for either, both
 * or neither.
 */
export async function proctorBlocksContestProblems(
  ctx: AnyProctorCtx,
  contest: Doc<"contests">,
  profileId: Id<"profiles"> | null,
): Promise<boolean> {
  if (!contest.proctorRequired) return false;
  return !(await isProctored(ctx, profileId));
}

/** Refuse a write that a contest's proctoring requirement does not cover. */
export async function requireProctored(
  ctx: AnyProctorCtx,
  contest: Doc<"contests">,
  profileId: Id<"profiles">,
): Promise<void> {
  if (await proctorBlocksContestProblems(ctx, contest, profileId)) {
    throw forbidden("This contest is proctored. Share your screen to take part.");
  }
}
