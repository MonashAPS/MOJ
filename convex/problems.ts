/**
 * Problems: the list, the problem page, the random pick, the editorial, the
 * ranked submissions and the small reads the problem pages hang off.
 *
 * The viewer and access helpers here are what the other problem modules share:
 * `problems/votes.ts`, `problems/pdf.ts`, `problems/data.ts`,
 * `problems/testData.ts`, `admin/problems.ts` and the pages that read a
 * problem all go through `loadViewerContext`, `problemByCode` and
 * `canAccessProblem` rather than repeating the rules.
 */

import {
  contestIsInContest,
  contestIsVisibleTo,
  hasPerm as coreHasPerm,
  DEFAULT_SUBMISSION_SOURCE_VISIBILITY,
  isFullSolve,
  problemIsAccessibleBy,
  problemIsEditableBy,
  problemIsVisibleTo,
  solutionIsAccessibleBy,
  voteCanView,
  voteCanVote,
  votePermissionForUser,
} from "@moj/core";
import type { ProblemRow, ProfileRow } from "@moj/core/types";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, query } from "./_generated/server";
import { labelForProblem, problemListAccessFor, toContestRow } from "./contests/formats";
import { optionalViewer } from "./lib/auth";
import { notFound } from "./lib/errors";
import { proctorBlocksContestProblems } from "./lib/proctor";
import { profileByUsername } from "./profiles";

export const HOT_PROBLEM_COUNT = 7;

export const HOT_PROBLEM_WINDOW_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_PAGE_SIZE = 50;

/** `Problem.code`: DMOJ's slug field, lowercase letters, digits and dots. */
export const PROBLEM_CODE_PATTERN = /^[a-z.0-9]+$/;

/** Cap on how far a single list query will scan. */
const MAX_SCAN = 20_000;

export type ProblemState = "solved" | "partial" | "attempted" | "none";

export type ViewerContext = {
  profile: Doc<"profiles"> | null;
  core: ProfileRow | null;
  participation: Doc<"contestParticipations"> | null;
  contest: Doc<"contests"> | null;
  inContest: boolean;
};

/** A public problem does not make its unreleased contest associations public. */
export function canSeeContestAssociation(
  contest: Doc<"contests">,
  viewer: { profile: Doc<"profiles"> | null; core: Parameters<typeof contestIsVisibleTo>[1] },
  now = Date.now(),
): boolean {
  const taking = contestIsInContest(toContestRow(contest), viewer.core);

  return (
    (taking || contestIsVisibleTo(toContestRow(contest), viewer.core)) &&
    problemListAccessFor(contest, viewer.profile, viewer.core, taking, now).released
  );
}

/* -------------------------------------------------------------------------- */
/* Viewer                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Everything `@moj/core` needs about the viewer, plus the contest-mode state
 * DMOJ keeps on `Profile.current_contest`.
 *
 * Organizations, classes and the two "admin of" lists live in their own tables
 * here, so they are gathered once and denormalised onto the plain row the pure
 * rules take.
 */
export async function loadViewerContext(ctx: QueryCtx): Promise<ViewerContext> {
  const profile = await optionalViewer(ctx);

  if (!profile) {
    return { profile: null, core: null, participation: null, contest: null, inContest: false };
  }

  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .collect();

  const organizationIds = memberships.map((row) => row.organizationId);

  const organizations = await ctx.db.query("organizations").collect();

  const adminOfOrganizationIds = organizations
    .filter((row) => row.adminProfileIds.includes(profile._id))
    .map((row) => row._id);

  const classes = await ctx.db.query("classes").collect();

  const classIds = classes.filter((row) => row.memberProfileIds.includes(profile._id)).map((row) => row._id);

  const adminOfClassIds = classes
    .filter((row) => row.adminProfileIds.includes(profile._id))
    .map((row) => row._id);

  let participation: Doc<"contestParticipations"> | null = null;
  let contest: Doc<"contests"> | null = null;

  if (profile.currentParticipationId) {
    participation = await ctx.db.get(profile.currentParticipationId);

    if (participation) contest = await ctx.db.get(participation.contestId);
  }

  const core: ProfileRow = {
    id: profile._id,
    username: profile.username,
    isStaff: profile.isStaff,
    isSuperuser: profile.isSuperuser,
    permissions: profile.permissions,
    organizationIds,
    classIds,
    adminOfOrganizationIds,
    adminOfClassIds,
    isUnlisted: profile.isUnlisted,
    isBannedFromProblemVoting: profile.isBannedFromProblemVoting,
    mute: profile.mute,
    currentParticipationId: participation ? participation._id : null,
    currentContestId: contest ? contest._id : null,
    rating: profile.rating ?? null,
    displayRank: profile.displayRank,
    points: profile.points,
    performancePoints: profile.performancePoints,
    problemCount: profile.problemCount,
  };

  return { profile, core, participation, contest, inContest: participation !== null };
}

/** The plain row `@moj/core`'s problem rules take. */
export function toCoreProblem(problem: Doc<"problems">): ProblemRow {
  return {
    id: problem._id,
    code: problem.code,
    name: problem.name,
    isPublic: problem.isPublic,
    isOrganizationPrivate: problem.isOrganizationPrivate,
    organizationIds: problem.organizationIds,
    authorProfileIds: problem.authorProfileIds,
    curatorProfileIds: problem.curatorProfileIds,
    testerProfileIds: problem.testerProfileIds,
    bannedProfileIds: problem.bannedProfileIds,
    points: problem.points,
    partial: problem.partial,
    submissionSourceVisibility: problem.submissionSourceVisibility,
  };
}

