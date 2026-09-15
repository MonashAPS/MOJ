// Data for the syndication feeds, the sitemap and the contest calendar:
// judge/feed.py and judge/sitemap.py.
//
// Everything here is rendered for an anonymous reader, exactly as DMOJ's feeds
// are (`CommentFeed.items` passes `AnonymousUser()`), so nothing private can
// reach a feed even when the request carries a session.

import { commentIsAccessibleBy, problemIsAccessibleBy } from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { type AnyCtx, blogPostHref, loadCommentTarget, siteSettings } from "./lib/community";

export type FeedSite = {
  siteName: string;
  siteLongName: string;
};

export const site = query({
  args: {},
  handler: async (ctx): Promise<FeedSite> => {
    const settings = await siteSettings(ctx);

    return {
      siteName: settings?.siteName ?? "MOJ",
      siteLongName: settings?.siteLongName ?? "MOJ, the MAPS Online Judge",
    };
  },
});

export type FeedItem = {
  id: string;
  title: string;
  link: string;
  /** Markdown; render it with `preset` before putting it in the feed. */
  body: string;
  preset: string;
  published: number;
  updated: number;
};

/** `Problem.get_public_problems()` (judge/models/problem.py:259). */
async function publicProblems(ctx: AnyCtx): Promise<Doc<"problems">[]> {
  const rows = await ctx.db
    .query("problems")
    .withIndex("by_public_date", (q) => q.eq("isPublic", true))
    .order("desc")
    .collect();

  return rows.filter((row) => !row.isOrganizationPrivate);
}

/** `ProblemFeed` (judge/feed.py:11): the 25 newest public problems. */
export const problems = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<FeedItem[]> => {
    const take = Math.max(1, Math.min(limit ?? 25, 100));
    const rows = await publicProblems(ctx);
    rows.sort((a, b) => b.date - a.date || (a._id < b._id ? 1 : -1));

    return rows.slice(0, take).map((row) => ({
      id: row.code,
      title: row.name,
      link: `/problem/${row.code}`,
      body: row.description,
      preset: "problem",
      published: row.date,
      updated: row.date,
    }));
  },
});

/** `CommentFeed` (judge/feed.py:38): the 25 newest publicly visible comments. */
export const comments = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<FeedItem[]> => {
    const take = Math.max(1, Math.min(limit ?? 25, 100));

    const rows = await ctx.db
      .query("comments")
      .order("desc")
      .filter((q) => q.eq(q.field("hidden"), false))
      .take(take * 6);

    const out: FeedItem[] = [];
    const cache = new Map<string, Awaited<ReturnType<typeof loadCommentTarget>>>();

    for (const row of rows) {
      if (out.length >= take) break;
      const cacheKey = `${row.targetType}:${row.targetKey}`;
      let resolved = cache.get(cacheKey);

      if (!resolved) {
        resolved = await loadCommentTarget(ctx, row.targetType, row.targetKey);
        cache.set(cacheKey, resolved);
      }

      if (!resolved.exists) continue;

      if (!commentIsAccessibleBy(resolved.target, null)) continue;

      if (resolved.target.type === "solution") {
        if (
          !resolved.problem ||
          !problemIsAccessibleBy({ ...resolved.problem, id: resolved.problem._id }, null)
        ) {
          continue;
        }
      }

      const author = await ctx.db.get(row.authorProfileId);
      const username = author ? author.usernameDisplayOverride || author.username : "deleted user";
      out.push({
        id: String(row.legacyId ?? row._id),
        title: `${username} -> ${resolved.title}`,
        link: `${resolved.href}#comment-${row.legacyId ?? row._id}`,
        body: row.body,
        preset: "comment",
        published: row.time,
        updated: row.time,
      });
    }

    return out;
  },
});

