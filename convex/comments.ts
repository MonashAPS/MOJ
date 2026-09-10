// DMOJ's comment system: judge/comments.py, judge/views/comment.py and
// judge/models/comment.py.
//
// Bodies are returned as markdown together with the `@moj/content` preset the
// consumer must render them with; the markdown pipeline pulls in node builtins
// and cannot run inside a Convex query.

import { commentIsAccessibleBy, hasPerm, isStaff, problemIsAccessibleBy } from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { optionalViewer, requirePerm, requireViewer } from "./lib/auth";
import {
  type AuthorSummary,
  authorSummary,
  blogPostHref,
  type CommentTargetType,
  commentMaxBody,
  coreRow,
  coreViewer,
  hasAnySolve,
  loadCommentTarget,
  replyTimeframeMs,
  revisionsFor,
  siteSettings,
  voteHideThreshold,
  writeRevision,
} from "./lib/community";
import { forbidden, invalid, notFound } from "./lib/errors";
import { rateLimiter } from "./lib/rateLimiter";

const targetType = v.union(
  v.literal("problem"),
  v.literal("contest"),
  v.literal("blog"),
  v.literal("solution"),
);

/** The preset `@moj/content` renders comment bodies with. */
export const COMMENT_PRESET = "comment" as const;

export type CommentNode = {
  _id: Id<"comments">;
  legacyId?: number;
  parentId?: Id<"comments">;
  /** 0 for a top level comment. */
  depth: number;
  time: number;
  score: number;
  /** DMOJ's `revisions` counter: 1 means never edited. */
  revisions: number;
  hidden: boolean;
  body: string;
  bodyPreset: typeof COMMENT_PRESET;
  author: AuthorSummary | null;
  /** -1, 0 or 1: the viewer's own vote. */
  myVote: number;
  /** score <= the vote hide threshold: render collapsed with "Show it anyway." */
  belowThreshold: boolean;
  canEdit: boolean;
  canReply: boolean;
  canModerate: boolean;
  href: string;
};

export type CommentList = {
  targetType: CommentTargetType;
  targetKey: string;
  targetTitle: string;
  targetHref: string;
  comments: CommentNode[];
  hasComments: boolean;
  /** A `commentLocks` row exists and the viewer cannot override it. */
  locked: boolean;
  /** The viewer may submit the form at all (logged in, unlocked). */
  canPost: boolean;
  /** DMOJ's `is_new_user`: no solves yet, so the form is replaced by a notice. */
  isNewUser: boolean;
  isMuted: boolean;
  canModerate: boolean;
  voteHideThreshold: number;
  /** Comments older than this can only be replied to with `judge.change_comment`. */
  replyCutoff: number;
};

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `CommentedDetailView.get_context_data` (judge/comments.py:99).
 *
 * Returns null when the page the comments hang off is not accessible, exactly
 * as DMOJ 404s the underlying detail view.
 */
