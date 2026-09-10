// NOTE (foundation agent): only the "new problems" side box the home page
// needs. The problems agent owns the rest of convex/problems.ts.

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";

export type RecentProblem = {
  _id: Id<"problems">;
  code: string;
  name: string;
  points: number;
  date: number;
};

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<RecentProblem[]> => {
    const take = Math.max(1, Math.min(limit ?? 7, 25));
    const rows = await ctx.db
      .query("problems")
      .withIndex("by_public_date", (q) => q.eq("isPublic", true))
      .order("desc")
      .take(take * 2);

    return rows
      .filter((row) => !row.isOrganizationPrivate)
      .slice(0, take)
      .map((row) => ({
        _id: row._id,
        code: row.code,
        name: row.name,
        points: row.points,
        date: row.date,
      }));
  },
});
