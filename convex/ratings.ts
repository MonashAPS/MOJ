/**
 * Contest ratings (Elo-MMR).
 *
 * `rate_contest` (judge/ratings.py:147) computes the numbers; `Contest.rate`
 * (judge/models/contest.py:486) is the chain: rating a contest throws away
 * every rating produced by contests that ended after it and rates them all
 * again in end-time order, so an edit to an old contest cannot leave the later
 * history inconsistent.
 */

import { rateContest as computeRatings, MEAN_INIT, RATING_INIT, type RatingInputRow } from "@moj/core";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, query } from "./_generated/server";
import { contestByKey, toViewerRowInContest } from "./contests/formats";
import { hasPerm, optionalViewer, requireViewer } from "./lib/auth";
import { forbidden, notFound } from "./lib/errors";

const LIVE = 0;

type History = {
  performances: number[];
  lastRating: number | null;
  lastMean: number | null;
  timesRated: number;
};

/** Every rating a profile has, newest rated contest first. */
async function historyFor(ctx: MutationCtx, profileId: Id<"profiles">): Promise<History> {
  const rows = await ctx.db
    .query("ratings")
    .withIndex("by_profile", (q) => q.eq("profileId", profileId))
    .collect();

  const dated: { endTime: number; row: Doc<"ratings"> }[] = [];
  for (const row of rows) {
    const contest = await ctx.db.get(row.contestId);
    if (!contest) continue;
    dated.push({ endTime: contest.endTime, row });
  }
  dated.sort((a, b) => b.endTime - a.endTime);

  const newest = dated[0]?.row;
  return {
    performances: dated.map((entry) => entry.row.performance),
    lastRating: newest?.rating ?? null,
    lastMean: newest?.mean ?? null,
    timesRated: dated.length,
  };
}

/** `rate_contest(contest)` for one contest, writing `ratings` and `profiles.rating`. */
export async function rateOne(ctx: MutationCtx, contest: Doc<"contests">): Promise<number> {
  // A rerun of the same contest replaces its rows rather than doubling them.
  const existing = await ctx.db
    .query("ratings")
    .withIndex("by_contest", (q) => q.eq("contestId", contest._id))
    .collect();
  for (const row of existing) await ctx.db.delete(row._id);

  const participations = await ctx.db
    .query("contestParticipations")
    .withIndex("by_contest_virtual_score", (q) => q.eq("contestId", contest._id).eq("virtual", LIVE))
    .collect();

  const rows: RatingInputRow[] = [];
  const priorHistory: Record<string, number[]> = {};

  for (const participation of participations) {
    const history = await historyFor(ctx, participation.profileId);
    priorHistory[participation.profileId] = history.performances;

    const submissions = await ctx.db
      .query("submissions")
      .withIndex("by_participation", (q) => q.eq("participationId", participation._id))
      .collect();

    rows.push({
      participationId: participation._id,
      profileId: participation.profileId,
      score: participation.score,
      cumtime: participation.cumtime,
      tiebreaker: participation.tiebreaker,
      isDisqualified: participation.isDisqualified,
      virtual: participation.virtual,
      submissionCount: submissions.length,
      lastRating: history.lastRating ?? RATING_INIT,
      lastMean: history.lastMean ?? MEAN_INIT,
      timesRated: history.timesRated,
    });
  }

  const output = computeRatings(rows, {
    contest: {
      rateAll: contest.rateAll,
      ratingFloor: contest.ratingFloor ?? null,
      ratingCeiling: contest.ratingCeiling ?? null,
      performanceCeilingOverride: contest.performanceCeilingOverride ?? null,
      rateExcludeProfileIds: contest.rateExcludeProfileIds,
    },
    priorHistory,
    now: Date.now(),
  });

  for (const row of output) {
    await ctx.db.insert("ratings", {
      profileId: row.profileId as Id<"profiles">,
      contestId: contest._id,
      participationId: row.participationId as Id<"contestParticipations">,
      rank: row.rank,
      rating: row.rating,
      mean: row.mean,
      performance: row.performance,
      lastRated: row.lastRated,
    });
  }

  // `Profile.rating` is the rating of the most recently ended rated contest,
  // for every live participant, not only the ones this contest rated.
  for (const participation of participations) {
    const history = await historyFor(ctx, participation.profileId);
    if (history.lastRating === null) continue;
    await ctx.db.patch(participation.profileId, { rating: history.lastRating });
  }

  return output.length;
}