export const list = query({
  args: { targetType, targetKey: v.string() },
  handler: async (ctx, args): Promise<CommentList | null> => {
    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    const resolved = await loadCommentTarget(ctx, args.targetType, args.targetKey);
    if (!resolved.exists) return null;
    if (!commentIsAccessibleBy(resolved.target, viewer)) return null;

    const settings = await siteSettings(ctx);
    const threshold = voteHideThreshold(settings);
    const now = Date.now();
    const replyCutoff = now - replyTimeframeMs(settings);
    const canModerate = hasPerm(viewer, "judge.change_comment");

    const rows = await ctx.db
      .query("comments")
      .withIndex("by_target_time", (q) => q.eq("targetType", args.targetType).eq("targetKey", args.targetKey))
      .collect();

    // DMOJ filters hidden comments out of the page entirely; moderators keep
    // them so the hide can be undone from the page.
    const visible = canModerate ? rows : rows.filter((row) => !row.hidden);

    const votes = new Map<string, number>();
    if (profile) {
      for (const row of visible) {
        const vote = await ctx.db
          .query("commentVotes")
          .withIndex("by_voter_comment", (q) => q.eq("voterProfileId", profile._id).eq("commentId", row._id))
          .unique();
        if (vote) votes.set(row._id, vote.score);
      }
    }

    const authors = new Map<string, AuthorSummary>();
    for (const row of visible) {
      if (authors.has(row.authorProfileId)) continue;
      const author = await ctx.db.get(row.authorProfileId);
      if (author) authors.set(row.authorProfileId, authorSummary(author));
    }

    const lock = await ctx.db
      .query("commentLocks")
      .withIndex("by_target", (q) => q.eq("targetType", args.targetType).eq("targetKey", args.targetKey))
      .unique();
    const locked = lock !== null && !hasPerm(viewer, "judge.override_comment_lock");

    const ordered = orderTree(visible);
    const comments: CommentNode[] = ordered.map(({ row, depth }) => {
      const isAuthor = !!profile && row.authorProfileId === profile._id;
      return {
        _id: row._id,
        legacyId: row.legacyId,
        parentId: row.parentId,
        depth,
        time: row.time,
        score: row.score,
        revisions: row.revisions,
        hidden: row.hidden,
        body: row.body,
        bodyPreset: COMMENT_PRESET,
        author: authors.get(row.authorProfileId) ?? null,
        myVote: votes.get(row._id) ?? 0,
        belowThreshold: row.score <= threshold,
        canEdit: canModerate || (isAuthor && !profile.mute && !row.hidden),
        canReply: !locked && !!profile && (canModerate || row.time > replyCutoff) && !row.hidden,
        canModerate,
        href: `${resolved.href}#comment-${row.legacyId ?? row._id}`,
      };
    });

    const isNewUser = !!profile && !isStaff(viewer) && !(await hasAnySolve(ctx, profile._id));

    return {
      targetType: args.targetType,
      targetKey: args.targetKey,
      targetTitle: resolved.title,
      targetHref: resolved.href,
      comments,
      hasComments: comments.some((comment) => !comment.hidden),
      locked,
      canPost: !!profile && !locked,
      isNewUser,
      isMuted: !!profile && profile.mute,
      canModerate,
      voteHideThreshold: threshold,
      replyCutoff,
    };
  },
});

/**
 * DMOJ's MPTT `order_insertion_by = ['-time']` puts the newest comment first at
 * every level. MOJ keeps that for the top level and reverses it inside a thread
 * so replies read in the order they were written
 */
function orderTree(rows: Doc<"comments">[]): Array<{ row: Doc<"comments">; depth: number }> {
  const children = new Map<string, Doc<"comments">[]>();
  const roots: Doc<"comments">[] = [];
  const byId = new Set(rows.map((row) => row._id as string));

  for (const row of rows) {
    const parent = row.parentId;
    if (parent && byId.has(parent)) {
      const list = children.get(parent);
      if (list) list.push(row);
      else children.set(parent, [row]);
    } else {
      roots.push(row);
    }
  }

  roots.sort((a, b) => b.time - a.time || (a._id < b._id ? -1 : 1));
  for (const list of children.values()) {
    list.sort((a, b) => a.time - b.time || (a._id < b._id ? -1 : 1));
  }

  const out: Array<{ row: Doc<"comments">; depth: number }> = [];
  const walk = (row: Doc<"comments">, depth: number) => {
    out.push({ row, depth });
    for (const child of children.get(row._id) ?? []) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return out;
}

export type CommentRevision = {
  /** 0 for the comment as first posted, matching DMOJ's revision slider. */
  index: number;
  body: string;
  bodyPreset: typeof COMMENT_PRESET;
  author: AuthorSummary | null;
  createdAt: number;
  reason: string;
};

/** `CommentRevisionAjax` (judge/views/comment.py:103). */
export const history = query({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }): Promise<CommentRevision[] | null> => {
    const comment = await ctx.db.get(commentId);
    if (!comment) return null;
    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    if (!(await commentAccessible(ctx, comment, viewer))) return null;
    if (comment.hidden && !hasPerm(viewer, "judge.change_comment")) return null;

    const rows = await revisionsFor(ctx, "comment", commentId);
    rows.sort((a, b) => a.createdAt - b.createdAt);

    const out: CommentRevision[] = [];
    for (const [index, row] of rows.entries()) {
      const author = row.authorProfileId ? await ctx.db.get(row.authorProfileId) : null;
      out.push({
        index,
        body: typeof row.snapshot?.body === "string" ? row.snapshot.body : "",
        bodyPreset: COMMENT_PRESET,
        author: author ? authorSummary(author) : null,
        createdAt: row.createdAt,
        reason: row.reason,
      });
    }
    return out;
  },
});

