/**
 * User accounts: `/user/[user]`, `/user/[user]/solved` and `/edit/profile/`.
 * The API token and the data export are beside it in `profiles/apiTokens.ts`
 * and `profiles/dataExport.ts`.
 *
 * Ports `UserPage`, `UserAboutPage`, `UserProblemsPage` and `edit_profile`
 * from judge/views/user.py, and `Profile.calculate_points` /
 * `get_pp_breakdown` through `@moj/core`.
 *
 * Markdown is not rendered here. `@moj/content` pulls in Shiki's WASM engine,
 * which does not belong in a Convex isolate, so `about` comes back as source
 * with the preset the page must render it under.
 */

import {
  calculateProfilePoints,
  isFullSolve,
  longStatus,
  PP_ENTRIES,
  PP_TABLE,
  ratingClass,
  resultClassFromCode,
} from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { optionalViewer, requireStaff, requireViewer } from "./lib/auth";
import { forbidden, invalid, notFound } from "./lib/errors";
import { isNonEmptyString } from "./lib/json";
import { insertProfileAggregates, patchProfile } from "./rankings";
import { siteSkin, siteTheme } from "./schema";

export const DEFAULT_TIMEZONE = "Australia/Melbourne";

/** `settings.DMOJ_USER_MAX_ORGANIZATION_COUNT`. */
export const MAX_OPEN_ORGANIZATIONS = 3;

/** `UserProblemsPage.get_context_data` asks for the first ten weights. */
const PP_PREVIEW_ENTRIES = 10;

/** How far back the profile scans a user's submissions before giving up. */
const SUBMISSION_SCAN_CAP = 20000;

const profileDefaults = {
  about: "",
  points: 0,
  performancePoints: 0,
  problemCount: 0,
  displayRank: "user" as const,
  mute: false,
  isUnlisted: false,
  isBannedFromProblemVoting: false,
  mathEngine: "auto",
  siteTheme: "auto" as const,
  editorTheme: "github",
  notes: "",
  isStaff: false,
  isSuperuser: false,
  isActive: true,
  permissions: [],
  groups: [],
};

async function languageIdForKey(
  ctx: QueryCtx,
  key: string | undefined,
): Promise<Id<"languages"> | undefined> {
  if (!key) return undefined;

  const language = await ctx.db
    .query("languages")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  return language?._id;
}

export async function profileByUsername(
  ctx: QueryCtx | MutationCtx,
  username: string,
): Promise<Doc<"profiles"> | null> {
  return await ctx.db
    .query("profiles")
    .withIndex("by_username", (q) => q.eq("username", username))
    .unique();
}

/** The profile ids behind a list of usernames, refusing one that does not exist. */
export async function usernamesToIds(
  ctx: QueryCtx | MutationCtx,
  usernames: readonly string[],
): Promise<Id<"profiles">[]> {
  const ids: Id<"profiles">[] = [];

  for (const username of usernames) {
    const profile = await profileByUsername(ctx, username);

    if (!profile) throw notFound(`User ${username}`);
    ids.push(profile._id);
  }

  return ids;
}

export const byUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => await profileByUsername(ctx, username),
});

export const byUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const ensureProfile = mutation({
  args: {
    username: v.string(),
    timezone: v.optional(v.string()),
    languageKey: v.optional(v.string()),
    about: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) throw invalid("You must be logged in to create a profile.");
    // The username comes off the token, never off the argument: the caller is a
    // client whose cached session can lag a sign-out by a render, and taking its
    // word would let one account write another's name onto its profile.
    const claimed = identity.username;
    const username = isNonEmptyString(claimed) ? claimed : args.username;

    return await upsertProfile(ctx, { ...args, username, userId: identity.subject });
  },
});

export const ensureProfileForUser = internalMutation({
  args: {
    userId: v.string(),
    username: v.string(),
    timezone: v.optional(v.string()),
    languageKey: v.optional(v.string()),
    about: v.optional(v.string()),
    isStaff: v.optional(v.boolean()),
    isSuperuser: v.optional(v.boolean()),
    permissions: v.optional(v.array(v.string())),
    displayRank: v.optional(v.union(v.literal("user"), v.literal("setter"), v.literal("admin"))),
  },
  handler: async (ctx, args) => await upsertProfile(ctx, args),
});

