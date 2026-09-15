// Shared helpers for the community modules (comments, blog, tickets, site,
// judges, stats, feeds). Nothing here is a Convex function; every export is a
// plain helper the modules call.

import {
  type CommentTarget,
  DEFAULT_SUBMISSION_SOURCE_VISIBILITY,
  type GlobalSubmissionSourceVisibility,
  type ProfileRow,
} from "@moj/core";
import type { Value } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { contestByKey } from "../contests/formats";
import { problemByCode } from "../problems";

export type AnyCtx = QueryCtx | MutationCtx;

/**
 * `@moj/core` takes plain rows keyed by `id`; Convex documents are keyed by
 * `_id`. This is the one adapter both directions of that go through.
 */
export function coreRow<T extends { _id: string }>(doc: T): T & { id: string };
export function coreRow<T extends { _id: string }>(doc: T | null): (T & { id: string }) | null;
export function coreRow<T extends { _id: string }>(doc: T | null): (T & { id: string }) | null {
  return doc === null ? null : { ...doc, id: doc._id };
}

export type CommentTargetType = "problem" | "contest" | "blog" | "solution";

/** `DMOJ_COMMENT_VOTE_HIDE_THRESHOLD` (dmoj/settings.py:95). */
export const COMMENT_VOTE_HIDE_THRESHOLD = -5;

/** `DMOJ_COMMENT_REPLY_TIMEFRAME` (dmoj/settings.py:96): 365 days. */
export const COMMENT_REPLY_TIMEFRAME_MS = 365 * 24 * 60 * 60 * 1000;

/** `Comment.body` max_length (judge/models/comment.py). */
export const COMMENT_MAX_BODY = 8192;

/** `DMOJ_STATS_LANGUAGE_THRESHOLD` (dmoj/settings.py:106). */
export const STATS_LANGUAGE_THRESHOLD = 10;

/** `DMOJ_BLOG_NEW_PROBLEM_COUNT` (dmoj/settings.py:85). */
export const BLOG_NEW_PROBLEM_COUNT = 7;

/** `Ticket.title` max_length (judge/models/ticket.py). */
export const TICKET_MAX_TITLE = 100;

export type SiteSettings = Doc<"siteSettings"> | null;

export async function siteSettings(ctx: AnyCtx): Promise<SiteSettings> {
  return await ctx.db
    .query("siteSettings")
    .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
    .unique();
}

export function voteHideThreshold(settings: SiteSettings): number {
  return settings?.commentVoteHideThreshold ?? COMMENT_VOTE_HIDE_THRESHOLD;
}

export function replyTimeframeMs(settings: SiteSettings): number {
  const days = settings?.commentReplyTimeframeDays;

  return days === undefined ? COMMENT_REPLY_TIMEFRAME_MS : days * 24 * 60 * 60 * 1000;
}

export function commentMaxBody(settings: SiteSettings): number {
  return settings?.commentMaxBodyLength ?? COMMENT_MAX_BODY;
}

/**
 * `settings.DMOJ_SUBMISSION_SOURCE_VISIBILITY`, the default every problem left
 * on `F` follows. All 313 imported problems are on `F`, so this setting alone
 * decides who may read their source.
 */
export function globalSourceVisibility(settings: SiteSettings): GlobalSubmissionSourceVisibility {
  return settings?.submissionSourceVisibility ?? DEFAULT_SUBMISSION_SOURCE_VISIBILITY;
}

/* -------------------------------------------------------------------------- */
/* Viewers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Builds the plain `ProfileRow` `@moj/core` expects out of a Convex profile.
 *
 * The pure rules read organization, class and current-contest membership off
 * the viewer; Convex keeps those in separate tables, so they are gathered here
 * once per request and passed down.
 */