/** `CommentVotesAjax` (judge/views/comment.py:169): moderators only. */
export const votes = query({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }) => {
    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    if (!hasPerm(viewer, "judge.change_comment")) return null;

    const rows = await ctx.db
      .query("commentVotes")
      .withIndex("by_comment", (q) => q.eq("commentId", commentId))
      .collect();

    const out = [];
    for (const row of rows) {
      const voter = await ctx.db.get(row.voterProfileId);
      out.push({
        _id: row._id,
        score: row.score,
        voter: voter ? authorSummary(voter) : null,
      });
    }
    return out;
  },
});

export type RecentComment = {
  _id: Id<"comments">;
  time: number;
  author: string;
  authorRating?: number;
  targetType: CommentTargetType;
  targetKey: string;
  targetTitle: string;
  href: string;
  score: number;
  body: string;
  bodyPreset: typeof COMMENT_PRESET;
};

/**
 * `Comment.most_recent(user, n)` (judge/models/comment.py:46).
 *
 * Walks the newest comments and keeps the ones whose page the viewer can see.
 * Editorial pages additionally require problem access, as docs/DMOJ_RULES.md
 * notes DMOJ's widget does.
 */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<RecentComment[]> => {
    const take = Math.max(1, Math.min(limit ?? 5, 25));
    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);

    const rows = await ctx.db
      .query("comments")
      .order("desc")
      .filter((q) => q.eq(q.field("hidden"), false))
      .take(take * 6);

    const out: RecentComment[] = [];
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
      if (!commentIsAccessibleBy(resolved.target, viewer)) continue;
      if (
        resolved.target.type === "solution" &&
        (!resolved.problem || !problemIsAccessibleBy(coreRow(resolved.problem), viewer))
      ) {
        continue;
      }

      const author = await ctx.db.get(row.authorProfileId);
      out.push({
        _id: row._id,
        time: row.time,
        author: author ? author.usernameDisplayOverride || author.username : "deleted user",
        authorRating: author?.rating,
        targetType: row.targetType,
        targetKey: row.targetKey,
        targetTitle: resolved.title,
        href: `${resolved.href}#comment-${row.legacyId ?? row._id}`,
        score: row.score,
        body: row.body,
        bodyPreset: COMMENT_PRESET,
      });
    }
    return out;
  },
});

