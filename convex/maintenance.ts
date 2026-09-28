import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Run against the transitional optional-field schema before removing the fields.
export const removeTimezonePreferences = internalMutation({
  args: {
    table: v.union(v.literal("profiles"), v.literal("siteSettings")),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { table, cursor }) => {
    const field = table === "profiles" ? "timezone" : "defaultUserTimezone";
    const batch = await ctx.db.query(table).paginate({ cursor: cursor ?? null, numItems: 100 });

    for (const doc of batch.page) {
      await ctx.db.patch(doc._id, { [field]: undefined });
    }

    return { isDone: batch.isDone, cursor: batch.continueCursor };
  },
});