export async function coreViewer(
  ctx: AnyCtx,
  profile: Doc<"profiles"> | null | undefined,
): Promise<ProfileRow | null> {
  if (!profile) return null;

  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .collect();

  const [organizations, classes] = await Promise.all([
    ctx.db.query("organizations").collect(),
    ctx.db.query("classes").collect(),
  ]);

  let currentContestId: string | null = null;

  if (profile.currentParticipationId) {
    const participation = await ctx.db.get(profile.currentParticipationId);
    currentContestId = participation ? participation.contestId : null;
  }

  return {
    id: profile._id,
    username: profile.username,
    isStaff: profile.isStaff,
    isSuperuser: profile.isSuperuser,
    permissions: profile.permissions,
    organizationIds: memberships.map((row) => row.organizationId),
    classIds: classes.filter((row) => row.memberProfileIds.includes(profile._id)).map((row) => row._id),
    adminOfOrganizationIds: organizations
      .filter((row) => row.adminProfileIds.includes(profile._id))
      .map((row) => row._id),
    adminOfClassIds: classes.filter((row) => row.adminProfileIds.includes(profile._id)).map((row) => row._id),
    isUnlisted: profile.isUnlisted,
    isBannedFromProblemVoting: profile.isBannedFromProblemVoting,
    mute: profile.mute,
    currentParticipationId: profile.currentParticipationId ?? null,
    currentContestId,
    rating: profile.rating ?? null,
    displayRank: profile.displayRank,
    points: profile.points,
    performancePoints: profile.performancePoints,
    problemCount: profile.problemCount,
  };
}

export type AuthorSummary = {
  _id: Id<"profiles">;
  username: string;
  displayName: string;
  rating?: number;
  displayRank: string;
};

export function authorSummary(profile: Doc<"profiles">): AuthorSummary {
  return {
    _id: profile._id,
    username: profile.username,
    displayName: profile.usernameDisplayOverride || profile.username,
    rating: profile.rating,
    displayRank: profile.displayRank,
  };
}

export async function authorSummaries(ctx: AnyCtx, ids: readonly Id<"profiles">[]): Promise<AuthorSummary[]> {
  const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));

  return rows.filter((row): row is Doc<"profiles"> => row !== null).map(authorSummary);
}

/**
 * `Profile.has_any_solves` (judge/models/profile.py:226): a non-archived, fully
 * scored AC submission exists.
 */
export async function hasAnySolve(ctx: AnyCtx, profileId: Id<"profiles">): Promise<boolean> {
  const solve = await ctx.db
    .query("submissions")
    .withIndex("by_profile_date", (q) => q.eq("profileId", profileId))
    .filter((q) =>
      q.and(
        q.eq(q.field("result"), "AC"),
        q.eq(q.field("isArchived"), false),
        q.gte(q.field("casePoints"), q.field("caseTotal")),
      ),
    )
    .first();

  return solve !== null;
}

/* -------------------------------------------------------------------------- */
/* Comment targets                                                            */
/* -------------------------------------------------------------------------- */

export type ResolvedTarget = {
  /** The union `@moj/core`'s `commentIsAccessibleBy` takes. */
  target: CommentTarget;
  /** `Comment.page_title`. */
  title: string;
  /** `Comment.link`. */
  href: string;
  exists: boolean;
  problem: Doc<"problems"> | null;
  contest: Doc<"contests"> | null;
  post: Doc<"blogPosts"> | null;
  solution: Doc<"solutions"> | null;
};

export function blogPostHref(post: Doc<"blogPosts">): string {
  return `/post/${post.legacyId ?? post._id}-${post.slug}`;
}

/** Accepts either a Convex id or the imported DMOJ id for a blog post. */
export async function blogPostByKey(ctx: AnyCtx, key: string): Promise<Doc<"blogPosts"> | null> {
  const numeric = Number(key);

  if (Number.isInteger(numeric) && key.trim() !== "") {
    const byLegacy = await ctx.db
      .query("blogPosts")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", numeric))
      .unique();

    if (byLegacy) return byLegacy;
  }

  const id = ctx.db.normalizeId("blogPosts", key);

  return id ? await ctx.db.get(id) : null;
}

