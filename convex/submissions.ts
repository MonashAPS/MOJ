/**
 * Submissions: the lists, the status page, the source view and submitting.
 *
 * Every rule here is DMOJ's, from judge/views/submission.py (the list querysets
 * and `abort_submission`), judge/views/problem.py (`ProblemSubmit.form_valid`)
 * and judge/models/submission.py (`can_see_detail`, `is_locked`). The rules
 * themselves live in `@moj/core`; this module is the plumbing that feeds them
 * rows and pages the results.
 */

import {
  blindDuringFreeze,
  type ContestParticipationRow,
  type Viewer as CoreViewer,
  canSeeSubmissionDetail,
  contestScoreboardIsPublic,
  hasPerm as coreHasPerm,
  isSuperuser as coreIsSuperuser,
  isLocked,
  type ProfileRow,
  participationIsLive,
  problemIsAccessibleBy,
  problemIsEditableBy,
  problemIsVisibleTo,
  type SubmissionResult,
} from "@moj/core";
import { paginationOptsValidator, type WithoutSystemFields } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { toContestRow } from "./contests/formats";
import { allocateSubmissionNumber, queueSubmission, resolveSubmission } from "./judging";
import { optionalViewer, requireViewer } from "./lib/auth";
import { globalSourceVisibility, siteSettings } from "./lib/community";
import { forbidden, invalid, mojError, notFound } from "./lib/errors";
import { proctorBlocksContestProblems, requireProctored } from "./lib/proctor";
import { rateLimiter } from "./lib/rateLimiter";
import { hasSolvedProblem, toCoreProblem } from "./problems";

/* -------------------------------------------------------------------------- */
/* DMOJ settings                                                              */
/* -------------------------------------------------------------------------- */

/** `settings.DMOJ_SUBMISSION_LIMIT`: submissions in flight at once. */
export const SUBMISSION_LIMIT = 2;

/** `ProblemSubmitForm.source`: `CharField(max_length=65536)`. */
export const MAX_SOURCE_LENGTH = 65536;

/**
 * How many rows a filtered page walks before giving up on filling itself.
 *
 * The page that comes back is the whole scan minus the rows the viewer may not
 * see, never a truncation of it: `continueCursor` describes the end of the scan,
 * so cutting the page short at `numItems` would leave the rows in between
 * unreachable. A page is therefore between zero and `numItems * this` rows long,
 * which is what `usePaginatedQuery` expects.
 */
const PAGE_SCAN_MULTIPLIER = 2;

/* -------------------------------------------------------------------------- */
/* Row adapters for @moj/core                                                 */
/* -------------------------------------------------------------------------- */

export function coreParticipation(row: Doc<"contestParticipations">): ContestParticipationRow {
  return {
    id: row._id,
    contestId: row.contestId,
    profileId: row.profileId,
    realStart: row.realStart,
    score: row.score,
    cumtime: row.cumtime,
    tiebreaker: row.tiebreaker,
    isDisqualified: row.isDisqualified,
    virtual: row.virtual,
    formatData: row.formatData ?? null,
  };
}

/**
 * The viewer as `@moj/core` wants it.
 *
 * `adminOfOrganizationIds` is derived from the organizations the profile is a
 * member of, which is how DMOJ's data always looks.
 */
