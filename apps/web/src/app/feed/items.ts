// Turns the `feeds.*` Convex queries into feed entries.
// judge/feed.py: ProblemFeed, CommentFeed and BlogFeed.

import { api } from "@convex/_generated/api";
import { renderMarkdown } from "@moj/content";
import { query } from "@/lib/convex-server";
import type { FeedEntry, FeedMeta } from "./xml";

/**
 * Markdown to HTML for a feed body, under the preset the item travels with.
 * A feed is read outside the site, so nothing is highlighted and no image is
 * lazy-loaded: both need CSS the reader does not have.
 */
async function renderBody(body: string, preset: string): Promise<string> {
  if (!body.trim()) return "";
  const { html } = await renderMarkdown(body, preset, { highlight: false, lazyLoadImages: false });
  return html;
}

export type FeedKind = "problems" | "comment" | "blog";

const PROBLEM_DESCRIPTION_LIMIT = 500;

export async function loadFeed(
  kind: FeedKind,
  format: "rss" | "atom",
): Promise<{
  meta: FeedMeta;
  entries: FeedEntry[];
}> {
  const site = await query(api.feeds.site, {}).catch(() => ({
    siteName: "MOJ",
    siteLongName: "MOJ, the MAPS Online Judge",
  }));

  if (kind === "problems") {
    const items = await query(api.feeds.problems, { limit: 25 }).catch(() => []);
    return {
      meta: {
        title: `Recently Added ${site.siteName} Problems`,
        description: `The latest problems added on the ${site.siteLongName} website`,
        link: "/",
        self: `/feed/problems/${format}/`,
      },
      entries: await Promise.all(
        items.map(async (item) => ({
          id: item.id,
          title: item.title,
          link: item.link,
          // DMOJ truncates the rendered problem statement at 500 characters.
          descriptionHtml: `${(await renderBody(item.body, item.preset)).slice(0, PROBLEM_DESCRIPTION_LIMIT)}...`,
          published: item.published,
          updated: item.updated,
        })),
      ),
    };
  }

  if (kind === "comment") {
    const items = await query(api.feeds.comments, { limit: 25 }).catch(() => []);
    return {
      meta: {
        title: `Latest ${site.siteName} Comments`,
        description: `The latest comments on the ${site.siteLongName} website`,
        link: "/",
        self: `/feed/comment/${format}/`,
      },
      entries: await Promise.all(
        items.map(async (item) => ({
          id: item.id,
          title: item.title,
          link: item.link,
          descriptionHtml: await renderBody(item.body, item.preset),
          published: item.published,
          updated: item.updated,
        })),
      ),
    };
  }

  const items = await query(api.feeds.blog, { limit: 25 }).catch(() => []);
  return {
    meta: {
      title: `Latest ${site.siteName} Blog Posts`,
      description: `The latest blog posts from the ${site.siteLongName}`,
      link: "/",
      self: `/feed/blog/${format}/`,
    },
    entries: await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        title: item.title,
        link: item.link,
        descriptionHtml: await renderBody(item.body, item.preset),
        published: item.published,
        updated: item.updated,
      })),
    ),
  };
}