/** Whether the page a comment hangs off is visible to the viewer. */
async function commentAccessible(
  ctx: QueryCtx | MutationCtx,
  comment: Doc<"comments">,
  viewer: Awaited<ReturnType<typeof coreViewer>>,
): Promise<boolean> {
  const resolved = await loadCommentTarget(ctx, comment.targetType, comment.targetKey);
  if (!resolved.exists) return false;
  return commentIsAccessibleBy(resolved.target, viewer);
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/** `CommentForm.clean` + `CommentedDetailView.post` (judge/comments.py:44, :68). */
export const post = mutation({
  args: {
    targetType,
    targetKey: v.string(),
    parentId: v.optional(v.id("comments")),
    body: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"comments">> => {
    const profile = await requireViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    const settings = await siteSettings(ctx);

    if (settings && settings.enableComments === false) {
      throw forbidden("Comments are disabled on this site.");
    }

    const resolved = await loadCommentTarget(ctx, args.targetType, args.targetKey);
    if (!resolved.exists) throw notFound("Page");
    if (!commentIsAccessibleBy(resolved.target, viewer)) throw forbidden();

    const lock = await ctx.db
      .query("commentLocks")
      .withIndex("by_target", (q) => q.eq("targetType", args.targetType).eq("targetKey", args.targetKey))
      .unique();
    if (lock && !hasPerm(viewer, "judge.override_comment_lock")) {
      throw forbidden("Comments are disabled on this page.");
    }

    if (profile.mute) throw invalid("Your part is silent, little toad.");
    if (!isStaff(viewer) && !(await hasAnySolve(ctx, profile._id))) {
      throw invalid("You must solve at least one problem before your voice can be heard.");
    }

    const body = args.body.trim();
    if (body.length === 0) throw invalid("Invalid comment body.");
    const maxBody = commentMaxBody(settings);
    if (body.length > maxBody) {
      throw invalid(`Comments are limited to ${maxBody} characters.`);
    }

    const now = Date.now();
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.hidden) throw notFound("Comment");
      if (parent.targetType !== args.targetType || parent.targetKey !== args.targetKey) {
        throw invalid("That comment is on another page.");
      }
      if (!hasPerm(viewer, "judge.change_comment") && parent.time <= now - replyTimeframeMs(settings)) {
        throw forbidden("That comment is too old to reply to.");
      }
    }

    await rateLimiter.limit(ctx, "commentPost", { key: profile._id, throws: true });

    const commentId = await ctx.db.insert("comments", {
      targetType: args.targetType,
      targetKey: args.targetKey,
      parentId: args.parentId,
      authorProfileId: profile._id,
      time: now,
      score: 0,
      body,
      hidden: false,
      revisions: 1,
    });
    await writeRevision(ctx, "comment", commentId, { body }, profile._id, "Posted comment");
    return commentId;
  },
});

/** `CommentEditAjax` (judge/views/comment.py:134). */
export const edit = mutation({
  args: { commentId: v.id("comments"), body: v.string() },
  handler: async (ctx, { commentId, body }) => {
    const profile = await requireViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    const comment = await ctx.db.get(commentId);
    if (!comment) throw notFound("Comment");
    if (!(await commentAccessible(ctx, comment, viewer))) throw notFound("Comment");

    if (!hasPerm(viewer, "judge.change_comment")) {
      if (comment.authorProfileId !== profile._id || profile.mute || comment.hidden) {
        throw forbidden();
      }
    }

    const trimmed = body.trim();
    if (trimmed.length === 0) throw invalid("Invalid comment body.");
    const maxBody = commentMaxBody(await siteSettings(ctx));
    if (trimmed.length > maxBody) {
      throw invalid(`Comments are limited to ${maxBody} characters.`);
    }
    if (trimmed === comment.body) return commentId;

    await ctx.db.patch(commentId, { body: trimmed, revisions: comment.revisions + 1 });
    await writeRevision(ctx, "comment", commentId, { body: trimmed }, profile._id, "Edited from site");
    return commentId;
  },
});

async function requireVoter(ctx: MutationCtx): Promise<Doc<"profiles">> {
  const profile = await requireViewer(ctx);
  const viewer = await coreViewer(ctx, profile);
  if (!isStaff(viewer) && !(await hasAnySolve(ctx, profile._id))) {
    throw invalid("You must solve at least one problem before you can vote.");
  }
  if (profile.mute) throw invalid("Your part is silent, little toad.");
  return profile;
}

/**
 * `vote_comment` (judge/views/comment.py:27).
 *
 * Voting the opposite way to an existing vote removes it; voting the same way
 * twice is rejected.
 */
export const vote = mutation({
  args: { commentId: v.id("comments"), delta: v.union(v.literal(1), v.literal(-1)) },
  handler: async (ctx, { commentId, delta }) => {
    const profile = await requireVoter(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment || comment.hidden) throw notFound("Comment");
    if (comment.authorProfileId === profile._id) {
      throw invalid("You cannot vote on your own comments.");
    }

    const existing = await ctx.db
      .query("commentVotes")
      .withIndex("by_voter_comment", (q) => q.eq("voterProfileId", profile._id).eq("commentId", commentId))
      .unique();

    if (!existing) {
      await ctx.db.insert("commentVotes", {
        voterProfileId: profile._id,
        commentId,
        score: delta,
      });
      await ctx.db.patch(commentId, { score: comment.score + delta });
      return { score: comment.score + delta, myVote: delta };
    }

    if (-existing.score !== delta) throw invalid("You already voted.");
    await ctx.db.delete(existing._id);
    await ctx.db.patch(commentId, { score: comment.score - existing.score });
    return { score: comment.score - existing.score, myVote: 0 };
  },
});

