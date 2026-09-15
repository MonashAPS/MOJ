/**
 * The leaderboard, `/users/`.
 *
 * Ports `UserList`, `users` and `user_ranking_redirect` from
 * judge/views/user.py. Listed users only, 100 per page, ranks from
 * judge/utils/ranker.py seeded with the page offset so a rank is the user's
 * position on the whole board, not in the page.
 */

import { ranker } from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { profilesByPP, profilesByProblemCount, profilesByRating } from "./lib/aggregates";
import { optionalViewer, requireStaff } from "./lib/auth";

/** `UserList.paginate_by`. */
export const USERS_PER_PAGE = 100;

export const userSort = v.union(
  v.literal("performancePoints"),
  v.literal("points"),
  v.literal("problemCount"),
  v.literal("rating"),
);

export type UserSort = "performancePoints" | "points" | "problemCount" | "rating";

const SORT_INDEX = {
  performancePoints: "by_listed_pp",
  points: "by_listed_points",
  problemCount: "by_listed_problemCount",
  rating: "by_listed_rating",
} as const;

export type LeaderboardRow = {
  _id: Id<"profiles">;
  username: string;
  displayName: string;
  displayRank: string;
  points: number;
  performancePoints: number;
  problemCount: number;
  rating?: number;
  rank: number;
};

export type UsersPage = {
  /** Set when the viewer is in contest mode: `/users/` shows that scoreboard. */
  contestScoreboard: { key: string; name: string } | null;
  users: LeaderboardRow[];
  page: number;
  perPage: number;
  totalUsers: number;
  totalPages: number;
  hasMore: boolean;
  sort: UserSort;
  descending: boolean;
  organizationSlug: string | null;
};

function toRow(profile: Doc<"profiles">, rank: number): LeaderboardRow {
  return {
    _id: profile._id,
    username: profile.username,
    displayName: profile.usernameDisplayOverride || profile.username,
    displayRank: profile.displayRank,
    points: profile.points,
    performancePoints: profile.performancePoints,
    problemCount: profile.problemCount,
    rating: profile.rating,
    rank,
  };
}

/** `ranker(key=attrgetter('performance_points', 'problem_count'))`, whatever the sort column is. */
function rankKey(profile: Doc<"profiles">): string {
  return `${profile.performancePoints}:${profile.problemCount}`;
}

async function listedTotal(ctx: QueryCtx): Promise<number> {
  return await profilesByPP.count(ctx, { namespace: false, bounds: {} });
}

async function organizationMemberProfiles(ctx: QueryCtx, slug: string): Promise<Doc<"profiles">[] | null> {
  const organization = await ctx.db
    .query("organizations")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (!organization) return null;

  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
    .collect();

  const profiles: Doc<"profiles">[] = [];

  for (const membership of memberships) {
    const profile = await ctx.db.get(membership.profileId);

    if (profile && !profile.isUnlisted) profiles.push(profile);
  }

  return profiles;
}

function sortValue(profile: Doc<"profiles">, sort: UserSort): number {
  switch (sort) {
    case "points":
      return profile.points;
    case "problemCount":
      return profile.problemCount;
    case "rating":
      return profile.rating ?? Number.NEGATIVE_INFINITY;
    default:
      return profile.performancePoints;
  }
}

/**
 * `users(request)` (judge/views/user.py:466): in contest mode the page is the
 * contest scoreboard instead, so say so and let the route redirect.
 */
export const users = query({
  args: {
    page: v.optional(v.number()),
    sort: v.optional(userSort),
    descending: v.optional(v.boolean()),
    organizationSlug: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<UsersPage> => {
    const viewer = await optionalViewer(ctx);
    const sort: UserSort = args.sort ?? "performancePoints";
    const descending = args.descending ?? true;
    const page = Math.max(1, Math.floor(args.page ?? 1));
    const organizationSlug = args.organizationSlug ?? null;

    const empty: UsersPage = {
      contestScoreboard: null,
      users: [],
      page,
      perPage: USERS_PER_PAGE,
      totalUsers: 0,
      totalPages: 1,
      hasMore: false,
      sort,
      descending,
      organizationSlug,
    };

    if (viewer?.currentParticipationId) {
      const participation = await ctx.db.get(viewer.currentParticipationId);
      const contest = participation ? await ctx.db.get(participation.contestId) : null;

      if (contest) {
        return { ...empty, contestScoreboard: { key: contest.key, name: contest.name } };
      }
    }

    const offset = (page - 1) * USERS_PER_PAGE;

    let pageRows: Doc<"profiles">[];
    let totalUsers: number;

    if (organizationSlug) {
      const members = await organizationMemberProfiles(ctx, organizationSlug);

      if (members === null) return empty;
      members.sort((a, b) => {
        const delta = sortValue(a, sort) - sortValue(b, sort);

        if (delta !== 0) return descending ? -delta : delta;

        return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
      });
      totalUsers = members.length;
      pageRows = members.slice(offset, offset + USERS_PER_PAGE);
    } else {
      const scanned = await ctx.db
        .query("profiles")
        .withIndex(SORT_INDEX[sort], (q) => q.eq("isUnlisted", false))
        .order(descending ? "desc" : "asc")
        .take(offset + USERS_PER_PAGE);

      // `order_by(self.order, 'id')`: the index orders ties by document id in
      // the same direction as the sort column, so re-break them ascending.
      scanned.sort((a, b) => {
        const delta = sortValue(a, sort) - sortValue(b, sort);

        if (delta !== 0) return descending ? -delta : delta;

        return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
      });
      pageRows = scanned.slice(offset);
      totalUsers = await listedTotal(ctx);
    }

    const ranked = ranker(pageRows, rankKey, offset);
    const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PER_PAGE));

    return {
      ...empty,
      users: ranked.map(({ rank, item }) => toRow(item, rank)),
      totalUsers,
      totalPages,
      hasMore: offset + pageRows.length < totalUsers,
    };
  },
});