export async function problemByCode(
  ctx: QueryCtx | MutationCtx,
  code: string,
): Promise<Doc<"problems"> | null> {
  return await ctx.db
    .query("problems")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}

/** `problemByCode` for the callers that have nothing to say about a miss. */
export async function requireProblem(ctx: QueryCtx | MutationCtx, code: string): Promise<Doc<"problems">> {
  const problem = await problemByCode(ctx, code);

  if (!problem) throw notFound("Problem");

  return problem;
}

/** `Problem.is_solved_by(user)`: an AC with full case points, archives aside. */
export async function hasSolvedProblem(
  ctx: QueryCtx,
  profileId: Id<"profiles"> | undefined,
  problemId: Id<"problems">,
): Promise<boolean> {
  if (!profileId) return false;

  const rows = await ctx.db
    .query("submissions")
    .withIndex("by_profile_problem", (q) => q.eq("profileId", profileId).eq("problemId", problemId))
    .collect();

  return rows.some((row) => !row.isArchived && isFullSolve(row));
}

export async function contestProblemFor(
  ctx: QueryCtx,
  contestId: Id<"contests">,
  problemId: Id<"problems">,
): Promise<Doc<"contestProblems"> | null> {
  const rows = await ctx.db
    .query("contestProblems")
    .withIndex("by_problem", (q) => q.eq("problemId", problemId))
    .collect();

  return rows.find((row) => row.contestId === contestId) ?? null;
}

/**
 * `Problem.is_accessible_by`. The contest-problem short circuit needs a lookup,
 * so it is resolved here and handed to the pure rule.
 */
export async function canAccessProblem(
  ctx: QueryCtx,
  problem: Doc<"problems">,
  viewer: ViewerContext,
): Promise<boolean> {
  let inCurrentContest = false;

  // A proctored contest only opens its problems while the viewer is sharing
  // their screen. Without that the bypass falls away and the problem's own
  // visibility decides, so a public problem stays readable and an unlisted one
  // does not.
  if (
    viewer.contest &&
    !(await proctorBlocksContestProblems(ctx, viewer.contest, viewer.profile?._id ?? null))
  ) {
    inCurrentContest = (await contestProblemFor(ctx, viewer.contest._id, problem._id)) !== null;
  }

  return problemIsAccessibleBy(toCoreProblem(problem), viewer.core, { inCurrentContest });
}

/* -------------------------------------------------------------------------- */
/* Solved / attempted sets                                                    */
/* -------------------------------------------------------------------------- */

export type SolveSets = {
  solved: Set<string>;
  attempted: Set<string>;
  /** Best score on each problem, for the partial state and the compare view. */
  best: Map<string, number>;
};

const EMPTY_SETS: SolveSets = { solved: new Set(), attempted: new Set(), best: new Map() };

/**
 * `user_completed_ids` / `user_attempted_ids`, or their contest equivalents
 * when the viewer is in contest mode (judge/utils/problems.py).
 */
export async function solveSetsFor(ctx: QueryCtx, viewer: ViewerContext): Promise<SolveSets> {
  if (!viewer.profile) return EMPTY_SETS;

  if (viewer.inContest && viewer.participation) {
    const participationId = viewer.participation._id;

    const submissions = await ctx.db
      .query("submissions")
      .withIndex("by_participation", (q) => q.eq("participationId", participationId))
      .take(MAX_SCAN);

    const solved = new Set<string>();
    const attempted = new Set<string>();
    const best = new Map<string, number>();

    for (const submission of submissions) {
      const key = submission.problemId;
      attempted.add(key);
      const points = submission.contestPoints ?? 0;

      if (points > (best.get(key) ?? Number.NEGATIVE_INFINITY)) best.set(key, points);

      // contest_completed_ids: AC with contest points at least the problem's.
      if (submission.result === "AC" && submission.contestProblemId) {
        const link = await ctx.db.get(submission.contestProblemId);

        if (link && points >= link.points) solved.add(key);
      }
    }

    return { solved, attempted, best };
  }

  const profileId = viewer.profile._id;

  const submissions = await ctx.db
    .query("submissions")
    .withIndex("by_profile_date", (q) => q.eq("profileId", profileId))
    .take(MAX_SCAN);

  const solved = new Set<string>();
  const attempted = new Set<string>();
  const best = new Map<string, number>();

  for (const submission of submissions) {
    const key = submission.problemId;
    attempted.add(key);

    if (submission.points !== undefined && submission.points !== null) {
      if (submission.points > (best.get(key) ?? Number.NEGATIVE_INFINITY)) {
        best.set(key, submission.points);
      }
    }

    if (
      !submission.isArchived &&
      submission.result === "AC" &&
      submission.casePoints >= submission.caseTotal
    ) {
      solved.add(key);
    }
  }

  return { solved, attempted, best };
}