async function upsertProfile(
  ctx: MutationCtx,
  args: {
    userId: string;
    username: string;
    timezone?: string;
    languageKey?: string;
    about?: string;
    isStaff?: boolean;
    isSuperuser?: boolean;
    permissions?: string[];
    displayRank?: "user" | "setter" | "admin";
  },
): Promise<Id<"profiles">> {
  const existing: Doc<"profiles"> | null = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .unique();

  const languageId = await languageIdForKey(ctx, args.languageKey);

  if (existing) {
    const patch: Partial<Doc<"profiles">> = { username: args.username };

    if (args.timezone) patch.timezone = args.timezone;

    if (languageId) patch.languageId = languageId;

    if (args.about !== undefined) patch.about = args.about;

    if (args.isStaff !== undefined) patch.isStaff = args.isStaff;

    if (args.isSuperuser !== undefined) patch.isSuperuser = args.isSuperuser;

    if (args.permissions !== undefined) patch.permissions = args.permissions;

    if (args.displayRank !== undefined) patch.displayRank = args.displayRank;
    await patchProfile(ctx, existing._id, patch);

    return existing._id;
  }

  const profileId = await ctx.db.insert("profiles", {
    ...profileDefaults,
    userId: args.userId,
    username: args.username,
    timezone: args.timezone ?? DEFAULT_TIMEZONE,
    languageId,
    about: args.about ?? "",
    isStaff: args.isStaff ?? false,
    isSuperuser: args.isSuperuser ?? false,
    permissions: args.permissions ?? [],
    displayRank: args.displayRank ?? "user",
    joinDate: Date.now(),
  });

  const inserted = await ctx.db.get(profileId);

  if (inserted) await insertProfileAggregates(ctx, inserted);

  return profileId;
}

/* -------------------------------------------------------------------------- */
/* The user page                                                              */
/* -------------------------------------------------------------------------- */

export type SolvedProblem = {
  problemId: Id<"problems">;
  code: string;
  name: string;
  /** The user's best score on the problem. */
  points: number;
  /** `problem.points`, DMOJ's `total`. */
  total: number;
  group: string;
};

export type SolvedGroup = {
  name: string;
  points: number;
  problems: SolvedProblem[];
};

export type PPBreakdownEntry = {
  points: number;
  /** `PP_TABLE[i] * 100`, a percentage as DMOJ renders it. */
  weight: number;
  scaledPoints: number;
  problemName: string;
  problemCode: string;
  submissionId: Id<"submissions">;
  submissionDate: number;
  submissionPoints: number;
  submissionTotal: number;
  resultClass: string;
  shortStatus: string;
  longStatus: string;
  language: string;
};

export type RatingHistoryEntry = {
  label: string;
  contestKey: string;
  rating: number;
  ranking: number;
  timestamp: number;
  ratingClass: string;
};

export type UserPageData = {
  profile: {
    _id: Id<"profiles">;
    userId: string;
    username: string;
    displayName: string;
    displayRank: string;
    points: number;
    performancePoints: number;
    problemCount: number;
    rating?: number;
    isUnlisted: boolean;
    isStaff: boolean;
    mute: boolean;
    joinDate: number;
    lastAccess?: number;
    timezone: string;
  };
  /** `about` as markdown; render with the preset named beside it. */
  about: string;
  aboutPreset: "self-description";
  /** `Profile.objects.filter(performance_points__gt=...).count() + 1`. */
  rank: number;
  ratingRank: number | null;
  contestsWritten: number;
  ratingStats: { current: number; min: number; max: number } | null;
  organizations: { _id: Id<"organizations">; slug: string; name: string; shortName: string }[];
  authoredProblems: { code: string; name: string }[];
  /** `UserProblemsPage.best_submissions`: solved problems by group. */
  bestSubmissions: SolvedGroup[];
  ppBreakdown: PPBreakdownEntry[];
  ppHasMore: boolean;
  ratingHistory: RatingHistoryEntry[];
  /** `{ "2026-09-10": 4, ... }` for the heat map, plus DMOJ's `min_year`. */
  submissionActivity: { counts: Record<string, number>; minYear: number | null };
  /** True when the user has more submissions than one query may read. */
  truncated: boolean;
  isViewer: boolean;
};

