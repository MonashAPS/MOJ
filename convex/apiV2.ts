/**
 * API v2 reads: `judge/views/api/api_v2.py`, one query per endpoint.
 *
 * The queries return DMOJ's object shapes (snake_case, verbatim field names)
 * and the pagination block `APIListView.get_api_data` builds, so the Next route
 * handlers only have to wrap them in the envelope. Filtering and visibility
 * happen before pagination, as they do in DMOJ's SQL.
 *
 * Identity comes from the Bearer token: the route mints a short-lived Better
 * Auth JWT for the token's user and passes it to `fetchQuery`, so
 * `optionalViewer` here is the API caller.
 */

import {
  canSeeSubmissionDetail,
  contestCanSeeFullScoreboard,
  contestEnded,
  contestIsAccessibleBy,
  contestIsEditableBy,
  contestIsInContest,
  contestIsVisibleTo,
  getContestFormat,
  getContestLabelForProblem,
  isFullSolve,
  participationEndTime,
  participationStart,
  problemIsAccessibleBy,
  problemIsVisibleTo,
} from "@moj/core";
import type {
  ApiContestDetailObject,
  ApiContestListObject,
  ApiJudgeObject,
  ApiLanguageObject,
  ApiListData,
  ApiOrganizationObject,
  ApiParticipationObject,
  ApiProblemDetailObject,
  ApiProblemListObject,
  ApiSubmissionCaseEntry,
  ApiSubmissionDetailObject,
  ApiSubmissionListObject,
  ApiUserDetailObject,
  ApiUserListObject,
} from "@moj/protocol";
import { API_PAGE_SIZE } from "@moj/protocol";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { optionalViewer } from "./lib/auth";
import { forbidden, notFound } from "./lib/errors";

/**
 * How many rows a list endpoint reads before paginating. DMOJ paginates in SQL;
 * Convex has to filter for visibility in the function, so the scan is bounded
 * and `has_more` is honest up to this many rows.
 */
const SCAN_CAP = 20000;

const pageArg = v.optional(v.number());
const stringList = v.optional(v.array(v.string()));

/** DMOJ ids are Django primary keys; new MOJ rows only have a Convex id. */
function apiIdOf(row: { legacyId?: number; _id: string }): number | string {
  return row.legacyId ?? row._id;
}

