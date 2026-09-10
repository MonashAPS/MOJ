// NOTE (foundation agent): the home page's announcement feed. The blog agent
// owns the rest of convex/blog.ts and should merge these in.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { optionalViewer } from "./lib/auth";

export type BlogListItem = {
  _id: Id<"blogPosts">;
  legacyId?: number;
  title: string;
  slug: string;
  summary: string;
  content: string;
  publishOn: number;
  sticky: boolean;
  authors: Array<{ username: string; rating?: number; displayRank: string }>;
  commentCount: number;
  href: string;
};

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<BlogListItem[]> => {
    const viewer = await optionalViewer(ctx);
    const staff = !!viewer && (viewer.isStaff || viewer.isSuperuser);
    const now = Date.now();

    const rows = await ctx.db.query("blogPosts").collect();
    const visible = rows.filter((row) => staff || (row.visible && row.publishOn <= now));

    visible.sort((a, b) => {
      if (a.sticky !== b.sticky) return a.sticky ? -1 : 1;
      return b.publishOn - a.publishOn;
    });

    const take = visible.slice(0, Math.max(1, Math.min(limit ?? 10, 50)));
    return await Promise.all(take.map((row) => decorate(ctx, row)));
  },
});

async function decorate(ctx: any, row: Doc<"blogPosts">): Promise<BlogListItem> {
  const authors = await Promise.all(
    row.authorProfileIds.map(async (id: Id<"profiles">) => {
      const profile = await ctx.db.get(id);
      return profile
        ? {
            username: profile.usernameDisplayOverride || profile.username,
            rating: profile.rating,
            displayRank: profile.displayRank,
          }
        : null;
    }),
  );

  const comments = await ctx.db
    .query("comments")
    .withIndex("by_target_time", (q: any) => q.eq("targetType", "blog").eq("targetKey", row._id))
    .collect();

  return {
    _id: row._id,
    legacyId: row.legacyId,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    content: row.content,
    publishOn: row.publishOn,
    sticky: row.sticky,
    authors: authors.filter(Boolean) as BlogListItem["authors"],
    commentCount: comments.filter((comment: Doc<"comments">) => !comment.hidden).length,
    href: `/post/${row.legacyId ?? row._id}-${row.slug}`,
  };
}
