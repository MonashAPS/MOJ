// NOTE (foundation agent): only the list query the registration and profile
// forms need. The languages agent owns the rest of convex/languages.ts.

import { v } from "convex/values";
import { query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("languages").collect();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  },
});

export const byKey = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    return await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
  },
});