/** `BlogFeed` (judge/feed.py:70): published posts, sticky first. */
export const blog = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<FeedItem[]> => {
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

    const take = Math.max(1, Math.min(limit ?? 25, 100));

    return rows.slice(0, take).map((row) => ({
      id: String(row.legacyId ?? row._id),
      title: row.title,
      link: blogPostHref(row),
      body: row.summary || row.content,
      preset: "blog",
      published: row.publishOn,
      updated: row.publishOn,
    }));
  },
});

export type SitemapEntry = {
  location: string;
  changefreq: string;
  priority: number;
  lastmod?: number;
};

/** `judge/sitemap.py`, one flat list in the same order DMOJ registers them. */
export const sitemap = query({
  args: {},
  handler: async (ctx): Promise<SitemapEntry[]> => {
    const now = Date.now();

    const out: SitemapEntry[] = [
      { location: "/", changefreq: "hourly", priority: 1.0 },
      { location: "/about/", changefreq: "daily", priority: 0.9 },
    ];

    const problemRows = await publicProblems(ctx);

    for (const row of problemRows) {
      out.push({
        location: `/problem/${row.code}`,
        changefreq: "weekly",
        priority: 0.8,
        lastmod: row.date,
      });
    }

    const publicProblemIds = new Set(problemRows.map((row) => row._id));
    const solutions = await ctx.db.query("solutions").collect();

    for (const solution of solutions) {
      if (!solution.isPublic || solution.publishOn > now) continue;

      if (!publicProblemIds.has(solution.problemId)) continue;
      const problem = problemRows.find((row) => row._id === solution.problemId);

      if (!problem) continue;
      out.push({
        location: `/problem/${problem.code}/editorial`,
        changefreq: "weekly",
        priority: 0.8,
        lastmod: solution.publishOn,
      });
    }

    const posts = await ctx.db
      .query("blogPosts")
      .withIndex("by_visible_publishOn", (q) => q.eq("visible", true).lte("publishOn", now))
      .collect();

    for (const post of posts) {
      out.push({
        location: blogPostHref(post),
        changefreq: "hourly",
        priority: 0.7,
        lastmod: post.publishOn,
      });
    }

    const contestRows = await ctx.db
      .query("contests")
      .withIndex("by_visible_start", (q) => q.eq("isVisible", true))
      .collect();

    for (const contest of contestRows) {
      if (contest.isPrivate || contest.isOrganizationPrivate) continue;
      out.push({
        location: `/contest/${contest.key}`,
        changefreq: "hourly",
        priority: 0.7,
        lastmod: contest.endTime,
      });
    }

    const organizations = await ctx.db.query("organizations").collect();

    for (const organization of organizations) {
      out.push({
        location: `/organization/${organization.legacyId ?? organization._id}-${organization.slug}`,
        changefreq: "weekly",
        priority: 0.5,
      });
    }

    const profiles = await ctx.db.query("profiles").collect();

    for (const profile of profiles) {
      if (profile.isUnlisted) continue;
      out.push({
        location: `/user/${profile.username}`,
        changefreq: "weekly",
        priority: 0.5,
      });
    }

    return out;
  },
});

export type CalendarContest = {
  _id: Id<"contests">;
  key: string;
  name: string;
  summary: string;
  startTime: number;
  endTime: number;
  link: string;
};

/** `/contests.ics`: the contests DMOJ's contest list shows anonymously. */
export const contests = query({
  args: {},
  handler: async (ctx): Promise<CalendarContest[]> => {
    const rows = await ctx.db
      .query("contests")
      .withIndex("by_visible_start", (q) => q.eq("isVisible", true))
      .collect();

    return rows
      .filter((row) => !row.isPrivate && !row.isOrganizationPrivate)
      .sort((a, b) => a.startTime - b.startTime)
      .map((row) => ({
        _id: row._id,
        key: row.key,
        name: row.name,
        summary: row.summary ?? "",
        startTime: row.startTime,
        endTime: row.endTime,
        link: `/contest/${row.key}`,
      }));
  },
});