/** `user_completed_ids` for someone other than the viewer, used by "Solved by". */
async function solvedIdsForProfile(ctx: QueryCtx, profileId: Id<"profiles">): Promise<Set<string>> {
  const submissions = await ctx.db
    .query("submissions")
    .withIndex("by_profile_date", (q) => q.eq("profileId", profileId))
    .take(MAX_SCAN);

  const solved = new Set<string>();

  for (const submission of submissions) {
    if (
      !submission.isArchived &&
      submission.result === "AC" &&
      submission.casePoints >= submission.caseTotal
    ) {
      solved.add(submission.problemId);
    }
  }

  return solved;
}

/** The viewer's standing on one problem, as the list and the problem page show it. */
type SolveState = {
  state: ProblemState;
  bestPoints: number | null;
};

function stateFor(problemId: string, points: number, sets: SolveSets): SolveState {
  const best = sets.best.get(problemId) ?? null;

  if (sets.solved.has(problemId)) return { state: "solved", bestPoints: best };

  if (sets.attempted.has(problemId)) {
    if (best !== null && best > 0 && best < points) return { state: "partial", bestPoints: best };

    return { state: "attempted", bestPoints: best };
  }

  return { state: "none", bestPoints: best };
}

/* -------------------------------------------------------------------------- */
/* Shared lookups                                                             */
/* -------------------------------------------------------------------------- */

async function profileSummaries(ctx: QueryCtx, ids: readonly Id<"profiles">[]) {
  const out: {
    id: Id<"profiles">;
    username: string;
    displayRank: string;
    rating: number | null;
  }[] = [];

  for (const id of ids) {
    const row = await ctx.db.get(id);

    if (!row) continue;
    out.push({
      id: row._id,
      username: row.username,
      displayRank: row.displayRank,
      rating: row.rating ?? null,
    });
  }

  return out;
}

export async function solutionFor(ctx: QueryCtx, problemId: Id<"problems">) {
  return await ctx.db
    .query("solutions")
    .withIndex("by_problem", (q) => q.eq("problemId", problemId))
    .unique();
}

async function typesFor(ctx: QueryCtx, problem: Doc<"problems">) {
  const out: { id: Id<"problemTypes">; name: string; fullName: string }[] = [];

  for (const id of problem.typeIds) {
    const row = await ctx.db.get(id);

    if (row) out.push({ id: row._id, name: row.name, fullName: row.fullName });
  }

  return out;
}

export async function translationFor(ctx: QueryCtx, problemId: Id<"problems">, language: string) {
  if (!language) return null;

  return await ctx.db
    .query("problemTranslations")
    .withIndex("by_problem_language", (q) => q.eq("problemId", problemId).eq("language", language))
    .unique();
}

