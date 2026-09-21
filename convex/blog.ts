// DMOJ's blog: judge/views/blog.py and judge/models/interface.py.
//
// Post bodies are returned as markdown with the `@moj/content` preset the
// consumer renders them with

import { blogPostCanSee, blogPostIsEditableBy } from "@moj/core";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { optionalViewer } from "./lib/auth";
import {
  type AuthorSummary,
  authorSummaries,
  blogPostByKey,
  blogPostHref,
  coreRow,
  coreViewer,
  type OffsetPage,
  siteSettings,
  sliceOffset,
} from "./lib/community";

/** The preset `@moj/content` renders post bodies and summaries with. */
export const BLOG_PRESET = "blog" as const;

export type BlogListItem = {
  _id: Id<"blogPosts">;
  legacyId?: number;
  title: string;
  slug: string;
  summary: string;
  content: string;
  contentPreset: typeof BLOG_PRESET;
  publishOn: number;
  sticky: boolean;
  /** The home page shows the whole post, not the summary. */
  expanded: boolean;
  visible: boolean;
  ogImage?: string;
  authors: Array<{ username: string; rating?: number; displayRank: string }>;
  commentCount: number;
  href: string;
};

export type BlogPostDetail = BlogListItem & {
  authorProfiles: AuthorSummary[];
  canEdit: boolean;
  /** DMOJ's OpenGraph description falls back to the summary, then the content. */
  metaDescription: string;
};

/**
 * `BlogPost.objects.filter(visible=True, publish_on__lte=now)` ordered
 * `-sticky, -publish_on`, widened to everything the viewer may edit.
 */
async function visiblePosts(
  ctx: Parameters<typeof optionalViewer>[0],
  profile: Doc<"profiles"> | null,
): Promise<Doc<"blogPosts">[]> {
  const viewer = await coreViewer(ctx, profile);
  const now = Date.now();

  const published = await ctx.db
    .query("blogPosts")
    .withIndex("by_visible_publishOn", (q) => q.eq("visible", true).lte("publishOn", now))
    .order("desc")
    .collect();

  // Authors and `judge.edit_all_post` holders also see drafts and future posts.
  let rows = published;

  if (profile) {
    const all = await ctx.db.query("blogPosts").collect();

    const extra = all.filter(
      (row) => !(row.visible && row.publishOn <= now) && blogPostCanSee(coreRow(row), viewer, now),
    );

    rows = [...published, ...extra];
  }

  rows.sort((a, b) => {
    if (a.sticky !== b.sticky) return a.sticky ? -1 : 1;

    return b.publishOn - a.publishOn;
  });

  return rows;
}

async function decorate(
  ctx: Parameters<typeof optionalViewer>[0],
  row: Doc<"blogPosts">,
): Promise<BlogListItem> {
  const authors = await authorSummaries(ctx, row.authorProfileIds);

  const comments = await ctx.db
    .query("comments")
    .withIndex("by_target_time", (q) => q.eq("targetType", "blog").eq("targetKey", row._id))
    .collect();

  return {
    _id: row._id,
    legacyId: row.legacyId,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    content: row.content,
    contentPreset: BLOG_PRESET,
    publishOn: row.publishOn,
    sticky: row.sticky,
    expanded: row.expanded,
    visible: row.visible,
    ogImage: row.ogImage,
    authors: authors.map((author) => ({
      username: author.displayName,
      rating: author.rating,
      displayRank: author.displayRank,
    })),
    commentCount: comments.filter((comment) => !comment.hidden).length,
    href: blogPostHref(row),
  };
}

/**
 * The home page's announcement feed. Kept array-shaped because the shell
 * already consumes it; `/blog/` uses `paginated`.
 */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<BlogListItem[]> => {
    const profile = await optionalViewer(ctx);
    const rows = await visiblePosts(ctx, profile);
    const take = rows.slice(0, Math.max(1, Math.min(limit ?? 10, 50)));

    return await Promise.all(take.map((row) => decorate(ctx, row)));
  },
});

/** `PostList` (judge/views/blog.py:19), DMOJ's ten-per-page blog index. */
export const paginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }): Promise<OffsetPage<BlogListItem>> => {
    const profile = await optionalViewer(ctx);
    const settings = await siteSettings(ctx);
    const perPage = paginationOpts.numItems || settings?.blogPostsPerPage || 10;
    const rows = await visiblePosts(ctx, profile);
    const sliced = sliceOffset(rows, paginationOpts.cursor, perPage);

    return {
      ...sliced,
      page: await Promise.all(sliced.page.map((row) => decorate(ctx, row))),
    };
  },
});

/** `PostView.get_object` (judge/views/blog.py:118): 404 unless `can_see`. */
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }): Promise<BlogPostDetail | null> => {
    const row = await blogPostByKey(ctx, id);

    if (!row) return null;

    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);

    if (!blogPostCanSee(coreRow(row), viewer)) return null;

    const base = await decorate(ctx, row);

    return {
      ...base,
      authorProfiles: await authorSummaries(ctx, row.authorProfileIds),
      canEdit: blogPostIsEditableBy(coreRow(row), viewer),
      metaDescription: row.summary || row.content,
    };
  },
});

/** The newest posts, for the feed and the sitemap. */
export const published = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const now = Date.now();

    const rows = await ctx.db
      .query("blogPosts")
      .withIndex("by_visible_publishOn", (q) => q.eq("visible", true).lte("publishOn", now))
      .order("desc")
      .collect();

    rows.sort((a, b) => {
      if (a.sticky !== b.sticky) return a.sticky ? -1 : 1;

      return b.publishOn - a.publishOn;
    });

    const take = limit === undefined ? rows : rows.slice(0, Math.max(1, Math.min(limit, 200)));

    return take.map((row) => ({
      _id: row._id,
      legacyId: row.legacyId,
      title: row.title,
      slug: row.slug,
      summary: row.summary,
      content: row.content,
      contentPreset: BLOG_PRESET,
      publishOn: row.publishOn,
      sticky: row.sticky,
      expanded: row.expanded,
      href: blogPostHref(row),
    }));
  },
});