/** Clears the viewer's vote whatever direction it was in. */
export const unvote = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }) => {
    const profile = await requireViewer(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment) throw notFound("Comment");

    const existing = await ctx.db
      .query("commentVotes")
      .withIndex("by_voter_comment", (q) => q.eq("voterProfileId", profile._id).eq("commentId", commentId))
      .unique();
    if (!existing) return { score: comment.score, myVote: 0 };

    await ctx.db.delete(existing._id);
    await ctx.db.patch(commentId, { score: comment.score - existing.score });
    return { score: comment.score - existing.score, myVote: 0 };
  },
});

async function descendants(ctx: MutationCtx, root: Id<"comments">): Promise<Id<"comments">[]> {
  const out: Id<"comments">[] = [root];
  const queue: Id<"comments">[] = [root];
  while (queue.length > 0) {
    const next = queue.pop();
    if (!next) break;
    const children = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) => q.eq("parentId", next))
      .collect();
    for (const child of children) {
      out.push(child._id);
      queue.push(child._id);
    }
  }
  return out;
}

/** `comment_hide` (judge/views/comment.py:181): hides the whole subtree. */
export const hide = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }) => {
    await requirePerm(ctx, "judge.change_comment");
    const comment = await ctx.db.get(commentId);
    if (!comment) throw notFound("Comment");
    for (const id of await descendants(ctx, commentId)) {
      await ctx.db.patch(id, { hidden: true });
    }
  },
});

/** Undoes `hide` for one comment; children stay hidden unless unhidden too. */
export const unhide = mutation({
  args: { commentId: v.id("comments"), includeReplies: v.optional(v.boolean()) },
  handler: async (ctx, { commentId, includeReplies }) => {
    await requirePerm(ctx, "judge.change_comment");
    const comment = await ctx.db.get(commentId);
    if (!comment) throw notFound("Comment");
    const ids = includeReplies ? await descendants(ctx, commentId) : [commentId];
    for (const id of ids) await ctx.db.patch(id, { hidden: false });
  },
});

/** `CommentLock` (judge/models/comment.py:172). */
export const lock = mutation({
  args: { targetType, targetKey: v.string() },
  handler: async (ctx, args) => {
    await requirePerm(ctx, "judge.change_commentlock");
    const existing = await ctx.db
      .query("commentLocks")
      .withIndex("by_target", (q) => q.eq("targetType", args.targetType).eq("targetKey", args.targetKey))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("commentLocks", {
      targetType: args.targetType,
      targetKey: args.targetKey,
    });
  },
});

export const unlock = mutation({
  args: { targetType, targetKey: v.string() },
  handler: async (ctx, args) => {
    await requirePerm(ctx, "judge.change_commentlock");
    const existing = await ctx.db
      .query("commentLocks")
      .withIndex("by_target", (q) => q.eq("targetType", args.targetType).eq("targetKey", args.targetKey))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Every locked page, for the staff console. */
export const locks = query({
  args: {},
  handler: async (ctx) => {
    const profile = await optionalViewer(ctx);
    const viewer = await coreViewer(ctx, profile);
    if (!hasPerm(viewer, "judge.change_commentlock")) return [];

    const rows = await ctx.db.query("commentLocks").collect();
    const out = [];
    for (const row of rows) {
      const resolved = await loadCommentTarget(ctx, row.targetType, row.targetKey);
      out.push({
        _id: row._id,
        targetType: row.targetType,
        targetKey: row.targetKey,
        title: resolved.title,
        href: resolved.href,
      });
    }
    return out;
  },
});

export { blogPostHref };