/** A heading, in markdown or in the raw HTML some imported statements use. */
const SAMPLE_INPUT_HEADING = /(^[ \t]{0,3}#{1,6}|<h[1-6][^>]*>)[^\n]*\binput\b/im;

const SAMPLE_OUTPUT_HEADING = /(^[ \t]{0,3}#{1,6}|<h[1-6][^>]*>)[^\n]*\boutput\b/im;

/**
 * Whether a statement looks like it carries samples to download.
 *
 * The samples are written into the statement rather than kept as test data, so
 * the only thing that can be known without rendering every problem in a contest
 * is whether it has the headings a sample sits under — the same pair the
 * download itself reads the blocks from. A statement that heads a section and
 * shows nothing under it offers an empty download, which the route refuses.
 */
export function statementHasSamples(markdown: string): boolean {
  return SAMPLE_INPUT_HEADING.test(markdown) && SAMPLE_OUTPUT_HEADING.test(markdown);
}

/* -------------------------------------------------------------------------- */
/* catalog                                                                    */
/* -------------------------------------------------------------------------- */

/** One problem as the problem list draws, filters and sorts it. */
export type CatalogRow = {
  id: Id<"problems">;
  code: string;
  name: string;
  group: { name: string; fullName: string } | null;
  types: { id: Id<"problemTypes">; name: string; fullName: string }[];
  points: number;
  partial: boolean;
  acRate: number;
  userCount: number;
  date: number;
  hasPublicEditorial: boolean;
  state: ProblemState;
  bestPoints: number | null;
  /** Authors and curators, for the author filter. */
  authors: string[];
  /** The contests it appeared in that the viewer may know about, with its label in each. */
  contests: { key: string; label: string }[];
};

export type CatalogContest = { key: string; name: string; startTime: number };

/**
 * Every problem the viewer may see, as small rows the browser filters, sorts
 * and pages itself.
 *
 * There are a few hundred problems, so sending them all once is cheaper than a
 * server round trip per filter: a click re-sorts in place, and this query's
 * arguments never change, so its cached answer is shared across every filter.
 * The two filters that need the server, statement search and "solved by",
 * answer with ids from `searchIds` and `solvedByIds`.
 */
export const catalog = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await loadViewerContext(ctx);
    const sets = await solveSetsFor(ctx, viewer);
    const now = Date.now();

    const problems = (await ctx.db.query("problems").take(MAX_SCAN)).filter((row) =>
      problemIsVisibleTo(toCoreProblem(row), viewer.core),
    );

    // Each lookup table is read once rather than once per problem.
    const editorial = new Set<string>();

    for (const solution of await ctx.db.query("solutions").take(MAX_SCAN)) {
      if (solution.isPublic && solution.publishOn <= now) editorial.add(solution.problemId);
    }

    const groups = new Map<string, { name: string; fullName: string } | null>();
    const types = new Map<string, CatalogRow["types"][number] | null>();
    const usernames = new Map<string, string | null>();

    // Contest labels follow each contest's own order, and only contests whose
    // problem list the viewer may know about are mentioned at all.
    const linksByContest = new Map<Id<"contests">, Doc<"contestProblems">[]>();

    for (const link of await ctx.db.query("contestProblems").take(MAX_SCAN)) {
      const bucket = linksByContest.get(link.contestId) ?? [];
      bucket.push(link);
      linksByContest.set(link.contestId, bucket);
    }

    const contests: CatalogContest[] = [];
    const contestsByProblem = new Map<string, CatalogRow["contests"]>();

    for (const [contestId, links] of linksByContest) {
      const contest = await ctx.db.get(contestId);

      if (!contest || !canSeeContestAssociation(contest, viewer, now)) continue;
      contests.push({ key: contest.key, name: contest.name, startTime: contest.startTime });
      links.sort((a, b) => a.order - b.order);

      for (const [index, link] of links.entries()) {
        const bucket = contestsByProblem.get(link.problemId) ?? [];
        bucket.push({ key: contest.key, label: labelForProblem(contest, index) });
        contestsByProblem.set(link.problemId, bucket);
      }
    }

    const rows: CatalogRow[] = [];

    for (const row of problems) {
      if (!groups.has(row.groupId)) {
        const group = await ctx.db.get(row.groupId);
        groups.set(row.groupId, group ? { name: group.name, fullName: group.fullName } : null);
      }

      for (const typeId of row.typeIds) {
        if (types.has(typeId)) continue;
        const type = await ctx.db.get(typeId);
        types.set(typeId, type ? { id: type._id, name: type.name, fullName: type.fullName } : null);
      }

      for (const profileId of [...row.authorProfileIds, ...row.curatorProfileIds]) {
        if (usernames.has(profileId)) continue;
        usernames.set(profileId, (await ctx.db.get(profileId))?.username ?? null);
      }

      const { state, bestPoints } = stateFor(row._id, row.points, sets);
      rows.push({
        id: row._id,
        code: row.code,
        name: row.name,
        group: groups.get(row.groupId) ?? null,
        types: row.typeIds.flatMap((id) => {
          const type = types.get(id);

          return type ? [type] : [];
        }),
        points: row.points,
        partial: row.partial,
        acRate: row.acRate,
        userCount: row.userCount,
        date: row.date,
        hasPublicEditorial: editorial.has(row._id),
        state,
        bestPoints,
        authors: [...row.authorProfileIds, ...row.curatorProfileIds].flatMap((id) => {
          const username = usernames.get(id);

          return username ? [username] : [];
        }),
        contests: contestsByProblem.get(row._id) ?? [],
      });
    }

    return {
      /** Who this was answered for, so the page can refuse an answer that came
       *  back for nobody while the browser was re-authenticating. */
      viewer: viewer.profile?.username ?? null,
      /** Set while the viewer is inside a locked-down contest: the page draws
       *  the list blurred behind a way back in. Contests lock down unless they
       *  opted out. */
      contestLock:
        viewer.inContest && viewer.contest && viewer.contest.disableLockdown !== true
          ? { key: viewer.contest.key, name: viewer.contest.name }
          : null,
      rows,
      contests,
    };
  },
});

/**
 * The visible problems whose name or statement matches, through the search
 * indexes. The browser matches codes and names itself; this adds the
 * statement text it does not have.
 */
export const searchIds = query({
  args: { search: v.string() },
  handler: async (ctx, { search }): Promise<Id<"problems">[]> => {
    const term = search.trim();

    if (!term) return [];
    const viewer = await loadViewerContext(ctx);

    const byName = await ctx.db
      .query("problems")
      .withSearchIndex("search_name_desc", (q) => q.search("name", term))
      .take(500);

    const byDescription = await ctx.db
      .query("problems")
      .withSearchIndex("search_description", (q) => q.search("description", term))
      .take(500);

    const ids = new Set<Id<"problems">>();

    for (const row of [...byName, ...byDescription]) {
      if (problemIsVisibleTo(toCoreProblem(row), viewer.core)) ids.add(row._id);
    }

    return [...ids];
  },
});

/** The problems every one of these users has fully solved: the "Solved by" filter. */
export const solvedByIds = query({
  args: { usernames: v.array(v.string()) },
  handler: async (ctx, { usernames }): Promise<string[]> => {
    let solved: string[] | null = null;

    for (const username of usernames.slice(0, 10)) {
      const profile = await profileByUsername(ctx, username);

      // An unknown user has solved nothing, so nothing is solved by all of them.
      if (!profile) return [];
      const theirs = await solvedIdsForProfile(ctx, profile._id);
      solved = solved === null ? [...theirs] : solved.filter((id) => theirs.has(id));
    }

    return solved ?? [];
  },
});

/* -------------------------------------------------------------------------- */
/* get                                                                        */
/* -------------------------------------------------------------------------- */

