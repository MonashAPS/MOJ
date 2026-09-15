/**
 * The console's job list: the rows behind the progress bars on the jobs screen.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { staffViewer } from "./console";

export const list = query({
  args: { limit: v.optional(v.number()), type: v.optional(v.string()), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await staffViewer(ctx);

    if (!viewer) return [];
    const take = Math.max(1, Math.min(args.limit ?? 50, 200));

    const rows = args.type
      ? await ctx.db
          .query("jobs")
          .withIndex("by_type_createdAt", (q) => q.eq("type", args.type as string))
          .order("desc")
          .take(take)
      : await ctx.db.query("jobs").withIndex("by_type_createdAt").order("desc").take(take);

    const out = [];

    for (const job of rows) {
      if (args.status && job.status !== args.status) continue;
      const author = job.createdByProfileId ? await ctx.db.get(job.createdByProfileId) : null;
      out.push({
        id: job._id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        args: job.args ?? null,
        result: job.result ?? null,
        error: job.error ?? null,
        createdBy: author?.username ?? null,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt ?? null,
      });
    }

    out.sort((a, b) => b.createdAt - a.createdAt);

    return out;
  },
});