type ScannedSubmission = Doc<"submissions">;

async function scanSubmissions(
  ctx: QueryCtx,
  profileId: Id<"profiles">,
): Promise<{ rows: ScannedSubmission[]; truncated: boolean }> {
  const rows = await ctx.db
    .query("submissions")
    .withIndex("by_profile_date", (q) => q.eq("profileId", profileId))
    .order("desc")
    .take(SUBMISSION_SCAN_CAP + 1);

  if (rows.length > SUBMISSION_SCAN_CAP) {
    return { rows: rows.slice(0, SUBMISSION_SCAN_CAP), truncated: true };
  }

  return { rows, truncated: false };
}

/** `Problem.get_public_problems()`: public and not organization-private. */
function isCountedProblem(problem: Doc<"problems"> | null | undefined): problem is Doc<"problems"> {
  return !!problem && problem.isPublic && !problem.isOrganizationPrivate;
}

async function loadProblems(
  ctx: QueryCtx,
  ids: Iterable<Id<"problems">>,
): Promise<Map<Id<"problems">, Doc<"problems">>> {
  const map = new Map<Id<"problems">, Doc<"problems">>();

  for (const id of new Set(ids)) {
    const problem = await ctx.db.get(id);

    if (problem) map.set(id, problem);
  }

  return map;
}

/**
 * `UserProblemsPage.get_context_data`: every public problem with a scoring
 * submission, grouped by problem group and ordered by group name then code.
 */
function buildBestSubmissions(
  rows: readonly ScannedSubmission[],
  problems: Map<Id<"problems">, Doc<"problems">>,
  groupNames: Map<Id<"problemGroups">, string>,
  exclude: ReadonlySet<Id<"problems">>,
): SolvedGroup[] {
  const best = new Map<Id<"problems">, number>();

  for (const row of rows) {
    if (row.isArchived) continue;

    if (row.points === undefined || row.points === null || row.points <= 0) continue;
    const problem = problems.get(row.problemId);

    if (!isCountedProblem(problem)) continue;

    if (exclude.has(row.problemId)) continue;
    const current = best.get(row.problemId);

    if (current === undefined || row.points > current) best.set(row.problemId, row.points);
  }

  const flat: SolvedProblem[] = [];

  for (const [problemId, points] of best) {
    const problem = problems.get(problemId);

    if (!problem) continue;
    flat.push({
      problemId,
      code: problem.code,
      name: problem.name,
      points,
      total: problem.points,
      group: groupNames.get(problem.groupId) ?? "",
    });
  }

  flat.sort((a, b) => (a.group === b.group ? a.code.localeCompare(b.code) : a.group.localeCompare(b.group)));

  const groups: SolvedGroup[] = [];

  for (const problem of flat) {
    const last = groups[groups.length - 1];

    if (last && last.name === problem.group) {
      last.problems.push(problem);
      last.points += problem.points;
    } else {
      groups.push({ name: problem.group, points: problem.points, problems: [problem] });
    }
  }

  return groups;
}

/**
 * `judge/performance_points.py:get_pp_breakdown`. For every public problem the
 * user scored on, the highest score and the latest submission that achieved it,
 * ordered by score descending, weighted by `PP_TABLE`.
 */