/**
 * `Contest.rate()` (contest.py:486): rate this contest and every rated contest
 * that ended after it, in end-time order.
 */
export const rateContestInternal = internalMutation({
  args: { contestId: v.id("contests") },
  handler: async (ctx, { contestId }): Promise<{ contests: number; rated: number }> => {
    const contest = await ctx.db.get(contestId);
    if (!contest) return { contests: 0, rated: 0 };
    const now = Date.now();

    const later = (await ctx.db.query("contests").withIndex("by_end").collect()).filter(
      (row) => row.endTime >= contest.endTime && row.endTime <= now,
    );

    // Everything in the window is recomputed, so the stale rows go first.
    for (const row of later) {
      const rows = await ctx.db
        .query("ratings")
        .withIndex("by_contest", (q) => q.eq("contestId", row._id))
        .collect();
      for (const rating of rows) await ctx.db.delete(rating._id);
    }

    let rated = 0;
    let contests = 0;
    for (const row of later.sort((a, b) => a.endTime - b.endTime)) {
      if (!row.isRated) continue;
      rated += await rateOne(ctx, row);
      contests += 1;
    }

    return { contests, rated };
  },
});

/** `/admin` and the contest page's "Rate" button. */
export const rateContest = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<{ contests: number; rated: number }> => {
    const profile = await requireViewer(ctx);
    if (!hasPerm(profile, "judge.contest_rating")) {
      throw forbidden("Missing permission judge.contest_rating.");
    }
    const contest = await contestByKey(ctx, key);
    if (!contest) throw notFound(`Contest "${key}"`);
    if (!contest.isRated) {
      return { contests: 0, rated: 0 };
    }
    return await ctx.runMutation(internal.ratings.rateContestInternal, { contestId: contest._id });
  },
});

/** Drop every rating this contest produced, as DMOJ's "unrate" admin action does. */
export const unrateContest = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<number> => {
    const profile = await requireViewer(ctx);
    if (!hasPerm(profile, "judge.contest_rating")) {
      throw forbidden("Missing permission judge.contest_rating.");
    }
    const contest = await contestByKey(ctx, key);
    if (!contest) throw notFound(`Contest "${key}"`);

    const rows = await ctx.db
      .query("ratings")
      .withIndex("by_contest", (q) => q.eq("contestId", contest._id))
      .collect();
    const profiles = new Set<Id<"profiles">>();
    for (const row of rows) {
      profiles.add(row.profileId);
      await ctx.db.delete(row._id);
    }
    for (const profileId of profiles) {
      const history = await historyFor(ctx, profileId);
      await ctx.db.patch(profileId, { rating: history.lastRating ?? undefined });
    }
    return rows.length;
  },
});

export type RatingHistoryEntry = {
  contestKey: string;
  contestName: string;
  endTime: number;
  rank: number;
  rating: number;
  mean: number;
  performance: number;
  lastRated: number;
};

/** The rating chart on `/user/[user]`. */
export const history = query({
  args: { username: v.string() },
  handler: async (ctx, { username }): Promise<RatingHistoryEntry[] | null> => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile) return null;

    const viewerProfile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, viewerProfile);

    const rows = await ctx.db
      .query("ratings")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();

    const out: RatingHistoryEntry[] = [];
    for (const row of rows) {
      const contest = await ctx.db.get(row.contestId);
      if (!contest) continue;
      // A rating on a contest the viewer cannot see still counts towards the
      // rating, but the contest is not named; DMOJ hides the whole row.
      if (!contest.isVisible && !viewer?.isSuperuser) continue;
      out.push({
        contestKey: contest.key,
        contestName: contest.name,
        endTime: contest.endTime,
        rank: row.rank,
        rating: row.rating,
        mean: row.mean,
        performance: row.performance,
        lastRated: row.lastRated,
      });
    }
    return out.sort((a, b) => a.endTime - b.endTime);
  },
});
