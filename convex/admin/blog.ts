// Staff console: blog posts. judge/models/interface.py:60 and DMOJ's
// BlogPostAdmin (judge/admin/interface.py).

import { blogPostIsEditableBy, hasPerm } from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { optionalViewer, requirePerm, requireViewer } from "../lib/auth";
import { authorSummaries, coreRow, coreViewer, revisionsFor, writeRevision } from "../lib/community";
import { forbidden, invalid, notFound } from "../lib/errors";

const POST_PERM = "judge.change_blogpost";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 60);
}

export const list = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    if (!hasPerm(viewer, POST_PERM) && !hasPerm(viewer, "judge.edit_all_post")) return [];

    const rows = await ctx.db.query("blogPosts").collect();
    const editable = rows.filter((row) => blogPostIsEditableBy(coreRow(row), viewer));
    const needle = search?.trim().toLowerCase();
    const filtered = needle
      ? editable.filter((row) => row.title.toLowerCase().includes(needle) || row.slug.includes(needle))
      : editable;

    filtered.sort((a, b) => b.publishOn - a.publishOn);
    return await Promise.all(
      filtered.map(async (row) => ({
        _id: row._id,
        legacyId: row.legacyId,
        title: row.title,
        slug: row.slug,
        visible: row.visible,
        sticky: row.sticky,
        publishOn: row.publishOn,
        authors: await authorSummaries(ctx, row.authorProfileIds),
      })),
    );
  },
});

export const get = query({
  args: { id: v.id("blogPosts") },
  handler: async (ctx, { id }) => {
    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    const row = await ctx.db.get(id);
    if (!row) return null;
    if (!blogPostIsEditableBy(coreRow(row), viewer)) return null;
    return { ...row, authors: await authorSummaries(ctx, row.authorProfileIds) };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    slug: v.optional(v.string()),
    content: v.string(),
    summary: v.optional(v.string()),
    visible: v.optional(v.boolean()),
    sticky: v.optional(v.boolean()),
    publishOn: v.optional(v.number()),
    authorProfileIds: v.optional(v.array(v.id("profiles"))),
    ogImage: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"blogPosts">> => {
    const editor = await requirePerm(ctx, POST_PERM);
    const viewer = await coreViewer(ctx, editor);

    const title = args.title.trim();
    if (title.length === 0) throw invalid("A post needs a title.");
    if (title.length > 100) throw invalid("Post titles are limited to 100 characters.");

    if (args.visible && !hasPerm(viewer, "judge.change_post_visibility")) {
      throw forbidden("Missing permission judge.change_post_visibility.");
    }

    const authors = args.authorProfileIds?.length ? args.authorProfileIds : [editor._id];
    if (!hasPerm(viewer, "judge.edit_all_post") && !authors.includes(editor._id)) {
      throw forbidden("You can only create posts you are an author of.");
    }

    const id = await ctx.db.insert("blogPosts", {
      title,
      slug: args.slug?.trim() || slugify(title) || "post",
      content: args.content,
      summary: args.summary ?? "",
      visible: args.visible ?? false,
      sticky: args.sticky ?? false,
      publishOn: args.publishOn ?? Date.now(),
      authorProfileIds: authors,
      ogImage: args.ogImage,
    });
    await writeRevision(ctx, "blogPost", id, await ctx.db.get(id), editor._id, args.reason ?? "Created post");
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("blogPosts"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    content: v.optional(v.string()),
    summary: v.optional(v.string()),
    visible: v.optional(v.boolean()),
    sticky: v.optional(v.boolean()),
    publishOn: v.optional(v.number()),
    authorProfileIds: v.optional(v.array(v.id("profiles"))),
    ogImage: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const editor = await requireViewer(ctx);
    const viewer = await coreViewer(ctx, editor);
    const row = await ctx.db.get(args.id);
    if (!row) throw notFound("Post");
    if (!blogPostIsEditableBy(coreRow(row), viewer)) throw forbidden();

    if (
      args.visible !== undefined &&
      args.visible !== row.visible &&
      !hasPerm(viewer, "judge.change_post_visibility")
    ) {
      throw forbidden("Missing permission judge.change_post_visibility.");
    }
    if (args.authorProfileIds !== undefined && !hasPerm(viewer, "judge.edit_all_post")) {
      throw forbidden("Only judge.edit_all_post can change a post's authors.");
    }

    const patch: Partial<Doc<"blogPosts">> = {};
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (title.length === 0) throw invalid("A post needs a title.");
      patch.title = title;
    }
    if (args.slug !== undefined) patch.slug = args.slug.trim() || slugify(args.title ?? row.title);
    if (args.content !== undefined) patch.content = args.content;
    if (args.summary !== undefined) patch.summary = args.summary;
    if (args.visible !== undefined) patch.visible = args.visible;
    if (args.sticky !== undefined) patch.sticky = args.sticky;
    if (args.publishOn !== undefined) patch.publishOn = args.publishOn;
    if (args.authorProfileIds !== undefined) patch.authorProfileIds = args.authorProfileIds;
    if (args.ogImage !== undefined) patch.ogImage = args.ogImage;

    await writeRevision(ctx, "blogPost", args.id, row, editor._id, args.reason ?? "Edited post");
    await ctx.db.patch(args.id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("blogPosts"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const editor = await requireViewer(ctx);
    const viewer = await coreViewer(ctx, editor);
    const row = await ctx.db.get(id);
    if (!row) throw notFound("Post");
    if (!blogPostIsEditableBy(coreRow(row), viewer)) throw forbidden();

    await writeRevision(ctx, "blogPost", id, row, editor._id, reason ?? "Deleted post");

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_target_time", (q) => q.eq("targetType", "blog").eq("targetKey", id))
      .collect();
    for (const comment of comments) await ctx.db.delete(comment._id);

    await ctx.db.delete(id);
  },
});

/** The revision list the console's history panel renders. */
export const history = query({
  args: { id: v.id("blogPosts") },
  handler: async (ctx, { id }) => {
    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    const row = await ctx.db.get(id);
    if (!row || !blogPostIsEditableBy(coreRow(row), viewer)) return [];

    const rows = await revisionsFor(ctx, "blogPost", id);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return await Promise.all(
      rows.map(async (revision) => {
        const author = revision.authorProfileId ? await ctx.db.get(revision.authorProfileId) : null;
        return {
          _id: revision._id,
          createdAt: revision.createdAt,
          reason: revision.reason,
          author: author?.username ?? null,
          snapshot: revision.snapshot,
        };
      }),
    );
  },
});
