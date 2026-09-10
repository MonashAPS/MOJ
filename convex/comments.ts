// NOTE (foundation agent): only the "recent comments" side box the home page
// needs. The comments agent owns the rest of convex/comments.ts.

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";

export type RecentComment = {
  _id: Id<"comments">;
  time: number;
  author: string;
  authorRating?: number;
  targetType: "problem" | "contest" | "blog" | "solution";
  targetKey: string;
  targetTitle: string;
  href: string;
};

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<RecentComment[]> => {
    const take = Math.max(1, Math.min(limit ?? 5, 25));
    const rows = await ctx.db
      .query("comments")
      .order("desc")
      .take(take * 3);

    const out: RecentComment[] = [];
    for (const row of rows) {
      if (row.hidden) continue;
      const author = await ctx.db.get(row.authorProfileId);
      const { title, href } = await resolveTarget(ctx, row.targetType, row.targetKey);
      out.push({
        _id: row._id,
        time: row.time,
        author: author ? author.usernameDisplayOverride || author.username : "deleted user",
        authorRating: author?.rating,
        targetType: row.targetType,
        targetKey: row.targetKey,
        targetTitle: title,
        href,
      });
      if (out.length >= take) break;
    }
    return out;
  },
});

async function resolveTarget(
  ctx: any,
  targetType: RecentComment["targetType"],
  targetKey: string,
): Promise<{ title: string; href: string }> {
  if (targetType === "problem" || targetType === "solution") {
    const problem = await ctx.db
      .query("problems")
      .withIndex("by_code", (q: any) => q.eq("code", targetKey))
      .unique();
    const suffix = targetType === "solution" ? "/editorial" : "";
    return {
      title: problem?.name ?? targetKey,
      href: `/problem/${targetKey}${suffix}`,
    };
  }
  if (targetType === "contest") {
    const contest = await ctx.db
      .query("contests")
      .withIndex("by_key", (q: any) => q.eq("key", targetKey))
      .unique();
    return { title: contest?.name ?? targetKey, href: `/contest/${targetKey}` };
  }
  const post = await ctx.db.get(targetKey as Id<"blogPosts">).catch(() => null);
  return {
    title: post?.title ?? "post",
    href: post ? `/post/${post.legacyId ?? post._id}-${post.slug}` : "/blog/",
  };
}