export async function coreProfile(
  ctx: QueryCtx,
  profile: Doc<"profiles"> | null,
): Promise<ProfileRow | null> {
  if (!profile) return null;

  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .collect();

  const organizationIds = memberships.map((row) => row.organizationId);

  const adminOfOrganizationIds: string[] = [];

  for (const membership of memberships) {
    const organization = await ctx.db.get(membership.organizationId);

    if (organization?.adminProfileIds.includes(profile._id)) {
      adminOfOrganizationIds.push(organization._id);
    }
  }

  let currentContestId: string | null = null;

  if (profile.currentParticipationId) {
    const participation = await ctx.db.get(profile.currentParticipationId);
    currentContestId = participation?.contestId ?? null;
  }

  return {
    id: profile._id,
    username: profile.username,
    isStaff: profile.isStaff,
    isSuperuser: profile.isSuperuser,
    permissions: profile.permissions,
    organizationIds,
    adminOfOrganizationIds,
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

/* -------------------------------------------------------------------------- */
/* Contest mode                                                               */
/* -------------------------------------------------------------------------- */

export interface ViewerContext {
  profile: Doc<"profiles"> | null;
  viewer: CoreViewer;
  participation: Doc<"contestParticipations"> | null;
  contest: Doc<"contests"> | null;
  inContest: boolean;
}

/** `viewer.current()`: who is looking, and whether they are in contest mode. */
export async function viewerContext(ctx: QueryCtx): Promise<ViewerContext> {
  const profile = await optionalViewer(ctx);
  const viewer = await coreProfile(ctx, profile);

  if (!profile?.currentParticipationId) {
    return { profile, viewer, participation: null, contest: null, inContest: false };
  }

  const participation = await ctx.db.get(profile.currentParticipationId);
  const contest = participation ? await ctx.db.get(participation.contestId) : null;

  const live =
    participation !== null &&
    contest !== null &&
    (participationIsLive(coreParticipation(participation)) || participation.virtual > 0);

  return { profile, viewer, participation, contest, inContest: live && contest !== null };
}

/** DMOJ's `viewer.id in contest.<role>`, over a viewer whose id is an opaque string. */
function lists(profileIds: readonly string[], profileId: string): boolean {
  return profileIds.includes(profileId);
}

/**
 * `SubmissionsListBase._get_queryset`'s contest arm: outside contest mode a
 * submission made in a contest is only listed when the viewer is its author, or
 * the contest is one whose submissions they may see.
 */
function contestSubmissionsVisible(contest: Doc<"contests">, viewer: CoreViewer, now: number): boolean {
  if (contestScoreboardIsPublic(toContestRow(contest), now)) return true;

  if (!viewer) return false;

  if (lists(contest.authorProfileIds, viewer.id)) return true;

  if (lists(contest.curatorProfileIds, viewer.id)) return true;

  if (lists(contest.viewContestSubmissionsProfileIds, viewer.id)) return true;

  if (contest.testerSeeSubmissions && lists(contest.testerProfileIds, viewer.id)) {
    return true;
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/* List rows                                                                  */
/* -------------------------------------------------------------------------- */

export interface SubmissionListRow {
  _id: Id<"submissions">;
  id: number | string;
  date: number;
  status: Doc<"submissions">["status"];
  result: SubmissionResult | null;
  points: number | null;
  casePoints: number;
  caseTotal: number;
  time: number | null;
  memory: number | null;
  currentTestcase: number;
  isPretested: boolean;
  isLocked: boolean;
  masked: boolean;
  canSeeDetail: boolean;
  language: { key: string; name: string; shortName: string } | null;
  problem: { _id: Id<"problems">; code: string; name: string; points: number } | null;
  user: {
    _id: Id<"profiles">;
    username: string;
    displayRank: string;
    rating: number | null;
  } | null;
  contest: { _id: Id<"contests">; key: string; name: string } | null;
  contestPoints: number | null;
}

interface RowCaches {
  problems: Map<Id<"problems">, Doc<"problems"> | null>;
  languages: Map<Id<"languages">, Doc<"languages"> | null>;
  profiles: Map<Id<"profiles">, Doc<"profiles"> | null>;
  contests: Map<Id<"contests">, Doc<"contests"> | null>;
  solved: Map<Id<"problems">, boolean>;
}

function newCaches(): RowCaches {
  return {
    problems: new Map(),
    languages: new Map(),
    profiles: new Map(),
    contests: new Map(),
    solved: new Map(),
  };
}

async function cachedGet<T extends "problems" | "languages" | "profiles" | "contests">(
  ctx: QueryCtx,
  cache: Map<Id<T>, Doc<T> | null>,
  id: Id<T>,
): Promise<Doc<T> | null> {
  if (!cache.has(id)) cache.set(id, await ctx.db.get(id));

  return cache.get(id) ?? null;
}

/** `Problem.is_solved_by(user)`: an AC with full case points. */
async function hasSolved(
  ctx: QueryCtx,
  caches: RowCaches,
  profileId: Id<"profiles">,
  problemId: Id<"problems">,
): Promise<boolean> {
  const cached = caches.solved.get(problemId);

  if (cached !== undefined) return cached;
  const solved = await hasSolvedProblem(ctx, profileId, problemId);
  caches.solved.set(problemId, solved);

  return solved;
}

async function buildRow(
  ctx: QueryCtx,
  caches: RowCaches,
  submission: Doc<"submissions">,
  viewerCtx: ViewerContext,
  now: number,
): Promise<SubmissionListRow> {
  const problem = await cachedGet(ctx, caches.problems, submission.problemId);
  const language = await cachedGet(ctx, caches.languages, submission.languageId);
  const author = await cachedGet(ctx, caches.profiles, submission.profileId);
  const contest = submission.contestId ? await cachedGet(ctx, caches.contests, submission.contestId) : null;

  const viewer = viewerCtx.viewer;
  const viewerProfile = viewerCtx.profile;
  let canSee = false;

  if (problem && viewer && viewerProfile) {
    const solved =
      viewerProfile._id === submission.profileId
        ? false
        : await hasSolved(ctx, caches, viewerProfile._id, submission.problemId);

    canSee = canSeeSubmissionDetail({ profileId: submission.profileId }, viewer, {
      problem: toCoreProblem(problem),
      contest: contest ? toContestRow(contest) : null,
      hasSolvedProblem: solved,
      globalSubmissionSourceVisibility: globalSourceVisibility(await siteSettings(ctx)),
    });
  }

  // `contests.blindDuringFreeze`: a contestant's own verdicts read as pending
  // between the freeze point and the end of the contest.
  let masked = false;

  let view = {
    status: submission.status,
    result: submission.result ?? null,
    points: submission.points ?? null,
    casePoints: submission.casePoints,
    caseTotal: submission.caseTotal,
  };

  if (contest) {
    const blinded = blindDuringFreeze(
      { profileId: submission.profileId, date: submission.date, ...view },
      toContestRow(contest),
      viewer,
      { now },
    );

    if ("masked" in blinded) {
      masked = true;
      view = {
        status: "QU",
        result: null,
        points: null,
        casePoints: 0,
        caseTotal: 0,
      };
    }
  }

  return {
    _id: submission._id,
    id: submission.legacyId ?? submission._id,
    date: submission.date,
    status: view.status,
    result: view.result,
    points: view.points,
    casePoints: view.casePoints,
    caseTotal: view.caseTotal,
    time: masked ? null : (submission.time ?? null),
    memory: masked ? null : (submission.memory ?? null),
    currentTestcase: masked ? 0 : submission.currentTestcase,
    isPretested: submission.isPretested,
    isLocked: isLocked({ lockedAfter: submission.lockedAfter ?? null }, now),
    masked,
    canSeeDetail: canSee,
    language: language ? { key: language.key, name: language.name, shortName: language.shortName } : null,
    problem: problem
      ? { _id: problem._id, code: problem.code, name: problem.name, points: problem.points }
      : null,
    user: author
      ? {
          _id: author._id,
          username: author.username,
          displayRank: author.displayRank,
          rating: author.rating ?? null,
        }
      : null,
    contest: contest ? { _id: contest._id, key: contest.key, name: contest.name } : null,
    contestPoints: masked ? null : (submission.contestPoints ?? null),
  };
}

/* -------------------------------------------------------------------------- */
/* Lists                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every submission list DMOJ has, as one query.
 *
 * All submissions with no filters; `username` for `/submissions/user/<user>/`;
 * `problemCode` for `/problem/<code>/submissions/`; both for
 * `/problem/<code>/submissions/<user>/`; `contestKey` for the in-contest lists,
 * with `username` and `problemCode` on top for
 * `/contest/<key>/submissions/<user>/<problem>/`.
 *
 * Ordering is newest first. Rows the viewer may not see are dropped from the
 * page after it is fetched, so a page can come back shorter than it asked for;
 * `usePaginatedQuery` handles that.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    username: v.optional(v.string()),
    problemCode: v.optional(v.string()),
    contestKey: v.optional(v.string()),
    languageKeys: v.optional(v.array(v.string())),
    results: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const viewerCtx = await viewerContext(ctx);

    const username = args.username;
    const problemCode = args.problemCode;
    const contestKey = args.contestKey;

    const author = username
      ? await ctx.db
          .query("profiles")
          .withIndex("by_username", (q) => q.eq("username", username))
          .unique()
      : null;

    const problem = problemCode
      ? await ctx.db
          .query("problems")
          .withIndex("by_code", (q) => q.eq("code", problemCode))
          .unique()
      : null;

    const requestedContest = contestKey
      ? await ctx.db
          .query("contests")
          .withIndex("by_key", (q) => q.eq("key", contestKey))
          .unique()
      : null;

    if (
      (args.username && !author) ||
      (args.problemCode && !problem) ||
      (args.contestKey && !requestedContest)
    ) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    // Being in a contest no longer narrows this list to it. The contest's own
    // submissions page is where that view lives, and it is reachable from the
    // contest; this one stays the site's.
    const contestFilter = requestedContest;
    const profileFilter = author;

    const languageIds = new Set<Id<"languages">>();

    if (args.languageKeys?.length) {
      for (const key of args.languageKeys) {
        const language = await ctx.db
          .query("languages")
          .withIndex("by_key", (q) => q.eq("key", key))
          .first();

        if (language) languageIds.add(language._id);
      }

      if (languageIds.size === 0) return { page: [], isDone: true, continueCursor: "" };
    }

    const resultFilter = args.results?.length ? new Set(args.results) : null;

    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems * PAGE_SCAN_MULTIPLIER, 400),
    };

    // Pick the narrowest index the filters allow. Convex orders an index by its
    // fields and then `_creationTime`, which for submissions is date order.
    let result: {
      page: Doc<"submissions">[];
      isDone: boolean;
      continueCursor: string;
    };

    if (profileFilter && problem) {
      result = await ctx.db
        .query("submissions")
        .withIndex("by_profile_problem", (q) =>
          q.eq("profileId", profileFilter._id).eq("problemId", problem._id),
        )
        .order("desc")
        .paginate(paginationOpts);
    } else if (profileFilter) {
      result = await ctx.db
        .query("submissions")
        .withIndex("by_profile_date", (q) => q.eq("profileId", profileFilter._id))
        .order("desc")
        .paginate(paginationOpts);
    } else if (problem) {
      result = await ctx.db
        .query("submissions")
        .withIndex("by_problem_date", (q) => q.eq("problemId", problem._id))
        .order("desc")
        .paginate(paginationOpts);
    } else if (contestFilter) {
      result = await ctx.db
        .query("submissions")
        .withIndex("by_contest_date", (q) => q.eq("contestId", contestFilter._id))
        .order("desc")
        .paginate(paginationOpts);
    } else {
      result = await ctx.db.query("submissions").withIndex("by_date").order("desc").paginate(paginationOpts);
    }

    const caches = newCaches();
    const page: SubmissionListRow[] = [];

    for (const submission of result.page) {
      if (contestFilter && submission.contestId !== contestFilter._id) continue;

      if (languageIds.size > 0 && !languageIds.has(submission.languageId)) continue;

      if (resultFilter && !resultFilter.has(submission.result ?? "")) continue;

      if (!(await isListable(ctx, caches, submission, viewerCtx, now))) continue;
      page.push(await buildRow(ctx, caches, submission, viewerCtx, now));
    }

    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

/**
 * `filter_submissions_by_visible_problems` plus the contest arm of
 * `_get_queryset`: the problem has to be visible, and a contest submission has
 * to belong to a contest whose submissions the viewer may see.
 */
async function isListable(
  ctx: QueryCtx,
  caches: RowCaches,
  submission: Doc<"submissions">,
  viewerCtx: ViewerContext,
  now: number,
): Promise<boolean> {
  const viewer = viewerCtx.viewer;
  const problem = await cachedGet(ctx, caches.problems, submission.problemId);

  if (!problem) return false;

  // A viewer's own row is theirs to see wherever it is listed, including on a
  // contest problem that is not public: competing in the contest is what put it
  // there. This used to be reached only after the visibility check, which the
  // contest arm above it hid.
  const own = !!viewer && submission.profileId === viewer.id;

  if (!own && !problemIsVisibleTo(toCoreProblem(problem), viewer)) return false;

  if (!submission.contestId) return true;

  if (own) return true;

  if (coreHasPerm(viewer, "judge.see_private_contest")) return true;
  const contest = await cachedGet(ctx, caches.contests, submission.contestId);

  if (!contest) return true;

  return contestSubmissionsVisible(contest, viewer, now);
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                     */
/* -------------------------------------------------------------------------- */

export const detail = query({
  args: { submissionId: v.union(v.string(), v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const submission = await resolveSubmission(ctx, args.submissionId);

    if (!submission) return null;

    const viewerCtx = await viewerContext(ctx);
    const caches = newCaches();
    const row = await buildRow(ctx, caches, submission, viewerCtx, now);

    if (!row.canSeeDetail) {
      return { submission: row, cases: [], batches: [], error: null, canSeeDetail: false };
    }

    const cases = row.masked
      ? []
      : (
          await ctx.db
            .query("submissionTestCases")
            .withIndex("by_submission_case", (q) => q.eq("submissionId", submission._id))
            .collect()
        ).sort((a, b) => a.case - b.case);

    return {
      submission: row,
      canSeeDetail: true,
      error: row.masked ? null : (submission.error ?? null),
      cases: cases.map((testCase) => ({
        case: testCase.case,
        status: testCase.status,
        time: testCase.time,
        memory: testCase.memory,
        points: testCase.points,
        total: testCase.total,
        batch: testCase.batch ?? null,
        feedback: testCase.feedback,
        extendedFeedback: testCase.extendedFeedback,
        output: testCase.output,
      })),
    };
  },
});

export const source = query({
  args: { submissionId: v.union(v.string(), v.number()) },
  handler: async (ctx, args) => {
    const submission = await resolveSubmission(ctx, args.submissionId);

    if (!submission) return null;

    const viewerCtx = await viewerContext(ctx);
    const caches = newCaches();
    const row = await buildRow(ctx, caches, submission, viewerCtx, Date.now());

    if (!row.canSeeDetail) return { canSeeSource: false, source: null, language: row.language };

    const stored = await ctx.db
      .query("submissionSources")
      .withIndex("by_submission", (q) => q.eq("submissionId", submission._id))
      .unique();

    return { canSeeSource: true, source: stored?.source ?? "", language: row.language };
  },
});

/**
 * `/problem/<code>/resubmit/<id>`: the old source and language, so the submit
 * form can start from them. `resubmit_other` is needed for someone else's.
 */
export const resubmit = query({
  args: { submissionId: v.union(v.string(), v.number()) },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const submission = await resolveSubmission(ctx, args.submissionId);

    if (!submission) return null;

    const core = await coreProfile(ctx, viewer);

    if (submission.profileId !== viewer._id && !coreHasPerm(core, "judge.resubmit_other")) {
      throw forbidden("You may not resubmit someone else's submission.");
    }

    const problem = await ctx.db.get(submission.problemId);
    const language = await ctx.db.get(submission.languageId);

    const stored = await ctx.db
      .query("submissionSources")
      .withIndex("by_submission", (q) => q.eq("submissionId", submission._id))
      .unique();

    if (!problem || !language) return null;

    return {
      problemCode: problem.code,
      languageKey: language.key,
      source: stored?.source ?? "",
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Stats                                                                      */
/* -------------------------------------------------------------------------- */

/** `judge/utils/problems.py:_get_result_data`, the submission-stats chart. */
export const resultsForProblem = query({
  args: { problemCode: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const counts: Record<string, number> = {};
    const scan = Math.max(1, Math.min(args.limit ?? 5000, 8000));

    let rows: Doc<"submissions">[];

    const problemCode = args.problemCode;

    if (problemCode) {
      const problem = await ctx.db
        .query("problems")
        .withIndex("by_code", (q) => q.eq("code", problemCode))
        .unique();

      if (!problem) return { categories: [], total: 0 };
      rows = await ctx.db
        .query("submissions")
        .withIndex("by_problem_date", (q) => q.eq("problemId", problem._id))
        .order("desc")
        .take(scan);
    } else {
      rows = await ctx.db.query("submissions").withIndex("by_date").order("desc").take(scan);
    }

    let total = 0;

    for (const row of rows) {
      const key = row.result ?? "";
      counts[key] = (counts[key] ?? 0) + 1;
      total += 1;
    }

    const count = (code: string) => counts[code] ?? 0;

    return {
      categories: [
        { code: "AC", name: "Accepted", count: count("AC") },
        { code: "WA", name: "Wrong", count: count("WA") },
        { code: "CE", name: "Compile Error", count: count("CE") },
        { code: "TLE", name: "Timeout", count: count("TLE") },
        {
          code: "ERR",
          name: "Error",
          count: count("MLE") + count("OLE") + count("IR") + count("RTE") + count("AB") + count("IE"),
        },
      ],
      total,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Submitting                                                                 */
/* -------------------------------------------------------------------------- */

/** `get_contest_submission_count`: attempts against a contest problem, IE excluded. */
async function contestSubmissionCount(
  ctx: QueryCtx,
  participation: Doc<"contestParticipations">,
  contestProblemId: Id<"contestProblems">,
): Promise<number> {
  const rows = await ctx.db
    .query("submissions")
    .withIndex("by_participation", (q) => q.eq("participationId", participation._id))
    .collect();

  return rows.filter((row) => row.contestProblemId === contestProblemId && row.status !== "IE").length;
}

/** `Submission.objects.filter(user=..., rejudged_date__isnull=True).exclude(status__in=[...])`. */
async function submissionsInFlight(ctx: QueryCtx, profileId: Id<"profiles">): Promise<number> {
  let count = 0;

  for (const status of ["QU", "P", "G"] as const) {
    const rows = await ctx.db
      .query("submissions")
      .withIndex("by_profile_status", (q) => q.eq("profileId", profileId).eq("status", status))
      .take(SUBMISSION_LIMIT + 8);

    count += rows.filter((row) => row.rejudgedDate === undefined).length;
  }

  return count;
}

export const submit = mutation({
  args: {
    problemCode: v.string(),
    languageKey: v.string(),
    source: v.string(),
    judgePin: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ submissionId: Id<"submissions">; id: number }> => {
    const profile = await requireViewer(ctx);
    const viewer = await coreProfile(ctx, profile);

    // `ProblemSubmitForm.source` is a CharField(max_length=65536).
    if (args.source.length === 0) throw invalid("A submission needs some source.");

    if (args.source.length > MAX_SOURCE_LENGTH) {
      throw invalid(`Source must be at most ${MAX_SOURCE_LENGTH} characters.`);
    }

    const problem = await ctx.db
      .query("problems")
      .withIndex("by_code", (q) => q.eq("code", args.problemCode))
      .unique();

    if (!problem) throw notFound("Problem");

    const language = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", args.languageKey))
      .first();

    if (!language) throw notFound("Language");

    // Contest mode first: a contest problem is accessible even when the problem
    // itself is not, and it decides the priority and the lock.
    const viewerCtx = await viewerContext(ctx);
    let contestProblem: Doc<"contestProblems"> | null = null;

    const proctorBlocked =
      viewerCtx.contest !== null && (await proctorBlocksContestProblems(ctx, viewerCtx.contest, profile._id));

    if (viewerCtx.inContest && viewerCtx.contest && !proctorBlocked) {
      const contestProblems = await ctx.db
        .query("contestProblems")
        .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
        .collect();

      contestProblem = contestProblems.find((row) => row.contestId === viewerCtx.contest?._id) ?? null;
    }

    if (
      !problemIsAccessibleBy(toCoreProblem(problem), viewer, {
        inCurrentContest: contestProblem !== null,
      })
    ) {
      throw forbidden("You may not submit to this problem.");
    }

    // Submitting is the act that decides the standings, so it is the one a
    // proctored contest most has to hold.
    if (viewerCtx.contest) {
      await requireProctored(ctx, viewerCtx.contest, profile._id);
    }

    // `form_valid`: the rate limits come before everything else.
    if (!coreHasPerm(viewer, "judge.spam_submission")) {
      if ((await submissionsInFlight(ctx, profile._id)) >= SUBMISSION_LIMIT) {
        throw mojError("RATE_LIMITED", "You submitted too many submissions.");
      }

      const burst = await rateLimiter.limit(ctx, "submit", { key: profile._id });

      if (!burst.ok) throw mojError("RATE_LIMITED", "You submitted too many submissions.");
      const daily = await rateLimiter.limit(ctx, "submitDaily", { key: profile._id });

      if (!daily.ok) throw mojError("RATE_LIMITED", "You submitted too many submissions.");
    }

    if (!problem.allowedLanguageIds.includes(language._id)) {
      throw forbidden("That language is not allowed for this problem.");
    }

    if (!profile.isSuperuser && problem.bannedProfileIds.includes(profile._id)) {
      throw forbidden(
        "You have been declared persona non grata for this problem. " +
          "You are permanently barred from submitting to this problem.",
      );
    }

    if (contestProblem?.maxSubmissions && viewerCtx.participation) {
      const used = await contestSubmissionCount(ctx, viewerCtx.participation, contestProblem._id);

      if (used >= contestProblem.maxSubmissions) {
        throw forbidden("You have exceeded the submission limit for this problem.");
      }
    }

    let judgePin: Id<"judges"> | undefined;

    const judgeName = args.judgePin;

    if (judgeName) {
      // DMOJ only offers the judge picker to a problem's editors.
      if (!problemIsEditableBy(toCoreProblem(problem), viewer)) {
        throw forbidden("You may not pin a submission to a judge.");
      }

      const judge = await ctx.db
        .query("judges")
        .withIndex("by_name", (q) => q.eq("name", judgeName))
        .unique();

      if (!judge) throw notFound("Judge");
      judgePin = judge._id;
    }

    const now = Date.now();
    const live = viewerCtx.participation?.virtual === 0;

    const isPretested =
      contestProblem !== null &&
      (viewerCtx.contest?.runPretestsOnly ?? false) &&
      (contestProblem.isPretested ?? false);

    const fields: WithoutSystemFields<Doc<"submissions">> = {
      profileId: profile._id,
      problemId: problem._id,
      date: now,
      languageId: language._id,
      status: "QU",
      currentTestcase: 0,
      batch: false,
      casePoints: 0,
      caseTotal: 0,
      isPretested,
      isArchived: false,
      // judge/judge_priority.py: contest submissions jump the queue.
      priority: contestProblem ? 0 : 1,
      retryCount: 0,
      legacyId: await allocateSubmissionNumber(ctx),
    };

    if (contestProblem && viewerCtx.contest && viewerCtx.participation) {
      fields.contestId = viewerCtx.contest._id;
      fields.contestProblemId = contestProblem._id;
      fields.participationId = viewerCtx.participation._id;
      fields.contestPoints = 0;
      fields.isContestPretest = isPretested;

      if (live && viewerCtx.contest.lockedAfter !== undefined) {
        fields.lockedAfter = viewerCtx.contest.lockedAfter;
      }
    }

    if (judgePin) fields.judgePin = judgePin;
    const submissionId = await ctx.db.insert("submissions", fields);

    await ctx.db.insert("submissionSources", { submissionId, source: args.source });

    // Nothing is pushed: the judge is polling /judge/claim and will pick this up.
    const stored = await ctx.db.get(submissionId);

    return { submissionId, id: stored?.legacyId ?? 0 };
  },
});

/* -------------------------------------------------------------------------- */
/* Abort and rejudge                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `abort_submission` plus `judgeapi.abort_submission`.
 *
 * A queued submission never reaches a judge, so it is aborted here and now. One
 * a judge already holds gets a flag, which the judge picks up within a second
 * from `GET /judge/abort` and answers with `submission-terminated`.
 */
export const abort = mutation({
  args: { submissionId: v.union(v.string(), v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);
    const viewer = await coreProfile(ctx, profile);
    const submission = await resolveSubmission(ctx, args.submissionId);

    if (!submission) throw notFound("Submission");

    if (!coreHasPerm(viewer, "judge.abort_any_submission")) {
      if (submission.rejudgedDate !== undefined || submission.profileId !== profile._id) {
        throw forbidden("You may not abort this submission.");
      }
    }

    // Aborting a finished submission would falsely mark it aborted.
    if (submission.status === "D") return { aborted: false, pending: false };

    if (submission.status === "QU") {
      await ctx.db.patch(submission._id, {
        status: "AB",
        result: "AB",
        points: 0,
        abortRequested: undefined,
        claimedByJudgeId: undefined,
        claimedAt: undefined,
      });

      return { aborted: true, pending: false };
    }

    if (submission.status === "P" || submission.status === "G") {
      await ctx.db.patch(submission._id, { abortRequested: true });

      return { aborted: false, pending: true };
    }

    return { aborted: false, pending: false };
  },
});

/** `Submission.judge(rejudge=True)`, gated by `judge.rejudge_submission`. */
export const rejudge = mutation({
  args: { submissionId: v.union(v.string(), v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);
    const viewer = await coreProfile(ctx, profile);

    if (!coreHasPerm(viewer, "judge.rejudge_submission")) {
      throw forbidden("Missing permission judge.rejudge_submission.");
    }

    const submission = await resolveSubmission(ctx, args.submissionId);

    if (!submission) throw notFound("Submission");

    if (isLocked({ lockedAfter: submission.lockedAfter ?? null }) && !coreIsSuperuser(viewer)) {
      throw forbidden("This submission is locked.");
    }

    const queued = await queueSubmission(ctx, submission._id, { rejudge: true });

    if (!queued) throw invalid("This submission is already being judged.");

    return { ok: true };
  },
});
