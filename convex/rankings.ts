// NOTE (foundation agent): only the "top users" side box the home page needs.
// The rankings agent owns the rest of convex/rankings.ts and should replace
// this scan with the profilesByPP aggregate.

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";

export type TopUser = {
  _id: Id<"profiles">;
  username: string;
  performancePoints: number;
  rating?: number;
  displayRank: string;
};

export const topUsers = query({
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
      username: row.usernameDisplayOverride || row.username,
      performancePoints: row.performancePoints,
      rating: row.rating,
      displayRank: row.displayRank,
    }));
  },
});