async function buildPPBreakdown(
  ctx: QueryCtx,
  rows: readonly ScannedSubmission[],
  problems: Map<Id<"problems">, Doc<"problems">>,
  start: number,
  end: number,
): Promise<{ entries: PPBreakdownEntry[]; hasMore: boolean }> {
  const best = new Map<Id<"problems">, { points: number; submission: ScannedSubmission }>();

  for (const row of rows) {
    if (row.isArchived) continue;

    if (row.points === undefined || row.points === null) continue;
    const problem = problems.get(row.problemId);

    if (!isCountedProblem(problem)) continue;
    const current = best.get(row.problemId);

    if (
      current === undefined ||
      row.points > current.points ||
      (row.points === current.points && row.date > current.submission.date)
    ) {
      best.set(row.problemId, { points: row.points, submission: row });
    }
  }

  const ordered = [...best.entries()]
    .filter(([, entry]) => entry.points > 0)
    .sort((a, b) => {
      if (b[1].points !== a[1].points) return b[1].points - a[1].points;

      return b[1].submission.date - a[1].submission.date;
    });

  // DMOJ's `LIMIT end - start + 1 OFFSET start`: one row past the window tells
  // the caller whether there is more.
  const window = ordered.slice(start, start + (end - start) + 1);

  const entries: PPBreakdownEntry[] = [];
  const weights = PP_TABLE.slice(start, end);

  for (let i = 0; i < Math.min(weights.length, window.length); i++) {
    const pair = window[i];
    const weight = weights[i];

    if (!pair || weight === undefined) continue;
    const [problemId, { points, submission }] = pair;
    const problem = problems.get(problemId);

    if (!problem) continue;
    const language = await ctx.db.get(submission.languageId);
    entries.push({
      points,
      weight: weight * 100,
      scaledPoints: points * weight,
      problemName: problem.name,
      problemCode: problem.code,
      submissionId: submission._id,
      submissionDate: submission.date,
      submissionPoints: submission.casePoints,
      submissionTotal: submission.caseTotal,
      resultClass:
        resultClassFromCode(submission.result ?? null, submission.casePoints, submission.caseTotal) ?? "",
      shortStatus: submission.result ?? "",
      longStatus: longStatus(submission),
      language: language ? language.shortName || language.key : "",
    });
  }

  const hasMore = end < Math.min(PP_TABLE.length, start + window.length);

  return { entries, hasMore };
}

/** The heat map on a user page: submissions per day, and the first year with any. */
type SubmissionActivity = {
  counts: Record<string, number>;
  minYear: number | null;
};

function buildSubmissionActivity(rows: readonly ScannedSubmission[]): SubmissionActivity {
  const counts: Record<string, number> = {};
  let minYear: number | null = null;

  for (const row of rows) {
    const date = new Date(row.date);
    const key = date.toISOString().slice(0, 10);
    counts[key] = (counts[key] ?? 0) + 1;
    const year = date.getUTCFullYear();

    if (minYear === null || year < minYear) minYear = year;
  }

  return { counts, minYear };
}