export type UserFind = {
  username: string;
  /** Listed users strictly ahead of this one, so the board rank is `offset + 1`. */
  offset: number;
  rank: number;
  page: number;
  isUnlisted: boolean;
} | null;

/**
 * `/users/find` (`user_ranking_redirect`, judge/views/user.py:479): the number
 * of listed users ahead of `username` by performance points, with the document
 * id breaking ties, and the page that lands on.
 */
export const find = query({
  args: { username: v.string() },
  handler: async (ctx, { username }): Promise<UserFind> => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (!profile) return null;

    if (profile.isUnlisted) {
      return { username: profile.username, offset: 0, rank: 0, page: 1, isUnlisted: true };
    }

    // `user_ranking_redirect`: users with more performance points, plus users on
    // the same points whose id sorts first. The aggregate orders ties by id
    // ascending, so the second half is a bounded count rather than an `indexOf`
    // with the id, which would count the tie from the wrong end.
    const ahead = await profilesByPP.count(ctx, {
      namespace: false,
      bounds: { lower: { key: profile.performancePoints, inclusive: false } },
    });

    const tiedBefore = await profilesByPP.count(ctx, {
      namespace: false,
      bounds: {
        lower: { key: profile.performancePoints, inclusive: true },
        upper: { key: profile.performancePoints, id: profile._id, inclusive: false },
      },
    });

    const offset = ahead + tiedBefore;

    return {
      username: profile.username,
      offset,
      rank: offset + 1,
      page: Math.floor(offset / USERS_PER_PAGE) + 1,
      isUnlisted: false,
    };
  },
});

export type TopUser = {
  _id: Id<"profiles">;
  username: string;
  displayName: string;
  performancePoints: number;
  rating?: number;
  displayRank: string;
};

/** The home page side box. */
export const top = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<TopUser[]> => {
    const take = Math.max(1, Math.min(limit ?? 10, 50));

    const rows = await ctx.db
      .query("profiles")
      .withIndex("by_listed_pp", (q) => q.eq("isUnlisted", false))
      .order("desc")
      .take(take);

    return rows.map((row) => ({
      _id: row._id,
      username: row.username,
      displayName: row.usernameDisplayOverride || row.username,
      performancePoints: row.performancePoints,
      rating: row.rating,
      displayRank: row.displayRank,
    }));
  },
});

/** Kept for the shell, which shipped against this name before `top` existed. */
export const topUsers = top;

/* -------------------------------------------------------------------------- */
/* Aggregate maintenance                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The three profile aggregates back `find` and the leaderboard total. Convex
 * has no automatic triggers here, so every mutation that inserts a profile or
 * changes `performancePoints`, `points`, `problemCount`, `rating` or
 * `isUnlisted` must go through these. `rebuildAggregates` repairs the tree
 * after an import, which writes documents straight into the table.
 */
export async function insertProfileAggregates(ctx: MutationCtx, profile: Doc<"profiles">): Promise<void> {
  await profilesByPP.insertIfDoesNotExist(ctx, profile);
  await profilesByRating.insertIfDoesNotExist(ctx, profile);
  await profilesByProblemCount.insertIfDoesNotExist(ctx, profile);
}

export async function replaceProfileAggregates(
  ctx: MutationCtx,
  before: Doc<"profiles">,
  after: Doc<"profiles">,
): Promise<void> {
  await profilesByPP.replaceOrInsert(ctx, before, after);
  await profilesByRating.replaceOrInsert(ctx, before, after);
  await profilesByProblemCount.replaceOrInsert(ctx, before, after);
}

export async function deleteProfileAggregates(ctx: MutationCtx, profile: Doc<"profiles">): Promise<void> {
  await profilesByPP.deleteIfExists(ctx, profile);
  await profilesByRating.deleteIfExists(ctx, profile);
  await profilesByProblemCount.deleteIfExists(ctx, profile);
}

/** Patch a profile and keep the aggregates in step. */
export async function patchProfile(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  patch: Partial<Doc<"profiles">>,
): Promise<Doc<"profiles">> {
  const before = await ctx.db.get(profileId);

  if (!before) throw new Error("profile disappeared");
  await ctx.db.patch(profileId, patch);
  const after = await ctx.db.get(profileId);

  if (!after) throw new Error("profile disappeared");
  await replaceProfileAggregates(ctx, before, after);

  return after;
}

export const rebuildAggregates = internalMutation({
  args: { cursor: v.optional(v.string()), batch: v.optional(v.number()) },
  handler: async (ctx, { cursor, batch }) => {
    const size = Math.max(1, Math.min(batch ?? 200, 500));

    if (!cursor) {
      await profilesByPP.clearAll(ctx);
      await profilesByRating.clearAll(ctx);
      await profilesByProblemCount.clearAll(ctx);
    }

    const result = await ctx.db.query("profiles").paginate({ cursor: cursor ?? null, numItems: size });

    for (const profile of result.page) {
      await insertProfileAggregates(ctx, profile);
    }

    return { cursor: result.continueCursor, isDone: result.isDone, done: result.page.length };
  },
});

/** Staff-triggered repair, so the console can fix a drifted tree without a CLI. */
export const repairAggregates = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    await profilesByPP.clearAll(ctx);
    await profilesByRating.clearAll(ctx);
    await profilesByProblemCount.clearAll(ctx);
    const profiles = await ctx.db.query("profiles").collect();

    for (const profile of profiles) {
      await insertProfileAggregates(ctx, profile);
    }

    return profiles.length;
  },
});
