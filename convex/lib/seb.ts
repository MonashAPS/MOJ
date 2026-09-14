/**
 * Safe Exam Browser, the Convex half.
 *
 * The keys and the ticket secret both live here rather than in the web tier,
 * because either one is enough to walk past the check: a Config Key lets you
 * compute the header SEB would have sent for any URL, and the secret lets you
 * sign your own ticket. The web tier only ever reports what it saw on the wire
 * and receives a yes or a no.
 */

import {
  mintSebTicket,
  type SebExpectedKeys,
  sebHeadersMatch,
  sebKeysConfigured,
  verifySebTicket,
} from "@moj/protocol";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { forbidden } from "./errors";

export type AnySebCtx = QueryCtx | MutationCtx;

/** What SEB puts on a request, as the web tier read it off the headers. */
export type SebEvidence = {
  url: string;
  configKeyHash: string | null;
  requestHash: string | null;
};

const NO_KEYS: SebExpectedKeys = { configKeys: [], browserExamKeys: [] };

async function keysFor(ctx: AnySebCtx, contestId: Doc<"contests">["_id"]): Promise<SebExpectedKeys> {
  const row = await ctx.db
    .query("contestSebKeys")
    .withIndex("by_contest", (q) => q.eq("contestId", contestId))
    .unique();
  if (!row) return NO_KEYS;
  // The generated configuration's key counts alongside anything pasted by hand,
  // so a contest that has only ever used MOJ's own file still verifies.
  const configKeys = row.generatedKey ? [...row.configKeys, row.generatedKey] : row.configKeys;
  return { configKeys, browserExamKeys: row.browserExamKeys };
}

/**
 * Whether this contest is actually locked right now.
 *
 * Two things can switch the lock off besides the contest's own flag. The site
 * setting gates the feature as a whole, so an operator who never turns it on is
 * never affected by a stray contest flag. And a contest with no keys has nothing
 * to compare a hash against, so leaving it "locked" would only mean nobody can
 * ever submit; an unconfigured lock is an open one, and the admin says so.
 */
export async function sebLockFor(
  ctx: AnySebCtx,
  contest: Doc<"contests">,
): Promise<{ locked: boolean; keys: SebExpectedKeys }> {
  if (!contest.sebRequired) return { locked: false, keys: NO_KEYS };

  const settings = await ctx.db
    .query("siteSettings")
    .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
    .unique();
  if (!settings?.sebEnabled) return { locked: false, keys: NO_KEYS };

  const keys = await keysFor(ctx, contest._id);
  return { locked: sebKeysConfigured(keys), keys };
}

/** The secret both halves of the ticket go through. Unset means no locking. */
function ticketSecret(): string | null {
  const secret = process.env.SEB_TICKET_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

/**
 * Turn the evidence the web tier saw into a ticket the client can hand to
 * `submissions:submit`, or null when it does not check out.
 */
export async function issueSebTicket(
  ctx: AnySebCtx,
  contest: Doc<"contests">,
  profileId: string,
  evidence: SebEvidence,
): Promise<string | null> {
  const { locked, keys } = await sebLockFor(ctx, contest);
  if (!locked) return null;

  const secret = ticketSecret();
  if (!secret) return null;

  const matched = await sebHeadersMatch(
    evidence.url,
    { configKeyHash: evidence.configKeyHash, requestHash: evidence.requestHash },
    keys,
  );
  if (!matched) return null;

  return await mintSebTicket(secret, { contestKey: contest.key, profileId }, Date.now());
}

/**
 * Refuse the write unless the caller proved they are in SEB. Called by every
 * mutation that a locked contest should gate — joining, which is what grants
 * access to the contest's problems, and submitting, which is the act that
 * decides the standings.
 */
export async function requireSebTicket(
  ctx: AnySebCtx,
  contest: Doc<"contests">,
  profileId: string,
  ticket: string | undefined,
): Promise<void> {
  const { locked } = await sebLockFor(ctx, contest);
  if (!locked) return;

  const secret = ticketSecret();
  if (!secret) {
    // Locking was asked for and cannot be enforced. Failing open would be a
    // silent downgrade of exactly the thing the operator switched on.
    throw forbidden(
      "This contest requires Safe Exam Browser, but the judge is missing SEB_TICKET_SECRET. Ask an administrator.",
    );
  }

  const ok =
    !!ticket && (await verifySebTicket(secret, ticket, { contestKey: contest.key, profileId }, Date.now()));
  if (!ok) {
    throw forbidden("This contest can only be entered from Safe Exam Browser.");
  }
}

/* -------------------------------------------------------------------------- */
/* Session verification                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How long one verified request vouches for the next few.
 *
 * Reads arrive as Convex queries, which carry no headers and cannot be handed a
 * ticket without threading one through every caller. Instead each page render
 * checks in over HTTP, where the headers exist, and that vouches for the reads
 * the page makes. Long enough to cover a page that sits open, short enough that
 * closing SEB stops access within a minute and a half.
 */
export const SEB_VERIFY_WINDOW_MS = 90_000;

/** Only rewrite once the stamp is half spent, to keep the write rate down. */
const SEB_REFRESH_AFTER_MS = SEB_VERIFY_WINDOW_MS / 2;

/** Record that this viewer was in SEB for this contest, just now. */
export async function recordSebVerification(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  contestId: Id<"contests">,
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("sebVerifications")
    .withIndex("by_profile_contest", (q) => q.eq("profileId", profileId).eq("contestId", contestId))
    .unique();

  if (!existing) {
    await ctx.db.insert("sebVerifications", {
      profileId,
      contestId,
      verifiedUntil: now + SEB_VERIFY_WINDOW_MS,
    });
    return;
  }
  if (existing.verifiedUntil - now > SEB_REFRESH_AFTER_MS) return;
  await ctx.db.patch(existing._id, { verifiedUntil: now + SEB_VERIFY_WINDOW_MS });
}

async function sebVerifiedNow(
  ctx: AnySebCtx,
  profileId: Id<"profiles">,
  contestId: Id<"contests">,
): Promise<boolean> {
  const row = await ctx.db
    .query("sebVerifications")
    .withIndex("by_profile_contest", (q) => q.eq("profileId", profileId).eq("contestId", contestId))
    .unique();
  return !!row && row.verifiedUntil > Date.now();
}

/**
 * Whether contest mode should stop opening this contest's problems.
 *
 * Being in a contest is what makes its problems readable whatever their own
 * visibility says. When the contest is locked, that only holds while the viewer
 * is demonstrably in SEB; otherwise the bypass falls away and the ordinary
 * permission rules decide on their own, which is what a public problem being
 * public and an unlisted one being unlisted already means.
 */
export async function sebBlocksContestProblems(
  ctx: AnySebCtx,
  contest: Doc<"contests">,
  profileId: Id<"profiles"> | null,
): Promise<boolean> {
  const { locked } = await sebLockFor(ctx, contest);
  if (!locked) return false;
  if (!profileId) return true;
  return !(await sebVerifiedNow(ctx, profileId, contest._id));
}