export const get = query({
  args: { code: v.string(), language: v.optional(v.string()) },
  handler: async (ctx, { code, language }) => {
    const problem = await problemByCode(ctx, code);

    if (!problem) return null;

    const viewer = await loadViewerContext(ctx);

    if (!(await canAccessProblem(ctx, problem, viewer))) return null;

    const core = toCoreProblem(problem);
    const canEdit = problemIsEditableBy(core, viewer.core);
    const sets = await solveSetsFor(ctx, viewer);
    const now = Date.now();

    // Statement, with the viewer's language translation when there is one.
    const translation = await translationFor(ctx, problem._id, language ?? "");

    const statement = {
      language: translation ? translation.language : "en",
      translated: translation !== null,
      name: translation?.name ?? problem.name,
      source: translation?.description ?? problem.description,
      // The Convex runtime cannot load @moj/content (it reaches node:fs through
      // the Typst renderer), so the caller renders.
      preset: problem.isFullMarkup ? "problem-full" : "problem",
    };

    const limits = await ctx.db
      .query("languageLimits")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect();

    const languageLimits = [];

    for (const limit of limits) {
      const lang = await ctx.db.get(limit.languageId);

      if (!lang) continue;
      languageLimits.push({
        languageKey: lang.key,
        languageName: lang.name,
        timeLimit: limit.timeLimit,
        memoryLimit: limit.memoryLimit,
      });
    }

    const allowedLanguages = [];

    for (const id of problem.allowedLanguageIds) {
      const lang = await ctx.db.get(id);

      if (lang) {
        allowedLanguages.push({ key: lang.key, name: lang.name, shortName: lang.shortName });
      }
    }

    const totalLanguages = (await ctx.db.query("languages").collect()).length;

    // Types are hidden inside a contest that sets hide_problem_tags.
    const hideTags = viewer.inContest && viewer.contest?.hideProblemTags === true;
    const hideAuthors = viewer.inContest && viewer.contest?.hideProblemAuthors === true;

    const contestProblem = viewer.contest
      ? await contestProblemFor(ctx, viewer.contest._id, problem._id)
      : null;

    // Every contest this problem appeared in (SPEC section 20).
    const links = await ctx.db
      .query("contestProblems")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect();

    const appearedIn = [];

    for (const link of links) {
      const contest = await ctx.db.get(link.contestId);

      if (!contest || !canSeeContestAssociation(contest, viewer)) continue;

      const siblings = await ctx.db
        .query("contestProblems")
        .withIndex("by_contest_order", (q) => q.eq("contestId", contest._id))
        .collect();

      siblings.sort((a, b) => a.order - b.order);
      const index = siblings.findIndex((row) => row._id === link._id);
      appearedIn.push({
        contestKey: contest.key,
        contestName: contest.name,
        label: labelForProblem(contest, index < 0 ? link.order : index),
        startTime: contest.startTime,
        endTime: contest.endTime,
        points: link.points,
      });
    }

    appearedIn.sort((a, b) => b.startTime - a.startTime);

    // Stats strip.
    const submissions = await ctx.db
      .query("submissions")
      .withIndex("by_problem_date", (q) => q.eq("problemId", problem._id))
      .take(MAX_SCAN);

    let attempts = 0;
    let accepted = 0;
    const solvers = new Set<string>();
    let bestTime: number | null = null;
    let fastestProfileId: Id<"profiles"> | null = null;
    let fastestSubmissionId: Id<"submissions"> | null = null;
    let viewerHasSubmissions = false;

    for (const submission of submissions) {
      if (viewer.profile && submission.profileId === viewer.profile._id) {
        viewerHasSubmissions = true;
      }

      if (submission.isArchived) continue;
      attempts += 1;

      if (!(submission.result === "AC" && submission.casePoints >= submission.caseTotal)) continue;
      accepted += 1;
      solvers.add(submission.profileId);

      if (submission.time !== undefined && (bestTime === null || submission.time < bestTime)) {
        bestTime = submission.time;
        fastestProfileId = submission.profileId;
        fastestSubmissionId = submission._id;
      }
    }

    const fastest = fastestProfileId ? await ctx.db.get(fastestProfileId) : null;

    const solution = await solutionFor(ctx, problem._id);

    const canSeeEditorial =
      !!solution &&
      !viewer.inContest &&
      solutionIsAccessibleBy(
        {
          problemId: solution.problemId,
          isPublic: solution.isPublic,
          publishOn: solution.publishOn,
        },
        core,
        viewer.core,
        now,
      );

    const votePermission = votePermissionForUser(core, viewer.core, {
      hasSolvedProblem: sets.solved.has(problem._id),
    });

    let existingVote: Doc<"problemPointsVotes"> | null = null;

    if (viewer.profile && voteCanVote(votePermission)) {
      const voterId = viewer.profile._id;
      existingVote = await ctx.db
        .query("problemPointsVotes")
        .withIndex("by_voter_problem", (q) => q.eq("voterProfileId", voterId).eq("problemId", problem._id))
        .unique();
    }

    const availableJudges = (
      await ctx.db
        .query("judges")
        .withIndex("by_online_tier", (q) => q.eq("online", true))
        .collect()
    ).length;

    const bannedFromSubmitting =
      !!viewer.profile &&
      !viewer.profile.isSuperuser &&
      problem.bannedProfileIds.includes(viewer.profile._id);

    const group = await ctx.db.get(problem.groupId);
    const license = problem.licenseId ? await ctx.db.get(problem.licenseId) : null;
    const { state, bestPoints } = stateFor(problem._id, problem.points, sets);

    let submissionsLeft: number | null = null;

    if (contestProblem?.maxSubmissions && viewer.participation) {
      const participationId = viewer.participation._id;

      const contestSubs = await ctx.db
        .query("submissions")
        .withIndex("by_participation", (q) => q.eq("participationId", participationId))
        .collect();

      const used = contestSubs.filter((row) => row.problemId === problem._id && row.status !== "IE").length;
      submissionsLeft = Math.max(contestProblem.maxSubmissions - used, 0);
    }

    const clarificationRows = contestProblem
      ? (
          await ctx.db
            .query("problemClarifications")
            .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
            .collect()
        ).sort((a, b) => b.date - a.date)
      : [];

    return {
      id: problem._id,
      code: problem.code,
      name: problem.name,
      statement,
      points: problem.points,
      partial: problem.partial,
      timeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
      shortCircuit: problem.shortCircuit,
      isPublic: problem.isPublic,
      isFullMarkup: problem.isFullMarkup,
      isManuallyManaged: problem.isManuallyManaged,
      isOrganizationPrivate: problem.isOrganizationPrivate,
      date: problem.date,
      summary: problem.summary ?? null,
      ogImage: problem.ogImage ?? null,
      acRate: problem.acRate,
      userCount: problem.userCount,
      group: group ? { name: group.name, fullName: group.fullName } : null,
      types: hideTags ? null : await typesFor(ctx, problem),
      license: license
        ? {
            key: license.key,
            name: license.name,
            link: license.link,
            display: license.display,
            icon: license.icon,
          }
        : null,
      authors: hideAuthors ? [] : await profileSummaries(ctx, problem.authorProfileIds),
      curators: hideAuthors ? [] : await profileSummaries(ctx, problem.curatorProfileIds),
      testers: canEdit ? await profileSummaries(ctx, problem.testerProfileIds) : [],
      languageLimits,
      allowedLanguages,
      showLanguages: allowedLanguages.length !== totalLanguages,
      appearedIn,
      stats: {
        solvers: solvers.size,
        attempts,
        acRate: attempts ? (100 * accepted) / attempts : 0,
        bestTime,
        fastestSolver: fastest
          ? {
              username: fastest.username,
              displayRank: fastest.displayRank,
              rating: fastest.rating ?? null,
              time: bestTime,
              submissionId: fastestSubmissionId,
            }
          : null,
      },
      viewer: {
        state,
        bestPoints,
        hasSubmissions: viewerHasSubmissions,
        votePermission,
        canVote: voteCanVote(votePermission),
        canViewVotes: voteCanView(votePermission),
        vote: existingVote ? { points: existingVote.points, note: existingVote.note } : null,
      },
      contestProblem:
        contestProblem && viewer.contest
          ? {
              label: labelForProblem(viewer.contest, contestProblem.order),
              points: contestProblem.points,
              partial: contestProblem.partial,
              isPretested: contestProblem.isPretested,
              maxSubmissions: contestProblem.maxSubmissions ?? null,
              submissionsLeft,
            }
          : null,
      clarifications: clarificationRows.map((row) => ({
        id: row._id,
        description: row.description,
        date: row.date,
      })),
      canSubmit: !!viewer.profile && !bannedFromSubmitting,
      canEdit,
      canSeeEditorial,
      hasEditorial: !!solution,
      canManageSubmissions:
        viewer.profile !== null &&
        (viewer.profile.isStaff || viewer.profile.isSuperuser) &&
        coreHasPerm(viewer.core, "judge.rejudge_submission") &&
        canEdit,
      availableJudges,
      sourceVisibility: problem.submissionSourceVisibility,
      globalSourceVisibility: DEFAULT_SUBMISSION_SOURCE_VISIBILITY,
    };
  },
});