export const userPage = query({
  args: { username: v.string() },
  handler: async (ctx, { username }): Promise<UserPageData | null> => {
    const profile = await profileByUsername(ctx, username);

    if (!profile) return null;
    const viewer = await optionalViewer(ctx);

    // `UserPage.get_context_data`: rank by performance points, then the rating
    // rank when the user has ever been rated.
    const ahead = await ctx.db
      .query("profiles")
      .withIndex("by_listed_pp", (q) =>
        q.eq("isUnlisted", false).gt("performancePoints", profile.performancePoints),
      )
      .collect();

    const rank = ahead.filter((row) => row._id !== profile._id).length + 1;

    const ratingRows = await ctx.db
      .query("ratings")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();

    let ratingRank: number | null = null;

    const rating = profile.rating;

    if (rating !== undefined && ratingRows.length > 0) {
      const ratedAhead = await ctx.db
        .query("profiles")
        .withIndex("by_listed_rating", (q) => q.eq("isUnlisted", false).gt("rating", rating))
        .collect();

      ratingRank = ratedAhead.length + 1;
    }

    const ratingHistory: RatingHistoryEntry[] = [];
    let minRating = Number.POSITIVE_INFINITY;
    let maxRating = Number.NEGATIVE_INFINITY;

    for (const row of ratingRows) {
      const contest = await ctx.db.get(row.contestId);

      if (!contest) continue;
      minRating = Math.min(minRating, row.rating);
      maxRating = Math.max(maxRating, row.rating);
      ratingHistory.push({
        label: contest.name,
        contestKey: contest.key,
        rating: row.rating,
        ranking: row.rank,
        timestamp: contest.endTime,
        ratingClass: ratingClass(row.rating),
      });
    }

    ratingHistory.sort((a, b) => a.timestamp - b.timestamp);

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();

    const organizations: UserPageData["organizations"] = [];

    for (const membership of memberships) {
      const organization = await ctx.db.get(membership.organizationId);

      if (!organization) continue;
      organizations.push({
        _id: organization._id,
        slug: organization.slug,
        name: organization.name,
        shortName: organization.shortName,
      });
    }

    organizations.sort((a, b) => a.name.localeCompare(b.name));

    const { rows, truncated } = await scanSubmissions(ctx, profile._id);

    const problems = await loadProblems(
      ctx,
      rows.map((row) => row.problemId),
    );

    const groupNames = new Map<Id<"problemGroups">, string>();

    for (const problem of problems.values()) {
      if (groupNames.has(problem.groupId)) continue;
      const group = await ctx.db.get(problem.groupId);
      groupNames.set(problem.groupId, group?.fullName ?? group?.name ?? "");
    }

    const bestSubmissions = buildBestSubmissions(rows, problems, groupNames, new Set());
    const { entries, hasMore } = await buildPPBreakdown(ctx, rows, problems, 0, PP_PREVIEW_ENTRIES);

    const authored = await ctx.db.query("problems").collect();

    const authoredProblems = authored
      .filter(
        (problem) =>
          problem.isPublic &&
          !problem.isOrganizationPrivate &&
          problem.authorProfileIds.includes(profile._id),
      )
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((problem) => ({ code: problem.code, name: problem.name }));

    return {
      profile: {
        _id: profile._id,
        userId: profile.userId,
        username: profile.username,
        displayName: profile.usernameDisplayOverride || profile.username,
        displayRank: profile.displayRank,
        points: profile.points,
        performancePoints: profile.performancePoints,
        problemCount: profile.problemCount,
        rating: profile.rating,
        isUnlisted: profile.isUnlisted,
        isStaff: profile.isStaff,
        mute: profile.mute,
        joinDate: profile.joinDate,
        lastAccess: profile.lastAccess,
        timezone: profile.timezone,
      },
      about: profile.about,
      aboutPreset: "self-description",
      rank,
      ratingRank,
      contestsWritten: ratingRows.length,
      ratingStats:
        ratingRows.length > 0 && profile.rating !== undefined
          ? { current: profile.rating, min: minRating, max: maxRating }
          : null,
      organizations,
      authoredProblems,
      bestSubmissions,
      ppBreakdown: entries,
      ppHasMore: hasMore,
      ratingHistory,
      submissionActivity: buildSubmissionActivity(rows),
      truncated,
      isViewer: !!viewer && viewer._id === profile._id,
    };
  },
});

/** `UserPerformancePointsAjax`: the rest of the weight table, on demand. */
export const performancePoints = query({
  args: { username: v.string(), start: v.optional(v.number()), end: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ entries: PPBreakdownEntry[]; hasMore: boolean }> => {
    const profile = await profileByUsername(ctx, args.username);

    if (!profile) return { entries: [], hasMore: false };

    let start = Math.floor(args.start ?? 0);
    let end = Math.floor(args.end ?? PP_ENTRIES);

    if (start < 0 || end < 0 || start > end) {
      start = 0;
      end = 100;
    }

    const { rows } = await scanSubmissions(ctx, profile._id);

    const problems = await loadProblems(
      ctx,
      rows.map((row) => row.problemId),
    );

    return await buildPPBreakdown(ctx, rows, problems, start, end);
  },
});

/**
 * `/user/[user]/solved`. `compareWithViewer` is spec section 20's "compare with
 * me": drop everything the viewer has already fully solved.
 */