function matchesApiId(row: { legacyId?: number; _id: string }, wanted: readonly string[]): boolean {
  return wanted.some((value) => value === row._id || String(row.legacyId ?? "") === value);
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function paginate<T>(objects: T[], page: number, truncated: boolean): ApiListData<T> {
  const start = (page - 1) * API_PAGE_SIZE;
  const slice = objects.slice(start, start + API_PAGE_SIZE);
  return {
    current_object_count: slice.length,
    objects_per_page: API_PAGE_SIZE,
    page_index: page,
    has_more: start + slice.length < objects.length || truncated,
    objects: slice,
    total_objects: objects.length,
    total_pages: Math.max(1, Math.ceil(objects.length / API_PAGE_SIZE)),
  };
}

/** `InfinitePaginationMixin`: no `total_objects`, no `total_pages`. */
function paginateInfinite<T>(objects: T[], page: number, truncated: boolean): ApiListData<T> {
  const data = paginate(objects, page, truncated);
  const { total_objects: _total, total_pages: _pages, ...rest } = data;
  return rest;
}

/* -------------------------------------------------------------------------- */
/* Viewer                                                                     */
/* -------------------------------------------------------------------------- */

type ViewerRow = {
  id: string;
  username: string;
  isStaff: boolean;
  isSuperuser: boolean;
  permissions: readonly string[];
  organizationIds: readonly string[];
  adminOfOrganizationIds: readonly string[];
  currentParticipationId?: string | null;
  currentContestId?: string | null;
} | null;

async function apiViewer(ctx: QueryCtx): Promise<{ profile: Doc<"profiles"> | null; row: ViewerRow }> {
  const profile = await optionalViewer(ctx);
  if (!profile) return { profile: null, row: null };

  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .collect();
  const organizationIds = memberships.map((row) => row.organizationId as string);

  const organizations = await ctx.db.query("organizations").collect();
  const adminOfOrganizationIds = organizations
    .filter((organization) => organization.adminProfileIds.includes(profile._id))
    .map((organization) => organization._id as string);

  let currentContestId: string | null = null;
  if (profile.currentParticipationId) {
    const participation = await ctx.db.get(profile.currentParticipationId);
    currentContestId = participation ? (participation.contestId as string) : null;
  }

  return {
    profile,
    row: {
      id: profile._id,
      username: profile.username,
      isStaff: profile.isStaff,
      isSuperuser: profile.isSuperuser,
      permissions: profile.permissions,
      organizationIds,
      adminOfOrganizationIds,
      currentParticipationId: profile.currentParticipationId ?? null,
      currentContestId,
    },
  };
}

function contestRow(contest: Doc<"contests">) {
  return {
    id: contest._id as string,
    key: contest.key,
    name: contest.name,
    startTime: contest.startTime,
    endTime: contest.endTime,
    timeLimit: contest.timeLimit ?? null,
    isVisible: contest.isVisible,
    isPrivate: contest.isPrivate,
    isOrganizationPrivate: contest.isOrganizationPrivate,
    authorProfileIds: contest.authorProfileIds as unknown as string[],
    curatorProfileIds: contest.curatorProfileIds as unknown as string[],
    testerProfileIds: contest.testerProfileIds as unknown as string[],
    spectatorProfileIds: contest.spectatorProfileIds as unknown as string[],
    testerSeeScoreboard: contest.testerSeeScoreboard,
    testerSeeSubmissions: contest.testerSeeSubmissions,
    viewContestScoreboardProfileIds: contest.viewContestScoreboardProfileIds as unknown as string[],
    viewContestSubmissionsProfileIds: contest.viewContestSubmissionsProfileIds as unknown as string[],
    privateContestantProfileIds: contest.privateContestantProfileIds as unknown as string[],
    organizationIds: contest.organizationIds as unknown as string[],
    classIds: contest.classIds as unknown as string[],
    bannedProfileIds: contest.bannedProfileIds as unknown as string[],
    scoreboardVisibility: contest.scoreboardVisibility,
    formatName: contest.formatName,
    formatConfig: contest.formatConfig,
    labelScheme: contest.labelScheme,
    customLabels: contest.customLabels,
    pointsPrecision: contest.pointsPrecision,
    runPretestsOnly: contest.runPretestsOnly,
    isRated: contest.isRated,
    rateAll: contest.rateAll,
    ratingFloor: contest.ratingFloor ?? null,
    ratingCeiling: contest.ratingCeiling ?? null,
    performanceCeilingOverride: contest.performanceCeilingOverride ?? null,
    freezeMinutes: contest.freezeMinutes,
    blindDuringFreeze: contest.blindDuringFreeze,
    lockedAfter: contest.lockedAfter ?? null,
  };
}

function problemRow(problem: Doc<"problems">) {
  return {
    id: problem._id as string,
    code: problem.code,
    name: problem.name,
    isPublic: problem.isPublic,
    isOrganizationPrivate: problem.isOrganizationPrivate,
    organizationIds: problem.organizationIds as unknown as string[],
    authorProfileIds: problem.authorProfileIds as unknown as string[],
    curatorProfileIds: problem.curatorProfileIds as unknown as string[],
    testerProfileIds: problem.testerProfileIds as unknown as string[],
    bannedProfileIds: problem.bannedProfileIds as unknown as string[],
    points: problem.points,
    partial: problem.partial,
    submissionSourceVisibility: problem.submissionSourceVisibility,
  };
}

/* -------------------------------------------------------------------------- */
/* Contests                                                                   */
/* -------------------------------------------------------------------------- */

async function contestTagNames(ctx: QueryCtx, contest: Doc<"contests">): Promise<string[]> {
  const names: string[] = [];
  for (const tagId of contest.tagIds) {
    const tag = await ctx.db.get(tagId);
    if (tag) names.push(tag.name);
  }
  return names;
}

export const contests = query({
  args: {
    page: pageArg,
    is_rated: v.optional(v.boolean()),
    key: stringList,
    tag: stringList,
    organization: stringList,
  },
  handler: async (ctx, args): Promise<ApiListData<ApiContestListObject>> => {
    const page = Math.max(1, Math.floor(args.page ?? 1));
    const { row: viewer } = await apiViewer(ctx);
    const all = await ctx.db.query("contests").take(SCAN_CAP + 1);
    const truncated = all.length > SCAN_CAP;
    const rows = truncated ? all.slice(0, SCAN_CAP) : all;

    const wantedOrganizations = args.organization
      ? new Set(await resolveOrganizationIds(ctx, args.organization))
      : null;

    const objects: ApiContestListObject[] = [];
    for (const contest of rows) {
      if (!contestIsVisibleTo(contestRow(contest), viewer)) continue;
      if (args.is_rated !== undefined && contest.isRated !== args.is_rated) continue;
      if (args.key && !args.key.includes(contest.key)) continue;
      if (
        wantedOrganizations &&
        !contest.organizationIds.some((id) => wantedOrganizations.has(id as string))
      ) {
        continue;
      }
      const tags = await contestTagNames(ctx, contest);
      if (args.tag && !args.tag.some((name) => tags.includes(name))) continue;

      objects.push({
        key: contest.key,
        name: contest.name,
        start_time: iso(contest.startTime),
        end_time: iso(contest.endTime),
        time_limit: contest.timeLimit ?? null,
        is_rated: contest.isRated,
        rate_all: contest.isRated && contest.rateAll,
        tags,
      });
    }

    return paginate(objects, page, truncated);
  },
});

async function resolveOrganizationIds(ctx: QueryCtx, values: readonly string[]): Promise<string[]> {
  const organizations = await ctx.db.query("organizations").collect();
  return organizations
    .filter((organization) => matchesApiId(organization, values))
    .map((organization) => organization._id as string);
}

export const contest = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<ApiContestDetailObject> => {
    const contestDoc = await ctx.db
      .query("contests")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!contestDoc) throw notFound("Contest");

    const { row: viewer } = await apiViewer(ctx);
    const core = contestRow(contestDoc);
    if (!contestIsAccessibleBy(core, viewer)) throw notFound("Contest");

    const now = Date.now();
    const inContest = contestIsInContest(core, viewer);
    const canSeeRankings = contestCanSeeFullScoreboard(core, viewer, { now });
    const canSeeProblems = inContest || contestEnded(core, now) || contestIsEditableBy(core, viewer);

    const contestProblems = await ctx.db
      .query("contestProblems")
      .withIndex("by_contest_order", (q) => q.eq("contestId", contestDoc._id))
      .collect();
    contestProblems.sort((a, b) => a.order - b.order);

    const problems: ApiContestDetailObject["problems"] = [];
    if (canSeeProblems) {
      for (let index = 0; index < contestProblems.length; index++) {
        const contestProblem = contestProblems[index];
        if (!contestProblem) continue;
        const problem = await ctx.db.get(contestProblem.problemId);
        if (!problem) continue;
        problems.push({
          points: Math.trunc(contestProblem.points),
          partial: contestProblem.partial,
          is_pretested: contestProblem.isPretested && contestDoc.runPretestsOnly,
          max_submissions: contestProblem.maxSubmissions ?? null,
          label: getContestLabelForProblem(core, index),
          name: problem.name,
          code: problem.code,
        });
      }
    }

    const ratings = await ctx.db
      .query("ratings")
      .withIndex("by_contest", (q) => q.eq("contestId", contestDoc._id))
      .collect();
    const hasRating = ratings.length > 0;

    const rankings: ApiContestDetailObject["rankings"] = [];
    if (canSeeRankings) {
      const participations = await ctx.db
        .query("contestParticipations")
        .withIndex("by_contest_virtual_score", (q) => q.eq("contestId", contestDoc._id).eq("virtual", 0))
        .collect();
      participations.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.cumtime !== b.cumtime) return a.cumtime - b.cumtime;
        return a.tiebreaker - b.tiebreaker;
      });

      const contestCache = new Map<Id<"contests">, Doc<"contests"> | null>();
      const format = getContestFormat(core);
      const formatProblems = contestProblems.map((contestProblem) => ({
        id: contestProblem._id as string,
        contestId: contestProblem.contestId as string,
        problemId: contestProblem.problemId as string,
        points: contestProblem.points,
        partial: contestProblem.partial,
        isPretested: contestProblem.isPretested,
        order: contestProblem.order,
        maxSubmissions: contestProblem.maxSubmissions ?? null,
      }));

      for (const participation of participations) {
        const profile = await ctx.db.get(participation.profileId);
        if (!profile) continue;

        const newRating = ratings.find((r) => r.participationId === participation._id) ?? null;
        // `old_ratings_subquery`: the rating from the most recent contest that
        // ended before this one.
        const previous = await ctx.db
          .query("ratings")
          .withIndex("by_profile", (q) => q.eq("profileId", participation.profileId))
          .collect();
        let oldRating: number | null = null;
        let bestEnd = Number.NEGATIVE_INFINITY;
        for (const entry of previous) {
          let entryContest = contestCache.get(entry.contestId);
          if (entryContest === undefined) {
            entryContest = await ctx.db.get(entry.contestId);
            contestCache.set(entry.contestId, entryContest);
          }
          if (!entryContest) continue;
          if (entryContest.endTime >= contestDoc.endTime) continue;
          if (entryContest.endTime > bestEnd) {
            bestEnd = entryContest.endTime;
            oldRating = entry.rating;
          }
        }

        const timing = {
          id: participation._id as string,
          contestId: participation.contestId as string,
          profileId: participation.profileId as string,
          realStart: participation.realStart,
          score: participation.score,
          cumtime: participation.cumtime,
          tiebreaker: participation.tiebreaker,
          isDisqualified: participation.isDisqualified,
          virtual: participation.virtual,
          formatData: participation.formatData ?? null,
        };

        rankings.push({
          user: profile.username,
          start_time: iso(participationStart(timing, core)),
          end_time: iso(participationEndTime(timing, core)),
          score: participation.score,
          cumulative_time: participation.cumtime,
          tiebreaker: participation.tiebreaker,
          old_rating: oldRating,
          new_rating: newRating ? newRating.rating : null,
          is_disqualified: participation.isDisqualified,
          solutions: format
            .getProblemBreakdown(timing, formatProblems)
            .map((entry) => (entry ? { points: entry.points, time: entry.time ?? 0 } : null)),
        });
      }
    }

    return {
      key: contestDoc.key,
      name: contestDoc.name,
      start_time: iso(contestDoc.startTime),
      end_time: iso(contestDoc.endTime),
      time_limit: contestDoc.timeLimit ?? null,
      is_rated: contestDoc.isRated,
      rate_all: contestDoc.isRated && contestDoc.rateAll,
      tags: await contestTagNames(ctx, contestDoc),
      has_rating: hasRating,
      rating_floor: contestDoc.ratingFloor ?? null,
      rating_ceiling: contestDoc.ratingCeiling ?? null,
      performance_ceiling: contestDoc.performanceCeilingOverride ?? null,
      hidden_scoreboard: ["C", "P", "H"].includes(contestDoc.scoreboardVisibility),
      scoreboard_visibility: contestDoc.scoreboardVisibility,
      is_organization_private: contestDoc.isOrganizationPrivate,
      organizations: contestDoc.isOrganizationPrivate
        ? await organizationApiIds(ctx, contestDoc.organizationIds)
        : [],
      is_private: contestDoc.isPrivate,
      format: { name: contestDoc.formatName, config: contestDoc.formatConfig },
      problems,
      rankings,
    };
  },
});