const statusFilter = v.union(
  v.literal("all"),
  v.literal("solved"),
  v.literal("attempted"),
  v.literal("unsolved"),
);

/* -------------------------------------------------------------------------- */
/* random                                                                     */
/* -------------------------------------------------------------------------- */

export const random = query({
  args: {
    group: v.optional(v.string()),
    types: v.optional(v.array(v.string())),
    pointStart: v.optional(v.number()),
    pointEnd: v.optional(v.number()),
    hasEditorial: v.optional(v.boolean()),
    status: v.optional(statusFilter),
    seed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await loadViewerContext(ctx);

    // DMOJ 404s /problems/random/ inside a contest.
    if (viewer.inContest) return null;

    const sets = await solveSetsFor(ctx, viewer);

    let candidates = (await ctx.db.query("problems").take(MAX_SCAN)).filter((row) =>
      problemIsVisibleTo(toCoreProblem(row), viewer.core),
    );

    if (args.group) {
      const groupName = args.group;

      const group = await ctx.db
        .query("problemGroups")
        .withIndex("by_name", (q) => q.eq("name", groupName))
        .first();

      candidates = group ? candidates.filter((row) => row.groupId === group._id) : [];
    }

    if (args.types && args.types.length > 0) {
      const wanted = new Set<string>();

      for (const name of args.types) {
        const row = await ctx.db
          .query("problemTypes")
          .withIndex("by_name", (q) => q.eq("name", name))
          .first();

        if (row) wanted.add(row._id);
      }

      candidates = candidates.filter((row) => row.typeIds.some((id) => wanted.has(id)));
    }

    if (args.pointStart !== undefined) {
      const start = args.pointStart;
      candidates = candidates.filter((row) => row.points >= start);
    }

    if (args.pointEnd !== undefined) {
      const end = args.pointEnd;
      candidates = candidates.filter((row) => row.points <= end);
    }

    if (args.hasEditorial) {
      const now = Date.now();
      const keep: Doc<"problems">[] = [];

      for (const row of candidates) {
        const solution = await solutionFor(ctx, row._id);

        if (solution?.isPublic && solution.publishOn <= now) keep.push(row);
      }

      candidates = keep;
    }

    const status = args.status ?? "all";

    if (status !== "all" && viewer.profile) {
      candidates = candidates.filter((row) => {
        const solved = sets.solved.has(row._id);
        const attempted = sets.attempted.has(row._id);

        if (status === "solved") return solved;

        if (status === "attempted") return attempted && !solved;

        return !solved;
      });
    }

    if (candidates.length === 0) return null;
    // The seed keeps the query deterministic, which a reactive query has to be.
    const seed = args.seed ?? Math.floor(Date.now() / 1000);
    const index = Math.abs(Math.floor(seed)) % candidates.length;
    const picked = candidates[index];

    return picked ? { code: picked.code } : null;
  },
});