export const solved = query({
  args: { username: v.string(), compareWithViewer: v.optional(v.boolean()) },
  handler: async (
    ctx,
    { username, compareWithViewer },
  ): Promise<{
    username: string;
    displayName: string;
    groups: SolvedGroup[];
    totalPoints: number;
    comparedWith: string | null;
    truncated: boolean;
  } | null> => {
    const profile = await profileByUsername(ctx, username);

    if (!profile) return null;

    const viewer = await optionalViewer(ctx);
    const exclude: Set<Id<"problems">> = new Set();
    let comparedWith: string | null = null;

    if (compareWithViewer && viewer && viewer._id !== profile._id) {
      const viewerRows = await scanSubmissions(ctx, viewer._id);

      for (const row of viewerRows.rows) {
        if (!row.isArchived && isFullSolve(row)) exclude.add(row.problemId);
      }

      comparedWith = viewer.username;
    }

    const { rows, truncated } = await scanSubmissions(ctx, profile._id);

    const problems = await loadProblems(
      ctx,
      rows.map((row) => row.problemId),
    );

    const groupNames = new Map<Id<"problemGroups">, string>();

    for (const problem of problems.values()) {
      if (groupNames.has(problem.groupId)) continue;
      const group = await ctx.db.get(problem.groupId);
      groupNames.set(problem.groupId, group?.fullName ?? group?.name ?? "");
    }

    const groups = buildBestSubmissions(rows, problems, groupNames, exclude);

    return {
      username: profile.username,
      displayName: profile.usernameDisplayOverride || profile.username,
      groups,
      totalPoints: groups.reduce((sum, group) => sum + group.points, 0),
      comparedWith,
      truncated,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Editing a profile                                                          */
/* -------------------------------------------------------------------------- */

/** `Profile.has_any_solves`, which `ProfileForm.clean_about` requires. */
async function hasAnySolves(ctx: QueryCtx, profileId: Id<"profiles">): Promise<boolean> {
  const rows = await ctx.db
    .query("submissions")
    .withIndex("by_profile_date", (q) => q.eq("profileId", profileId))
    .order("desc")
    .take(SUBMISSION_SCAN_CAP);

  return rows.some((row) => !row.isArchived && isFullSolve(row));
}

async function setOrganizations(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  slugs: readonly string[],
): Promise<void> {
  const wanted: Doc<"organizations">[] = [];

  for (const slug of new Set(slugs)) {
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!organization) throw notFound(`Organization ${slug}`);
    wanted.push(organization);
  }

  const existing = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .collect();

  const existingIds = new Set(existing.map((row) => row.organizationId));

  // `ProfileForm.__init__`: without `judge.edit_all_organization` only open
  // organizations and ones the user is already in may be picked.
  const mayPickAny = profile.isSuperuser || profile.permissions.includes("judge.edit_all_organization");

  for (const organization of wanted) {
    if (mayPickAny) continue;

    if (!organization.isOpen && !existingIds.has(organization._id)) {
      throw forbidden(`You may not join ${organization.name}.`);
    }
  }

  // `ProfileForm.clean`: at most three open organizations.
  const openCount = wanted.filter((organization) => organization.isOpen).length;

  if (openCount > MAX_OPEN_ORGANIZATIONS) {
    throw invalid(`You may not be part of more than ${MAX_OPEN_ORGANIZATIONS} public organizations.`);
  }

  const wantedIds = new Set(wanted.map((organization) => organization._id));

  for (const membership of existing) {
    if (wantedIds.has(membership.organizationId)) continue;
    await ctx.db.delete(membership._id);
    await bumpMemberCount(ctx, membership.organizationId, -1);
  }

  let order = existing.length;

  for (const organization of wanted) {
    if (existingIds.has(organization._id)) continue;
    await ctx.db.insert("organizationMemberships", {
      organizationId: organization._id,
      profileId: profile._id,
      order: order++,
    });
    await bumpMemberCount(ctx, organization._id, 1);
  }
}

export async function bumpMemberCount(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  delta: number,
): Promise<void> {
  const organization = await ctx.db.get(organizationId);

  if (!organization) return;
  await ctx.db.patch(organizationId, {
    memberCount: Math.max(0, organization.memberCount + delta),
  });
}

export const updateProfile = mutation({
  args: {
    about: v.optional(v.string()),
    timezone: v.optional(v.string()),
    languageKey: v.optional(v.string()),
    siteTheme: v.optional(siteTheme),
    editorTheme: v.optional(v.string()),
    mathEngine: v.optional(v.string()),
    organizationSlugs: v.optional(v.array(v.string())),
    usernameDisplayOverride: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);

    // `edit_profile`: "Your part is silent, little toad."
    if (profile.mute) throw forbidden("Your part is silent, little toad.");

    const patch: Partial<Doc<"profiles">> = {};

    if (args.about !== undefined && args.about !== profile.about) {
      if (args.about.length > 20000) throw invalid("About is too long.");

      if (!(await hasAnySolves(ctx, profile._id))) {
        throw invalid("You must solve at least one problem before you can update your profile.");
      }

      patch.about = args.about;
    }

    if (args.timezone !== undefined) patch.timezone = args.timezone;

    if (args.siteTheme !== undefined) patch.siteTheme = args.siteTheme;

    if (args.editorTheme !== undefined) patch.editorTheme = args.editorTheme;

    if (args.mathEngine !== undefined) patch.mathEngine = args.mathEngine;

    if (args.languageKey !== undefined) {
      const languageId = await languageIdForKey(ctx, args.languageKey);

      if (!languageId) throw notFound("Language");
      patch.languageId = languageId;
    }

    if (args.usernameDisplayOverride !== undefined) {
      // DMOJ only exposes this through the admin, so staff only.
      if (!profile.isStaff && !profile.isSuperuser) {
        throw forbidden("Only staff may set a display name override.");
      }

      patch.usernameDisplayOverride = args.usernameDisplayOverride || undefined;
    }

    if (args.organizationSlugs !== undefined) {
      await setOrganizations(ctx, profile, args.organizationSlugs);
    }

    await patchProfile(ctx, profile._id, patch);

    return profile._id;
  },
});

/**
 * The viewer's own look: light or dark, and which skin.
 *
 * Both are optional and only what arrives is written, because the two controls
 * are separate and each one saves on its own. The profile is where a choice
 * made on one machine is picked up on the next.
 */
export const setTheme = mutation({
  args: { siteTheme: v.optional(siteTheme), siteSkin: v.optional(siteSkin) },
  handler: async (ctx, args) => {
    const profile = await optionalViewer(ctx);

    if (!profile) return null;
    const patch: Partial<Doc<"profiles">> = {};

    if (args.siteTheme !== undefined) patch.siteTheme = args.siteTheme;

    if (args.siteSkin !== undefined) patch.siteSkin = args.siteSkin;
    await ctx.db.patch(profile._id, patch);

    return { siteTheme: args.siteTheme ?? profile.siteTheme, siteSkin: args.siteSkin ?? profile.siteSkin };
  },
});

export const touchAccess = mutation({
  args: { ip: v.optional(v.string()) },
  handler: async (ctx, { ip }) => {
    const profile = await optionalViewer(ctx);

    if (!profile) return null;
    await ctx.db.patch(profile._id, { lastAccess: Date.now(), ip: ip ?? profile.ip });

    return profile._id;
  },
});

export const listStaff = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const rows = await ctx.db.query("profiles").collect();

    return rows.filter((row) => row.isStaff || row.isSuperuser);
  },
});