async function organizationApiIds(
  ctx: QueryCtx,
  ids: readonly Id<"organizations">[],
): Promise<(number | string)[]> {
  const out: (number | string)[] = [];
  for (const id of ids) {
    const organization = await ctx.db.get(id);
    if (organization) out.push(apiIdOf(organization));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Participations                                                             */
/* -------------------------------------------------------------------------- */

export const participations = query({
  args: {
    page: pageArg,
    contest: v.optional(v.string()),
    user: v.optional(v.string()),
    is_disqualified: v.optional(v.boolean()),
    virtual_participation_number: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ApiListData<ApiParticipationObject>> => {
    const page = Math.max(1, Math.floor(args.page ?? 1));
    const { profile, row: viewer } = await apiViewer(ctx);
    const now = Date.now();

    const seesPrivate =
      !!viewer && (viewer.isSuperuser || viewer.permissions.includes("judge.see_private_contest"));
    const editOwn = !!viewer && (viewer.isSuperuser || viewer.permissions.includes("judge.edit_own_contest"));

    const allContests = await ctx.db.query("contests").collect();
    const visibleContests = new Map<Id<"contests">, Doc<"contests">>();
    for (const contestDoc of allContests) {
      const core = contestRow(contestDoc);
      if (!contestIsVisibleTo(core, viewer)) continue;
      if (!seesPrivate) {
        // `APIContestParticipationList.get_unfiltered_queryset`.
        let allowed = contestDoc.endTime < now;
        if (profile) {
          if (editOwn) {
            allowed =
              allowed ||
              contestDoc.authorProfileIds.includes(profile._id) ||
              contestDoc.curatorProfileIds.includes(profile._id);
          }
          allowed = allowed || contestDoc.viewContestScoreboardProfileIds.includes(profile._id);
        }
        if (!allowed) continue;
      }
      visibleContests.set(contestDoc._id, contestDoc);
    }

    const all = await ctx.db.query("contestParticipations").take(SCAN_CAP + 1);
    const truncated = all.length > SCAN_CAP;
    const rows = truncated ? all.slice(0, SCAN_CAP) : all;

    const objects: ApiParticipationObject[] = [];
    for (const participation of rows) {
      if (participation.virtual < 0) continue;
      const contestDoc = visibleContests.get(participation.contestId);
      if (!contestDoc) continue;
      if (args.contest && contestDoc.key !== args.contest) continue;
      if (args.is_disqualified !== undefined && participation.isDisqualified !== args.is_disqualified) {
        continue;
      }
      if (
        args.virtual_participation_number !== undefined &&
        participation.virtual !== args.virtual_participation_number
      ) {
        continue;
      }
      const owner = await ctx.db.get(participation.profileId);
      if (!owner) continue;
      if (args.user && owner.username !== args.user) continue;

      const core = contestRow(contestDoc);
      const timing = {
        id: participation._id as string,
        contestId: participation.contestId as string,
        profileId: participation.profileId as string,
        realStart: participation.realStart,
        virtual: participation.virtual,
      };
      objects.push({
        user: owner.username,
        contest: contestDoc.key,
        start_time: iso(participationStart(timing, core)),
        end_time: iso(participationEndTime(timing, core)),
        score: participation.score,
        cumulative_time: participation.cumtime,
        tiebreaker: participation.tiebreaker,
        is_disqualified: participation.isDisqualified,
        virtual_participation_number: participation.virtual,
      });
    }

    return paginate(objects, page, truncated);
  },
});

/* -------------------------------------------------------------------------- */
/* Problems                                                                   */
/* -------------------------------------------------------------------------- */

export const problems = query({
  args: {
    page: pageArg,
    partial: v.optional(v.boolean()),
    code: stringList,
    group: stringList,
    type: stringList,
    organization: stringList,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ApiListData<ApiProblemListObject>> => {
    const page = Math.max(1, Math.floor(args.page ?? 1));
    const { row: viewer } = await apiViewer(ctx);

    const all = await ctx.db.query("problems").take(SCAN_CAP + 1);
    const truncated = all.length > SCAN_CAP;
    let rows = truncated ? all.slice(0, SCAN_CAP) : all;

    if (args.search?.trim()) {
      const term = args.search.trim().toLowerCase();
      rows = rows.filter(
        (problem) =>
          problem.name.toLowerCase().includes(term) ||
          problem.code.toLowerCase().includes(term) ||
          problem.description.toLowerCase().includes(term),
      );
    }

    const wantedOrganizations = args.organization
      ? new Set(await resolveOrganizationIds(ctx, args.organization))
      : null;

    const objects: ApiProblemListObject[] = [];
    for (const problem of rows) {
      if (!problemIsVisibleTo(problemRow(problem), viewer)) continue;
      if (args.partial !== undefined && problem.partial !== args.partial) continue;
      if (args.code && !args.code.includes(problem.code)) continue;
      if (
        wantedOrganizations &&
        !problem.organizationIds.some((id) => wantedOrganizations.has(id as string))
      ) {
        continue;
      }

      const group = await ctx.db.get(problem.groupId);
      const groupName = group?.fullName ?? "";
      if (args.group && !args.group.includes(groupName)) continue;

      const types: string[] = [];
      for (const typeId of problem.typeIds) {
        const type = await ctx.db.get(typeId);
        if (type) types.push(type.fullName);
      }
      if (args.type && !args.type.some((name) => types.includes(name))) continue;

      objects.push({
        code: problem.code,
        name: problem.name,
        types,
        group: groupName,
        points: problem.points,
        partial: problem.partial,
        is_organization_private: problem.isOrganizationPrivate,
        is_public: problem.isPublic,
      });
    }

    return paginate(objects, page, truncated);
  },
});

export const problem = query({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<ApiProblemDetailObject> => {
    const problemDoc = await ctx.db
      .query("problems")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!problemDoc) throw notFound("Problem");

    const { row: viewer } = await apiViewer(ctx);
    if (!problemIsAccessibleBy(problemRow(problemDoc), viewer, { skipContestProblemCheck: true })) {
      throw notFound("Problem");
    }

    const authors: string[] = [];
    for (const authorId of problemDoc.authorProfileIds) {
      const author = await ctx.db.get(authorId);
      if (author) authors.push(author.username);
    }

    const types: string[] = [];
    for (const typeId of problemDoc.typeIds) {
      const type = await ctx.db.get(typeId);
      if (type) types.push(type.fullName);
    }

    const group = await ctx.db.get(problemDoc.groupId);

    const limits = await ctx.db
      .query("languageLimits")
      .withIndex("by_problem", (q) => q.eq("problemId", problemDoc._id))
      .collect();
    const languageResourceLimits: ApiProblemDetailObject["language_resource_limits"] = [];
    for (const limit of limits) {
      const language = await ctx.db.get(limit.languageId);
      if (!language) continue;
      languageResourceLimits.push({
        language: language.key,
        time_limit: limit.timeLimit,
        memory_limit: limit.memoryLimit,
      });
    }

    const languages: string[] = [];
    for (const languageId of problemDoc.allowedLanguageIds) {
      const language = await ctx.db.get(languageId);
      if (language) languages.push(language.key);
    }

    return {
      code: problemDoc.code,
      name: problemDoc.name,
      authors,
      types,
      group: group?.fullName ?? "",
      time_limit: problemDoc.timeLimit,
      memory_limit: problemDoc.memoryLimit,
      language_resource_limits: languageResourceLimits,
      points: problemDoc.points,
      partial: problemDoc.partial,
      short_circuit: problemDoc.shortCircuit,
      languages,
      is_organization_private: problemDoc.isOrganizationPrivate,
      organizations: problemDoc.isOrganizationPrivate
        ? await organizationApiIds(ctx, problemDoc.organizationIds)
        : [],
      is_public: problemDoc.isPublic,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export const users = query({
  args: {
    page: pageArg,
    id: stringList,
    username: stringList,
    organization: stringList,
  },
  handler: async (ctx, args): Promise<ApiListData<ApiUserListObject>> => {
    const page = Math.max(1, Math.floor(args.page ?? 1));
    const all = await ctx.db.query("profiles").take(SCAN_CAP + 1);
    const truncated = all.length > SCAN_CAP;
    const rows = truncated ? all.slice(0, SCAN_CAP) : all;

    let allowed: Set<Id<"profiles">> | null = null;
    if (args.organization) {
      allowed = new Set();
      const organizationIds = await resolveOrganizationIds(ctx, args.organization);
      for (const organizationId of organizationIds) {
        const memberships = await ctx.db
          .query("organizationMemberships")
          .withIndex("by_organization", (q) => q.eq("organizationId", organizationId as Id<"organizations">))
          .collect();
        for (const membership of memberships) allowed.add(membership.profileId);
      }
    }

    const objects: ApiUserListObject[] = [];
    for (const profile of rows) {
      // `filter(is_unlisted=False, user__is_active=True)`.
      if (profile.isUnlisted) continue;
      if (profile.isActive === false) continue;
      if (args.id && !matchesApiId(profile, args.id)) continue;
      if (args.username && !args.username.includes(profile.username)) continue;
      if (allowed && !allowed.has(profile._id)) continue;

      objects.push({
        id: apiIdOf(profile),
        username: profile.username,
        points: profile.points,
        performance_points: profile.performancePoints,
        problem_count: profile.problemCount,
        rank: profile.displayRank,
        rating: profile.rating ?? null,
      });
    }

    return paginate(objects, page, truncated);
  },
});

export const user = query({
  args: { user: v.string() },
  handler: async (ctx, args): Promise<ApiUserDetailObject> => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", args.user))
      .unique();
    if (!profile) throw notFound("User");

    const { row: viewer } = await apiViewer(ctx);
    const now = Date.now();

    const submissions = await ctx.db
      .query("submissions")
      .withIndex("by_profile_date", (q) => q.eq("profileId", profile._id))
      .take(SCAN_CAP);

    const solvedCodes = new Set<string>();
    const seenProblems = new Map<Id<"problems">, Doc<"problems"> | null>();
    for (const submission of submissions) {
      if (submission.result !== "AC") continue;
      let problem = seenProblems.get(submission.problemId);
      if (problem === undefined) {
        problem = await ctx.db.get(submission.problemId);
        seenProblems.set(submission.problemId, problem);
      }
      if (!problem) continue;
      if (!problem.isPublic || problem.isOrganizationPrivate) continue;
      solvedCodes.add(problem.code);
    }

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();
    const organizations = await organizationApiIds(
      ctx,
      memberships.map((membership) => membership.organizationId),
    );

    const participations = await ctx.db
      .query("contestParticipations")
      .withIndex("by_profile_contest", (q) => q.eq("profileId", profile._id))
      .collect();

    const ratingRows = await ctx.db
      .query("ratings")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();

    const history: ApiUserDetailObject["contests"] = [];
    for (const participation of participations) {
      if (participation.virtual !== 0) continue;
      const contestDoc = await ctx.db.get(participation.contestId);
      if (!contestDoc) continue;
      if (contestDoc.endTime >= now) continue;
      if (!contestIsVisibleTo(contestRow(contestDoc), viewer)) continue;
      const entry = ratingRows.find((row) => row.participationId === participation._id) ?? null;
      history.push({
        key: contestDoc.key,
        score: participation.score,
        cumulative_time: participation.cumtime,
        rating: entry ? entry.rating : null,
        raw_rating: entry ? entry.mean : null,
        performance: entry ? entry.performance : null,
      });
    }

    return {
      id: apiIdOf(profile),
      username: profile.username,
      about: profile.about,
      points: profile.points,
      performance_points: profile.performancePoints,
      problem_count: profile.problemCount,
      solved_problems: [...solvedCodes].sort(),
      rank: profile.displayRank,
      rating: profile.rating ?? null,
      organizations,
      contests: history,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Submissions                                                                */
/* -------------------------------------------------------------------------- */

export const submissions = query({
  args: {
    page: pageArg,
    user: v.optional(v.string()),
    problem: v.optional(v.string()),
    contest: v.optional(v.string()),
    id: stringList,
    language: stringList,
    result: stringList,
  },
  handler: async (
    ctx,
    args,
  ): Promise<ApiListData<ApiSubmissionListObject> & { used_basic_filters: boolean }> => {
    const page = Math.max(1, Math.floor(args.page ?? 1));
    const { row: viewer } = await apiViewer(ctx);
    const usedBasicFilters =
      args.user !== undefined || args.problem !== undefined || args.contest !== undefined;

    // `ProfileSimpleFilter` and friends resolve the key to an object; an
    // unknown key filters on NULL, which matches nothing.
    let profileFilter: Id<"profiles"> | null | undefined;
    if (args.user !== undefined) {
      const target = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", args.user as string))
        .unique();
      profileFilter = target ? target._id : null;
    }
    let problemFilter: Id<"problems"> | null | undefined;
    if (args.problem !== undefined) {
      const target = await ctx.db
        .query("problems")
        .withIndex("by_code", (q) => q.eq("code", args.problem as string))
        .unique();
      problemFilter = target ? target._id : null;
    }
    let contestFilter: Id<"contests"> | null | undefined;
    if (args.contest !== undefined) {
      const target = await ctx.db
        .query("contests")
        .withIndex("by_key", (q) => q.eq("key", args.contest as string))
        .unique();
      contestFilter = target ? target._id : null;
    }

    if (profileFilter === null || problemFilter === null || contestFilter === null) {
      const empty = usedBasicFilters
        ? paginateInfinite<ApiSubmissionListObject>([], page, false)
        : paginate<ApiSubmissionListObject>([], page, false);
      return { ...empty, used_basic_filters: usedBasicFilters };
    }

    let scanned: Doc<"submissions">[];
    if (profileFilter) {
      scanned = await ctx.db
        .query("submissions")
        .withIndex("by_profile_date", (q) => q.eq("profileId", profileFilter as Id<"profiles">))
        .take(SCAN_CAP + 1);
    } else if (problemFilter) {
      scanned = await ctx.db
        .query("submissions")
        .withIndex("by_problem_date", (q) => q.eq("problemId", problemFilter as Id<"problems">))
        .take(SCAN_CAP + 1);
    } else if (contestFilter) {
      scanned = await ctx.db
        .query("submissions")
        .withIndex("by_contest_date", (q) => q.eq("contestId", contestFilter as Id<"contests">))
        .take(SCAN_CAP + 1);
    } else {
      scanned = await ctx.db.query("submissions").take(SCAN_CAP + 1);
    }
    const truncated = scanned.length > SCAN_CAP;
    const rows = truncated ? scanned.slice(0, SCAN_CAP) : scanned;

    const wantedLanguages = args.language
      ? new Set(
          (await ctx.db.query("languages").collect())
            .filter((language) => (args.language as string[]).includes(language.key))
            .map((language) => language._id as string),
        )
      : null;

    const problemCache = new Map<Id<"problems">, Doc<"problems"> | null>();
    const objects: ApiSubmissionListObject[] = [];

    for (const submission of rows) {
      if (problemFilter && submission.problemId !== problemFilter) continue;
      if (contestFilter && submission.contestId !== contestFilter) continue;
      if (args.id && !matchesApiId(submission, args.id)) continue;
      if (wantedLanguages && !wantedLanguages.has(submission.languageId as string)) continue;
      if (args.result && !(submission.result && args.result.includes(submission.result))) continue;

      let problemDoc = problemCache.get(submission.problemId);
      if (problemDoc === undefined) {
        problemDoc = await ctx.db.get(submission.problemId);
        problemCache.set(submission.problemId, problemDoc);
      }
      if (!problemDoc) continue;
      if (!problemIsVisibleTo(problemRow(problemDoc), viewer)) continue;

      const owner = await ctx.db.get(submission.profileId);
      const language = await ctx.db.get(submission.languageId);
      if (!owner || !language) continue;

      let contestBlock: ApiSubmissionListObject["contest"] = null;
      if (submission.contestId) {
        const contestDoc = await ctx.db.get(submission.contestId);
        const participation = submission.participationId
          ? await ctx.db.get(submission.participationId)
          : null;
        if (contestDoc && participation) {
          contestBlock = {
            key: contestDoc.key,
            points: submission.contestPoints ?? null,
            virtual_participation_number: participation.virtual,
            // DMOJ returns a timedelta; JSON renders it as seconds.
            time_since_start_of_participation: (submission.date - participation.realStart) / 1000,
          };
        }
      }

      objects.push({
        id: apiIdOf(submission),
        problem: problemDoc.code,
        user: owner.username,
        date: iso(submission.date),
        language: language.key,
        time: submission.time ?? null,
        memory: submission.memory ?? null,
        points: submission.points ?? null,
        result: submission.result ?? null,
        contest: contestBlock,
      });
    }

    const data = usedBasicFilters
      ? paginateInfinite(objects, page, truncated)
      : paginate(objects, page, truncated);
    return { ...data, used_basic_filters: usedBasicFilters };
  },
});

/** `group_test_cases` (judge/views/submission.py:150) reshaped for the API. */
function groupTestCases(cases: readonly Doc<"submissionTestCases">[]): ApiSubmissionCaseEntry[] {
  const entries: ApiSubmissionCaseEntry[] = [];
  let buffer: Doc<"submissionTestCases">[] = [];
  let last: number | undefined;

  const flush = () => {
    if (buffer.length === 0) return;
    const shaped = buffer.map((row) => ({
      type: "case" as const,
      case_id: row.case,
      status: row.status,
      time: row.time,
      memory: row.memory,
      points: row.points,
      total: row.total,
    }));
    if (last === undefined || last === 0) {
      entries.push(...shaped);
    } else {
      entries.push({
        type: "batch",
        batch_id: last,
        cases: shaped,
        points: Math.min(...buffer.map((row) => row.points)),
        total: Math.max(...buffer.map((row) => row.total)),
      });
    }
    buffer = [];
  };

  for (const row of cases) {
    if (row.batch !== last && buffer.length > 0) flush();
    buffer.push(row);
    last = row.batch;
  }
  flush();
  return entries;
}

export const submission = query({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<ApiSubmissionDetailObject> => {
    const { profile, row: viewer } = await apiViewer(ctx);
    // `APILoginRequiredMixin`.
    if (!profile) throw forbidden("login required");

    let submissionDoc: Doc<"submissions"> | null = null;
    if (/^\d+$/.test(args.id)) {
      submissionDoc = await ctx.db
        .query("submissions")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", Number.parseInt(args.id, 10)))
        .unique();
    }
    if (!submissionDoc) {
      const normalised = ctx.db.normalizeId("submissions", args.id);
      submissionDoc = normalised ? await ctx.db.get(normalised) : null;
    }
    if (!submissionDoc) throw notFound("Submission");

    const problemDoc = await ctx.db.get(submissionDoc.problemId);
    if (!problemDoc) throw notFound("Submission");
    const contestDoc = submissionDoc.contestId ? await ctx.db.get(submissionDoc.contestId) : null;

    const viewerSolved = await hasSolvedProblem(ctx, profile._id, problemDoc._id);
    const allowed = canSeeSubmissionDetail({ profileId: submissionDoc.profileId as string }, viewer, {
      problem: problemRow(problemDoc),
      contest: contestDoc ? contestRow(contestDoc) : null,
      hasSolvedProblem: viewerSolved,
    });
    if (!allowed) throw forbidden("permission denied");

    const owner = await ctx.db.get(submissionDoc.profileId);
    const language = await ctx.db.get(submissionDoc.languageId);
    const cases = await ctx.db
      .query("submissionTestCases")
      .withIndex("by_submission_case", (q) => q.eq("submissionId", submissionDoc._id))
      .collect();
    cases.sort((a, b) => a.case - b.case);

    return {
      id: apiIdOf(submissionDoc),
      problem: problemDoc.code,
      user: owner?.username ?? "",
      date: iso(submissionDoc.date),
      time: submissionDoc.time ?? null,
      memory: submissionDoc.memory ?? null,
      points: submissionDoc.points ?? null,
      language: language?.key ?? "",
      status: submissionDoc.status,
      result: submissionDoc.result ?? null,
      case_points: submissionDoc.casePoints,
      case_total: submissionDoc.caseTotal,
      cases: groupTestCases(cases),
    };
  },
});

async function hasSolvedProblem(
  ctx: QueryCtx,
  profileId: Id<"profiles">,
  problemId: Id<"problems">,
): Promise<boolean> {
  const rows = await ctx.db
    .query("submissions")
    .withIndex("by_profile_problem", (q) => q.eq("profileId", profileId).eq("problemId", problemId))
    .take(500);
  return rows.some((row) => isFullSolve(row));
}

/* -------------------------------------------------------------------------- */
/* Organizations, languages, judges                                           */
/* -------------------------------------------------------------------------- */

export const organizations = query({
  args: { page: pageArg, is_open: v.optional(v.boolean()), id: stringList },
  handler: async (ctx, args): Promise<ApiListData<ApiOrganizationObject>> => {
    const page = Math.max(1, Math.floor(args.page ?? 1));
    const rows = await ctx.db.query("organizations").collect();

    const objects: ApiOrganizationObject[] = [];
    for (const organization of rows) {
      if (args.is_open !== undefined && organization.isOpen !== args.is_open) continue;
      if (args.id && !matchesApiId(organization, args.id)) continue;
      objects.push({
        id: apiIdOf(organization),
        slug: organization.slug,
        short_name: organization.shortName,
        is_open: organization.isOpen,
        member_count: organization.memberCount,
      });
    }

    return paginate(objects, page, false);
  },
});

export const languages = query({
  args: {
    page: pageArg,
    common_name: v.optional(v.string()),
    id: stringList,
    key: stringList,
  },
  handler: async (ctx, args): Promise<ApiListData<ApiLanguageObject>> => {
    const page = Math.max(1, Math.floor(args.page ?? 1));
    const rows = await ctx.db.query("languages").collect();

    const objects: ApiLanguageObject[] = [];
    for (const language of rows) {
      if (args.common_name !== undefined && language.commonName !== args.common_name) continue;
      if (args.id && !matchesApiId(language, args.id)) continue;
      if (args.key && !args.key.includes(language.key)) continue;
      objects.push({
        id: apiIdOf(language),
        key: language.key,
        short_name: language.shortName || null,
        common_name: language.commonName,
        ace_mode_name: language.editorMode,
        pygments_name: language.shikiLang,
        code_template: language.template,
      });
    }

    return paginate(objects, page, false);
  },
});

export const judges = query({
  args: { page: pageArg },
  handler: async (ctx, args): Promise<ApiListData<ApiJudgeObject>> => {
    const page = Math.max(1, Math.floor(args.page ?? 1));
    const rows = await ctx.db
      .query("judges")
      .withIndex("by_online_tier", (q) => q.eq("online", true))
      .collect();

    const objects: ApiJudgeObject[] = [];
    for (const judge of rows) {
      const versions = await ctx.db
        .query("runtimeVersions")
        .withIndex("by_judge", (q) => q.eq("judgeId", judge._id))
        .collect();
      const keys = new Set<string>();
      for (const version of versions) {
        const language = await ctx.db.get(version.languageId);
        if (language) keys.add(language.key);
      }
      objects.push({
        name: judge.name,
        start_time: iso(judge.startTime ?? judge._creationTime),
        ping: judge.ping ?? null,
        load: judge.load ?? null,
        languages: [...keys].sort(),
      });
    }

    return paginate(objects, page, false);
  },
});