/* -------------------------------------------------------------------------- */
/* editorial                                                                  */
/* -------------------------------------------------------------------------- */

export const editorial = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const problem = await problemByCode(ctx, code);

    if (!problem) return null;

    const viewer = await loadViewerContext(ctx);

    if (!(await canAccessProblem(ctx, problem, viewer))) return null;

    // ProblemSolution 404s while the viewer is in a contest.
    if (viewer.inContest) return null;

    const solution = await solutionFor(ctx, problem._id);

    if (!solution) return null;

    const accessible = solutionIsAccessibleBy(
      {
        problemId: solution.problemId,
        isPublic: solution.isPublic,
        publishOn: solution.publishOn,
      },
      toCoreProblem(problem),
      viewer.core,
    );

    if (!accessible) return null;

    const sets = await solveSetsFor(ctx, viewer);

    return {
      problemCode: problem.code,
      problemName: problem.name,
      content: solution.content,
      preset: "solution",
      isPublic: solution.isPublic,
      publishOn: solution.publishOn,
      authors: await profileSummaries(ctx, solution.authorProfileIds),
      hasSolvedProblem: sets.solved.has(problem._id),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* ranks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `RankedSubmissions` (judge/views/ranked_submission.py): the best submission
 * per listed user, where "best" is the highest score and, among those, the
 * fastest. Ordered by score descending then time ascending.
 */
export const ranks = query({
  args: {
    code: v.string(),
    contestKey: v.optional(v.string()),
    languages: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const problem = await problemByCode(ctx, args.code);

    if (!problem) return null;

    const viewer = await loadViewerContext(ctx);

    if (!(await canAccessProblem(ctx, problem, viewer))) return null;

    let contest: Doc<"contests"> | null = null;

    if (args.contestKey) {
      const key = args.contestKey;
      contest = await ctx.db
        .query("contests")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();

      if (!contest) return null;
    }

    const wantedLanguageIds = new Set<string>();

    for (const key of args.languages ?? []) {
      const lang = await ctx.db
        .query("languages")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();

      if (lang) wantedLanguageIds.add(lang._id);
    }

    const submissions = await ctx.db
      .query("submissions")
      .withIndex("by_problem_date", (q) => q.eq("problemId", problem._id))
      .take(MAX_SCAN);

    const scoreOf = (row: Doc<"submissions">) => (contest ? (row.contestPoints ?? 0) : (row.points ?? 0));

    const best = new Map<string, Doc<"submissions">>();

    for (const submission of submissions) {
      if (submission.isArchived) continue;

      if (contest && submission.contestId !== contest._id) continue;

      if (wantedLanguageIds.size > 0 && !wantedLanguageIds.has(submission.languageId)) continue;

      if (scoreOf(submission) <= 0) continue;

      const author = await ctx.db.get(submission.profileId);

      if (!author || author.isUnlisted) continue;

      const key = submission.profileId;
      const current = best.get(key);
      const currentScore = current ? scoreOf(current) : Number.NEGATIVE_INFINITY;
      const score = scoreOf(submission);

      if (
        score > currentScore ||
        (score === currentScore &&
          (submission.time ?? Number.POSITIVE_INFINITY) < (current?.time ?? Number.POSITIVE_INFINITY))
      ) {
        best.set(key, submission);
      }
    }

    // Per-language breakdown over every counted submission, not just the best.
    const perLanguage = new Map<string, { total: number; accepted: number; bestTime: number | null }>();

    for (const submission of submissions) {
      if (submission.isArchived) continue;

      if (contest && submission.contestId !== contest._id) continue;
      const lang = await ctx.db.get(submission.languageId);

      if (!lang) continue;
      const entry = perLanguage.get(lang.key) ?? { total: 0, accepted: 0, bestTime: null };
      entry.total += 1;

      if (submission.result === "AC" && submission.casePoints >= submission.caseTotal) {
        entry.accepted += 1;

        if (submission.time !== undefined && (entry.bestTime === null || submission.time < entry.bestTime)) {
          entry.bestTime = submission.time;
        }
      }

      perLanguage.set(lang.key, entry);
    }

    const rows = [];

    for (const submission of best.values()) {
      const author = await ctx.db.get(submission.profileId);
      const lang = await ctx.db.get(submission.languageId);

      if (!author || !lang) continue;
      rows.push({
        submissionId: submission._id,
        username: author.username,
        displayRank: author.displayRank,
        rating: author.rating ?? null,
        points: scoreOf(submission),
        time: submission.time ?? null,
        memory: submission.memory ?? null,
        result: submission.result ?? null,
        date: submission.date,
        language: { key: lang.key, name: lang.name, shortName: lang.shortName },
      });
    }

    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;

      return (a.time ?? Number.POSITIVE_INFINITY) - (b.time ?? Number.POSITIVE_INFINITY);
    });

    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 100), 1000));

    return {
      problemCode: problem.code,
      problemName: problem.name,
      contestKey: contest?.key ?? null,
      rows: rows.slice(0, limit),
      total: rows.length,
      byLanguage: [...perLanguage.entries()]
        .map(([key, value]) => ({
          languageKey: key,
          total: value.total,
          accepted: value.accepted,
          acRate: value.total ? (100 * value.accepted) / value.total : 0,
          bestTime: value.bestTime,
        }))
        .sort((a, b) => b.total - a.total),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* hotProblems, recent, languageTemplate, clarifications                      */
/* -------------------------------------------------------------------------- */

/**
 * `judge/utils/problems.py:hot_problems`, verbatim: public problems with a
 * submission in the window and 3 < points < 25, kept when their distinct
 * submitter count clears max(mx / 3, 1), ordered by
 *   0.5 * points * (0.4 * ac_volume / submission_volume + 0.6 * ac_rate)
 *   + 100 * e ** (unique_user_count / mx)
 */
export const hotProblems = query({
  args: { limit: v.optional(v.number()), windowMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? HOT_PROBLEM_COUNT), 50));
    const since = Date.now() - (args.windowMs ?? HOT_PROBLEM_WINDOW_MS);

    const problems = (await ctx.db.query("problems").take(MAX_SCAN)).filter(
      (row) => row.isPublic && !row.isOrganizationPrivate && row.points > 3 && row.points < 25,
    );

    // DMOJ's "fix braindamage in excluding CE": only these results count.
    const volumeResults = new Set(["AC", "WA", "IR", "RTE", "TLE", "OLE"]);
    const stats = new Map<string, { users: Set<string>; volume: number; acVolume: number }>();

    for (const problem of problems) {
      const submissions = await ctx.db
        .query("submissions")
        .withIndex("by_problem_date", (q) => q.eq("problemId", problem._id).gt("date", since))
        .take(MAX_SCAN);

      if (submissions.length === 0) continue;
      const entry = { users: new Set<string>(), volume: 0, acVolume: 0 };

      for (const submission of submissions) {
        entry.users.add(submission.profileId);

        if (submission.result && volumeResults.has(submission.result)) entry.volume += 1;

        if (submission.result === "AC") entry.acVolume += 1;
      }

      stats.set(problem._id, entry);
    }

    const counted = [...stats.values()].map((entry) => entry.users.size);

    if (counted.length === 0) return [];
    const mx = Math.max(...counted);

    if (mx === 0) return [];
    const threshold = Math.max(mx / 3, 1);

    const scored = [];

    for (const problem of problems) {
      const entry = stats.get(problem._id);

      if (!entry) continue;
      const unique = entry.users.size;

      if (unique <= threshold) continue;
      const ratio = entry.volume > 0 ? entry.acVolume / entry.volume : 0;

      const ordering =
        0.5 * problem.points * (0.4 * ratio + 0.6 * problem.acRate) + 100 * Math.E ** (unique / mx);

      scored.push({
        id: problem._id,
        code: problem.code,
        name: problem.name,
        points: problem.points,
        acRate: problem.acRate,
        userCount: problem.userCount,
        uniqueUserCount: unique,
        ordering,
      });
    }

    scored.sort((a, b) => b.ordering - a.ordering);

    return scored.slice(0, limit);
  },
});