/* -------------------------------------------------------------------------- */
/* Points recalculation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `Profile.calculate_points()`, exposed for staff on `/admin/users` and used by
 * the judging bookkeeping after a grade lands.
 */
export async function recalculateProfilePoints(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
): Promise<{ points: number; problemCount: number; performancePoints: number }> {
  const rows = await ctx.db
    .query("submissions")
    .withIndex("by_profile_date", (q) => q.eq("profileId", profileId))
    .order("desc")
    .take(SUBMISSION_SCAN_CAP);

  const problems = await loadProblems(
    ctx,
    rows.map((row) => row.problemId),
  );

  const result = calculateProfilePoints(
    rows.map((row) => ({
      problemId: row.problemId,
      points: row.points ?? null,
      result: row.result ?? null,
      casePoints: row.casePoints,
      caseTotal: row.caseTotal,
      isArchived: row.isArchived,
      isPublicProblem: isCountedProblem(problems.get(row.problemId) ?? null),
    })),
  );

  await patchProfile(ctx, profileId, {
    points: result.points,
    problemCount: result.problemCount,
    performancePoints: result.performancePoints,
  });

  return result;
}

export const recalculatePoints = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const staff = await requireStaff(ctx);

    if (!staff.isSuperuser && !staff.permissions.includes("judge.change_profile")) {
      throw forbidden("Missing permission judge.change_profile.");
    }

    const profile = await profileByUsername(ctx, username);

    if (!profile) throw notFound("User");

    return await recalculateProfilePoints(ctx, profile._id);
  },
});

export const recalculatePointsForProfile = internalMutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => await recalculateProfilePoints(ctx, profileId),
});