export async function loadCommentTarget(
  ctx: AnyCtx,
  targetType: CommentTargetType,
  targetKey: string,
): Promise<ResolvedTarget> {
  const empty = { problem: null, contest: null, post: null, solution: null };

  if (targetType === "problem") {
    const problem = await problemByCode(ctx, targetKey);

    return {
      ...empty,
      problem,
      target: { type: "problem", problem: coreRow(problem) },
      title: problem?.name ?? "<deleted>",
      href: `/problem/${targetKey}`,
      exists: problem !== null,
    };
  }

  if (targetType === "solution") {
    const problem = await problemByCode(ctx, targetKey);

    const solution = problem
      ? await ctx.db
          .query("solutions")
          .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
          .unique()
      : null;

    return {
      ...empty,
      problem,
      solution,
      target: { type: "solution", solution, problem: coreRow(problem) },
      title: problem ? `Editorial for ${problem.name}` : "<deleted>",
      href: `/problem/${targetKey}/editorial`,
      exists: problem !== null && solution !== null,
    };
  }

  if (targetType === "contest") {
    const contest = await contestByKey(ctx, targetKey);

    return {
      ...empty,
      contest,
      target: { type: "contest", contest: coreRow(contest) },
      title: contest?.name ?? "<deleted>",
      href: `/contest/${targetKey}`,
      exists: contest !== null,
    };
  }

  const post = await blogPostByKey(ctx, targetKey);

  return {
    ...empty,
    post,
    target: { type: "blog", post: coreRow(post) },
    title: post?.title ?? "<deleted>",
    href: post ? blogPostHref(post) : "/blog/",
    exists: post !== null,
  };
}

/* -------------------------------------------------------------------------- */
/* Revisions                                                                  */
/* -------------------------------------------------------------------------- */

/** What a revision reads when nobody said why. */
export const DEFAULT_REVISION_REASON = "Edited from the staff console";

/**
 * The one writer of the `revisions` table. A blank reason (the console's box,
 * left empty) is stored as `DEFAULT_REVISION_REASON` rather than as nothing.
 */
export async function writeRevision(
  ctx: MutationCtx,
  entityType: string,
  entityId: string,
  snapshot: Value,
  authorProfileId: Id<"profiles"> | undefined,
  reason: string,
): Promise<Id<"revisions">> {
  return await ctx.db.insert("revisions", {
    entityType,
    entityId,
    snapshot,
    authorProfileId,
    reason: reason.trim() || DEFAULT_REVISION_REASON,
    createdAt: Date.now(),
  });
}

export async function revisionsFor(
  ctx: AnyCtx,
  entityType: string,
  entityId: string,
): Promise<Doc<"revisions">[]> {
  return await ctx.db
    .query("revisions")
    .withIndex("by_entity", (q) => q.eq("entityType", entityType).eq("entityId", entityId))
    .collect();
}

/* -------------------------------------------------------------------------- */
/* Keys                                                                       */
/* -------------------------------------------------------------------------- */

const KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A judge authentication key, DMOJ's `Judge.auth_key` shape (100 chars max). */
export function generateJudgeKey(length = 64): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";

  for (const byte of bytes) out += KEY_ALPHABET[byte % KEY_ALPHABET.length];

  return out;
}

/* -------------------------------------------------------------------------- */
/* Offset pagination                                                          */
/* -------------------------------------------------------------------------- */

export type OffsetPage<T> = {
  page: T[];
  isDone: boolean;
  continueCursor: string;
  /** Total matching rows, so the page bar can render DMOJ's "Page x of y". */
  totalCount: number;
};

export function offsetFrom(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const parsed = Number(cursor);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function sliceOffset<T>(
  rows: T[],
  cursor: string | null | undefined,
  numItems: number,
): OffsetPage<T> {
  const start = offsetFrom(cursor);
  const size = Math.max(1, Math.min(numItems, 200));
  const page = rows.slice(start, start + size);
  const end = start + page.length;

  return {
    page,
    isDone: end >= rows.length,
    continueCursor: String(end),
    totalCount: rows.length,
  };
}