export type RecentProblem = {
  _id: Id<"problems">;
  code: string;
  name: string;
  points: number;
  date: number;
};

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<RecentProblem[]> => {
    const take = Math.max(1, Math.min(limit ?? 7, 25));

    const rows = await ctx.db
      .query("problems")
      .withIndex("by_public_date", (q) => q.eq("isPublic", true))
      .order("desc")
      .take(take * 2);

    return rows
      .filter((row) => !row.isOrganizationPrivate)
      .slice(0, take)
      .map((row) => ({
        _id: row._id,
        code: row.code,
        name: row.name,
        points: row.points,
        date: row.date,
      }));
  },
});

/** DMOJ's `LanguageTemplateAjax`, keyed by language key rather than row id. */
export const languageTemplate = query({
  args: { languageKey: v.string() },
  handler: async (ctx, { languageKey }) => {
    const language = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", languageKey))
      .first();

    if (!language) return null;

    return {
      key: language.key,
      name: language.name,
      template: language.template,
      editorMode: language.editorMode,
      shikiLang: language.shikiLang,
      extension: language.extension,
    };
  },
});

export const clarifications = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const problem = await problemByCode(ctx, code);

    if (!problem) return null;
    const viewer = await loadViewerContext(ctx);

    if (!(await canAccessProblem(ctx, problem, viewer))) return null;

    const rows = await ctx.db
      .query("problemClarifications")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect();

    rows.sort((a, b) => b.date - a.date);

    return rows.map((row) => ({ id: row._id, description: row.description, date: row.date }));
  },
});
