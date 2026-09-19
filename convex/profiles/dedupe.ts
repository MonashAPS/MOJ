/**
 * The repair for a deployment that grew two profiles for one account.
 *
 * An import into a deployment people are signed in to used to race
 * `ProfileBootstrap`, which creates a profile the moment the table stops holding
 * one for a signed-in account. The importer's insert then wrote the account's
 * own profile beside that stub, and `optionalViewer` read the pair with
 * `unique()`: every page that account loaded answered with a server error.
 *
 * `convex/importer.ts` upserts profiles by `userId` now, so no import makes a
 * new one. This clears up the deployments that were loaded before it did, the
 * way `admin/languages.dedupeByKey` clears up the duplicate language rows an
 * older importer left.
 *
 * Only a stub is deleted: no legacy id, nothing scored, no contest in progress.
 * That is what the race can produce and all it can produce, and a profile with
 * any history behind it is somebody's account rather than an artefact — merging
 * one into another is a decision, not a repair, so this reports those and stops.
 */

import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { deleteProfileAggregates } from "../rankings";

/** The empty profile `ProfileBootstrap` creates, and nothing else. */
function isStub(profile: Doc<"profiles">): boolean {
  return (
    profile.legacyId === undefined &&
    profile.legacyUserId === undefined &&
    profile.points === 0 &&
    profile.performancePoints === 0 &&
    profile.problemCount === 0 &&
    profile.rating === undefined &&
    profile.currentParticipationId === undefined
  );
}

/**
 * The row to keep: the oldest join date, which is `lib/auth.profileForUserId`'s
 * rule, so the repair keeps whichever profile the site has been answering as.
 */
function keeper(profiles: readonly Doc<"profiles">[]): Doc<"profiles"> {
  return profiles.reduce((oldest, profile) => (profile.joinDate < oldest.joinDate ? profile : oldest));
}

async function dropStubs(
  ctx: MutationCtx,
  profiles: readonly Doc<"profiles">[],
): Promise<{ deleted: number; kept: string[] }> {
  const keep = keeper(profiles);
  const kept: string[] = [];
  let deleted = 0;

  for (const profile of profiles) {
    if (profile._id === keep._id) continue;

    if (!isStub(profile)) {
      kept.push(profile._id);

      continue;
    }

    await deleteProfileAggregates(ctx, profile);
    await ctx.db.delete(profile._id);
    deleted += 1;
  }

  return { deleted, kept };
}

export const dropStubDuplicates = internalMutation({
  args: {},
  returns: v.object({
    accounts: v.number(),
    deleted: v.number(),
    /** Duplicates with history behind them, which need a person to look at them. */
    needsReview: v.array(v.object({ userId: v.string(), profileIds: v.array(v.string()) })),
  }),
  handler: async (ctx) => {
    const byUserId = new Map<string, Doc<"profiles">[]>();

    for await (const profile of ctx.db.query("profiles")) {
      const group = byUserId.get(profile.userId);

      if (group) {
        group.push(profile);
      } else {
        byUserId.set(profile.userId, [profile]);
      }
    }

    const needsReview: { userId: string; profileIds: string[] }[] = [];
    let accounts = 0;
    let deleted = 0;

    for (const [userId, profiles] of byUserId) {
      if (profiles.length < 2) continue;
      accounts += 1;
      const result = await dropStubs(ctx, profiles);
      deleted += result.deleted;

      if (result.kept.length > 0) needsReview.push({ userId, profileIds: result.kept });
    }

    return { accounts, deleted, needsReview };
  },
});
