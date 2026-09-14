/**
 * Safe Exam Browser: what the web tier calls.
 *
 * Both functions take the same evidence — the URL as SEB requested it and the
 * hash headers it sent — because the browser cannot be asked to report its own
 * headers honestly. Only a real HTTP request to the Next tier sees them, so the
 * web tier reads them off the wire and passes them here, where the keys are.
 *
 * Neither function needs protecting from a client that calls it directly.
 * Producing a hash that verifies requires the Config Key, which is the thing
 * nothing ever hands out.
 */

import { sebHeadersMatch } from "@moj/core";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { contestByKey } from "./contestFormats";
import { optionalViewer } from "./lib/auth";
import { type AnySebCtx, issueSebTicket, sebLockFor } from "./lib/seb";

const evidence = {
  /** Exactly as SEB requested it: SEB hashed this string, not a tidied one. */
  url: v.string(),
  configKeyHash: v.optional(v.union(v.string(), v.null())),
  requestHash: v.optional(v.union(v.string(), v.null())),
};

export type SebRequirement = {
  /** The viewer is in a contest that is locked and configured to be locked. */
  locked: boolean;
  /** This request carried a hash matching one of the contest's keys. */
  verified: boolean;
  contestKey: string | null;
  contestName: string | null;
  /** Where the launch screen sends someone who is not in SEB yet. */
  launchUrl: string | null;
};

const OPEN: SebRequirement = {
  locked: false,
  verified: false,
  contestKey: null,
  contestName: null,
  launchUrl: null,
};

async function requirementFor(
  ctx: AnySebCtx,
  contest: Doc<"contests">,
  args: { url: string; configKeyHash?: string | null; requestHash?: string | null },
): Promise<SebRequirement> {
  const { locked, keys } = await sebLockFor(ctx, contest);
  if (!locked) return OPEN;

  const verified = await sebHeadersMatch(
    args.url,
    { configKeyHash: args.configKeyHash ?? null, requestHash: args.requestHash ?? null },
    keys,
  );
  return {
    locked: true,
    verified,
    contestKey: contest.key,
    contestName: contest.name,
    launchUrl: contest.sebLaunchUrl ?? null,
  };
}

/**
 * The gate the page render asks about: is the viewer's current contest locked,
 * and does this request satisfy it?
 *
 * Contest mode is what grants access to a contest's problems, so this follows
 * the viewer's participation rather than the URL they happen to be on — the
 * statements live at `/problem/...` like any other.
 */
export const requirement = query({
  args: evidence,
  handler: async (ctx, args): Promise<SebRequirement> => {
    const profile = await optionalViewer(ctx);
    if (!profile?.currentParticipationId) return OPEN;

    const participation = await ctx.db.get(profile.currentParticipationId);
    if (!participation) return OPEN;
    const contest = await ctx.db.get(participation.contestId);
    if (!contest) return OPEN;

    return await requirementFor(ctx, contest, args);
  },
});

/**
 * Mint the ticket that `contests:join` and `submissions:submit` ask for.
 *
 * A mutation rather than a query because a query's result is cached against its
 * arguments, and a ticket that stopped changing would outlive its expiry.
 */
export const ticket = mutation({
  args: { contestKey: v.string(), ...evidence },
  handler: async (ctx, args): Promise<{ ticket: string | null }> => {
    const profile = await optionalViewer(ctx);
    if (!profile) return { ticket: null };

    const contest = await contestByKey(ctx, args.contestKey);
    if (!contest) return { ticket: null };

    return {
      ticket: await issueSebTicket(ctx, contest, profile._id, {
        url: args.url,
        configKeyHash: args.configKeyHash ?? null,
        requestHash: args.requestHash ?? null,
      }),
    };
  },
});
