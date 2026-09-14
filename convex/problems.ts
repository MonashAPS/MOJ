import {
  hasPerm as coreHasPerm,
  DEFAULT_SUBMISSION_SOURCE_VISIBILITY,
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
import { mutation, type QueryCtx, query } from "./_generated/server";
import { optionalViewer, requireViewer } from "./lib/auth";
import { forbidden, invalid, notFound } from "./lib/errors";
import { proctorBlocksContestProblems } from "./lib/proctor";

export const MIN_USER_POINTS_VOTE = 1;
export const MAX_USER_POINTS_VOTE = 50;
export const HOT_PROBLEM_COUNT = 7;
export const HOT_PROBLEM_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_PAGE_SIZE = 50;

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
  const organizationIds = memberships.map((row) => row.organizationId as string);

  const organizations = await ctx.db.query("organizations").collect();
  const adminOfOrganizationIds = organizations
    .filter((row) => row.adminProfileIds.includes(profile._id))
    .map((row) => row._id as string);

  const classes = await ctx.db.query("classes").collect();
  const classIds = classes
    .filter((row) => row.memberProfileIds.includes(profile._id))
    .map((row) => row._id as string);
  const adminOfClassIds = classes
    .filter((row) => row.adminProfileIds.includes(profile._id))
    .map((row) => row._id as string);

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

export async function problemByCode(ctx: QueryCtx, code: string): Promise<Doc<"problems"> | null> {
  return await ctx.db
    .query("problems")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
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
      const key = submission.problemId as string;
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
    const key = submission.problemId as string;
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
      solved.add(submission.problemId as string);
    }
  }
  return solved;
}

function stateFor(
  problemId: string,
  points: number,
  sets: SolveSets,
): { state: ProblemState; bestPoints: number | null } {
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

async function profileByUsername(ctx: QueryCtx, username: string) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_username", (q) => q.eq("username", username))
    .unique();
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

async function translationFor(ctx: QueryCtx, problemId: Id<"problems">, language: string) {
  if (!language) return null;
  return await ctx.db
    .query("problemTranslations")
    .withIndex("by_problem_language", (q) => q.eq("problemId", problemId).eq("language", language))
    .unique();
}

/** `ContestFormat.get_label_for_problem`, for the labels the list shows. */
export function labelFor(contest: Doc<"contests">, index: number): string {
  if (contest.labelScheme === "numbers") return String(index + 1);
  if (contest.labelScheme === "custom") {
    const custom = contest.customLabels[index];
    if (custom) return custom;
  }
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/* -------------------------------------------------------------------------- */
/* list                                                                       */
/* -------------------------------------------------------------------------- */

const sortKey = v.union(
  v.literal("code"),
  v.literal("name"),
  v.literal("points"),
  v.literal("acRate"),
  v.literal("userCount"),
  v.literal("date"),
  v.literal("group"),
  v.literal("solved"),
  v.literal("type"),
  v.literal("editorial"),
);

const statusFilter = v.union(
  v.literal("all"),
  v.literal("solved"),
  v.literal("attempted"),
  v.literal("unsolved"),
);

/** DMOJ's `default_desc`, extended with the two sorts the staff panel adds. */
const DEFAULT_DESC = new Set(["points", "acRate", "userCount", "date", "solved"]);

type ListItem = {
  id: Id<"problems">;
  code: string;
  name: string;
  i18nName: string;
  group: { name: string; fullName: string } | null;
  types: { id: Id<"problemTypes">; name: string; fullName: string }[] | null;
  points: number;
  partial: boolean;
  acRate: number;
  userCount: number;
  date: number;
  hasPublicEditorial: boolean;
  state: ProblemState;
  bestPoints: number | null;
  contestLabel: string | null;
};

export const list = query({
  args: {
    search: v.optional(v.string()),
    fullText: v.optional(v.boolean()),
    status: v.optional(statusFilter),
    solvedBy: v.optional(v.array(v.string())),
    solvedByNotMe: v.optional(v.boolean()),
    types: v.optional(v.array(v.string())),
    group: v.optional(v.string()),
    pointStart: v.optional(v.number()),
    pointEnd: v.optional(v.number()),
    author: v.optional(v.string()),
    hasEditorial: v.optional(v.boolean()),
    contestKeys: v.optional(v.array(v.string())),
    groupByContest: v.optional(v.boolean()),
    showTypes: v.optional(v.boolean()),
    sort: v.optional(sortKey),
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await loadViewerContext(ctx);
    const sets = await solveSetsFor(ctx, viewer);
    const language = args.language ?? "";
    const page = Math.max(1, Math.floor(args.page ?? 1));
    const pageSize = Math.max(1, Math.min(Math.floor(args.pageSize ?? DEFAULT_PAGE_SIZE), 200));

    // DMOJ's contest mode: only the contest's own problems, with contest points
    // and no tags, ordered by ContestProblem.order (get_contest_queryset).
    if (viewer.inContest && viewer.contest) {
      const contest = viewer.contest;
      const links = await ctx.db
        .query("contestProblems")
        .withIndex("by_contest_order", (q) => q.eq("contestId", contest._id))
        .collect();
      links.sort((a, b) => a.order - b.order);

      const items: ListItem[] = [];
      for (const [index, link] of links.entries()) {
        const problem = await ctx.db.get(link.problemId);
        if (!problem) continue;
        const translation = await translationFor(ctx, problem._id, language);
        const group = await ctx.db.get(problem.groupId);
        const problemSubmissions = await ctx.db
          .query("submissions")
          .withIndex("by_problem_date", (q) => q.eq("problemId", problem._id))
          .take(MAX_SCAN);
        const distinct = new Set(
          problemSubmissions
            .filter((row) => row.contestId === contest._id && row.participationId)
            .map((row) => row.participationId as string),
        );
        const { state, bestPoints } = stateFor(problem._id, link.points, sets);
        items.push({
          id: problem._id,
          code: problem.code,
          name: problem.name,
          i18nName: translation?.name ?? problem.name,
          group: group ? { name: group.name, fullName: group.fullName } : null,
          types: null,
          points: link.points,
          partial: link.partial,
          acRate: problem.acRate,
          userCount: distinct.size,
          date: problem.date,
          hasPublicEditorial: false,
          state,
          bestPoints,
          contestLabel: labelFor(contest, index),
        });
      }

      return {
        inContest: true,
        contest: {
          key: contest.key,
          name: contest.name,
          hideProblemTags: contest.hideProblemTags,
          hideProblemAuthors: contest.hideProblemAuthors,
          hideScoreboard: ["C", "P", "H"].includes(contest.scoreboardVisibility),
        },
        items,
        groups: null,
        total: items.length,
        page: 1,
        pageSize: items.length,
        totalPages: 1,
        hasMore: false,
        pointValues: { min: 0, max: 0, values: [] as number[] },
      };
    }

    // --- Candidate set ----------------------------------------------------
    const search = (args.search ?? "").trim();
    let candidates: Doc<"problems">[];

    if (search && args.fullText !== false) {
      // The search index answers the name and statement sides; a code match is
      // DMOJ's `code__icontains`, which no search index can express.
      const byName = await ctx.db
        .query("problems")
        .withSearchIndex("search_name_desc", (q) => q.search("name", search))
        .take(500);
      const byDescription = await ctx.db
        .query("problems")
        .withSearchIndex("search_description", (q) => q.search("description", search))
        .take(500);
      const seen = new Map<string, Doc<"problems">>();
      for (const row of [...byName, ...byDescription]) seen.set(row._id, row);

      const lowered = search.toLowerCase();
      for (const row of await ctx.db.query("problems").take(MAX_SCAN)) {
        if (row.code.includes(lowered)) seen.set(row._id, row);
      }
      candidates = [...seen.values()];
    } else {
      candidates = await ctx.db.query("problems").take(MAX_SCAN);
      if (search) {
        const lowered = search.toLowerCase();
        candidates = candidates.filter(
          (row) => row.code.includes(lowered) || row.name.toLowerCase().includes(lowered),
        );
      }
    }

    // --- Visibility -------------------------------------------------------
    candidates = candidates.filter((row) => problemIsVisibleTo(toCoreProblem(row), viewer.core));

    // --- Filters ----------------------------------------------------------
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

    if (args.author) {
      const profile = await profileByUsername(ctx, args.author);
      candidates = profile
        ? candidates.filter(
            (row) =>
              row.authorProfileIds.includes(profile._id) || row.curatorProfileIds.includes(profile._id),
          )
        : [];
    }

    // `has_public_editorial`, annotated by DMOJ onto the queryset.
    const now = Date.now();
    const editorialByProblem = new Map<string, boolean>();
    for (const row of candidates) {
      const solution = await solutionFor(ctx, row._id);
      editorialByProblem.set(row._id, !!solution && solution.isPublic && solution.publishOn <= now);
    }
    if (args.hasEditorial) {
      candidates = candidates.filter((row) => editorialByProblem.get(row._id) === true);
    }

    // Status, relative to the viewer.
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

    // "Solved by <user>", with the "and not by me" modifier the fork added.
    if (args.solvedBy && args.solvedBy.length > 0) {
      for (const username of args.solvedBy) {
        const profile = await profileByUsername(ctx, username);
        if (!profile) {
          candidates = [];
          break;
        }
        const theirs = await solvedIdsForProfile(ctx, profile._id);
        candidates = candidates.filter((row) => theirs.has(row._id));
      }
      if (args.solvedByNotMe && viewer.profile) {
        candidates = candidates.filter((row) => !sets.solved.has(row._id));
      }
    }

    // The point slider is built before the point filter, as DMOJ does.
    const prepoint = candidates;
    if (args.pointStart !== undefined) {
      const start = args.pointStart;
      candidates = candidates.filter((row) => row.points >= start);
    }
    if (args.pointEnd !== undefined) {
      const end = args.pointEnd;
      candidates = candidates.filter((row) => row.points <= end);
    }

    // Contest filter: keep only problems used by the named contests.
    const contestsById = new Map<string, Doc<"contests">>();
    const labelsByProblem = new Map<string, { contest: Doc<"contests">; label: string }[]>();
    if (args.contestKeys && args.contestKeys.length > 0) {
      const allowed = new Set<string>();
      for (const key of args.contestKeys) {
        const contest = await ctx.db
          .query("contests")
          .withIndex("by_key", (q) => q.eq("key", key))
          .unique();
        if (!contest) continue;
        contestsById.set(contest._id, contest);
        const links = await ctx.db
          .query("contestProblems")
          .withIndex("by_contest_order", (q) => q.eq("contestId", contest._id))
          .collect();
        links.sort((a, b) => a.order - b.order);
        for (const [index, link] of links.entries()) {
          allowed.add(link.problemId);
          const bucket = labelsByProblem.get(link.problemId) ?? [];
          bucket.push({ contest, label: labelFor(contest, index) });
          labelsByProblem.set(link.problemId, bucket);
        }
      }
      candidates = candidates.filter((row) => allowed.has(row._id));
    }

    // --- Sort --------------------------------------------------------------
    const sort = args.sort ?? "code";
    const descending = args.order ? args.order === "desc" : DEFAULT_DESC.has(sort);

    const names = new Map<string, string>();
    const groups = new Map<string, Doc<"problemGroups"> | null>();
    const typeNames = new Map<string, string[]>();
    for (const row of candidates) {
      const translation = await translationFor(ctx, row._id, language);
      names.set(row._id, translation?.name ?? row.name);
      groups.set(row._id, await ctx.db.get(row.groupId));
      if (args.showTypes) {
        typeNames.set(
          row._id,
          (await typesFor(ctx, row)).map((type) => type.fullName),
        );
      }
    }

    const compare = (a: Doc<"problems">, b: Doc<"problems">): number => {
      switch (sort) {
        case "name":
          return (names.get(a._id) ?? "").localeCompare(names.get(b._id) ?? "");
        case "points":
          return a.points - b.points;
        case "acRate":
          return a.acRate - b.acRate;
        case "userCount":
          return a.userCount - b.userCount;
        case "date":
          return a.date - b.date;
        case "group":
          return (groups.get(a._id)?.name ?? "").localeCompare(groups.get(b._id)?.name ?? "");
        case "editorial":
          return Number(editorialByProblem.get(a._id)) - Number(editorialByProblem.get(b._id));
        case "type":
          return (typeNames.get(a._id)?.[0] ?? "").localeCompare(typeNames.get(b._id)?.[0] ?? "");
        case "solved": {
          const rank = (row: Doc<"problems">) =>
            sets.solved.has(row._id) ? 1 : sets.attempted.has(row._id) ? 0 : -1;
          return rank(a) - rank(b);
        }
        default:
          return a.code.localeCompare(b.code);
      }
    };

    candidates.sort((a, b) => {
      const primary = compare(a, b);
      if (primary !== 0) return descending ? -primary : primary;
      // DMOJ breaks every tie on the primary key.
      return a._creationTime - b._creationTime;
    });

    const total = candidates.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const pageRows = candidates.slice(start, start + pageSize);

    const items: ListItem[] = [];
    for (const row of pageRows) {
      const group = groups.get(row._id) ?? null;
      const { state, bestPoints } = stateFor(row._id, row.points, sets);
      items.push({
        id: row._id,
        code: row.code,
        name: row.name,
        i18nName: names.get(row._id) ?? row.name,
        group: group ? { name: group.name, fullName: group.fullName } : null,
        types: args.showTypes ? await typesFor(ctx, row) : null,
        points: row.points,
        partial: row.partial,
        acRate: row.acRate,
        userCount: row.userCount,
        date: row.date,
        hasPublicEditorial: editorialByProblem.get(row._id) === true,
        state,
        bestPoints,
        contestLabel: labelsByProblem.get(row._id)?.[0]?.label ?? null,
      });
    }

    // Group-by-contest output for the contest filter and the view toggle.
    let grouped: { contestKey: string; contestName: string; startTime: number; items: ListItem[] }[] | null =
      null;
    if ((args.groupByContest ?? false) || (args.contestKeys?.length ?? 0) > 0) {
      const buckets = new Map<string, ListItem[]>();
      for (const item of items) {
        for (const { contest, label } of labelsByProblem.get(item.id) ?? []) {
          contestsById.set(contest._id, contest);
          const bucket = buckets.get(contest._id) ?? [];
          bucket.push({ ...item, contestLabel: label });
          buckets.set(contest._id, bucket);
        }
      }
      grouped = [...buckets.entries()]
        .map(([contestId, rows]) => {
          const contest = contestsById.get(contestId) as Doc<"contests">;
          return {
            contestKey: contest.key,
            contestName: contest.name,
            startTime: contest.startTime,
            items: rows,
          };
        })
        .sort((a, b) => b.startTime - a.startTime);
    }

    const pointValues = [...new Set(prepoint.map((row) => row.points))].sort((a, b) => a - b);

    return {
      inContest: false,
      contest: null,
      items,
      groups: grouped,
      total,
      page,
      pageSize,
      totalPages,
      hasMore: start + pageRows.length < total,
      pointValues: {
        min: pointValues[0] ?? 0,
        max: pointValues[pointValues.length - 1] ?? 0,
        values: pointValues,
      },
    };
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
      language: translation ? (language as string) : "en",
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
      if (!contest?.isVisible) continue;
      const siblings = await ctx.db
        .query("contestProblems")
        .withIndex("by_contest_order", (q) => q.eq("contestId", contest._id))
        .collect();
      siblings.sort((a, b) => a.order - b.order);
      const index = siblings.findIndex((row) => row._id === link._id);
      appearedIn.push({
        contestKey: contest.key,
        contestName: contest.name,
        label: labelFor(contest, index < 0 ? link.order : index),
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

    const onlineJudges = await ctx.db
      .query("judges")
      .withIndex("by_online_tier", (q) => q.eq("online", true))
      .collect();
    const availableJudges = onlineJudges.filter((judge) => judge.problemCodes.includes(problem.code)).length;

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
              label: labelFor(viewer.contest, contestProblem.order),
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
    return { code: (candidates[index] as Doc<"problems">).code };
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

      const key = submission.profileId as string;
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
/* Points voting                                                              */
/* -------------------------------------------------------------------------- */

async function voteContext(ctx: QueryCtx, code: string) {
  const problem = await problemByCode(ctx, code);
  if (!problem) throw notFound("Problem");
  const viewer = await loadViewerContext(ctx);
  if (!(await canAccessProblem(ctx, problem, viewer))) throw notFound("Problem");
  const sets = await solveSetsFor(ctx, viewer);
  const permission = votePermissionForUser(toCoreProblem(problem), viewer.core, {
    hasSolvedProblem: sets.solved.has(problem._id),
  });
  return { problem, viewer, permission };
}

export const vote = mutation({
  args: { code: v.string(), points: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, { code, points, note }) => {
    const profile = await requireViewer(ctx);
    const { problem, permission } = await voteContext(ctx, code);
    if (!voteCanVote(permission)) {
      throw forbidden("Not allowed to vote on this problem.");
    }
    if (!Number.isInteger(points)) {
      throw invalid("Proposed points must be a whole number.");
    }
    if (points < MIN_USER_POINTS_VOTE || points > MAX_USER_POINTS_VOTE) {
      throw invalid(`Proposed points must be between ${MIN_USER_POINTS_VOTE} and ${MAX_USER_POINTS_VOTE}.`);
    }
    const body = note ?? "";
    if (body.length > 8192) throw invalid("The note is too long.");

    // DMOJ deletes any pre-existing vote inside the transaction, then inserts.
    const existing = await ctx.db
      .query("problemPointsVotes")
      .withIndex("by_voter_problem", (q) => q.eq("voterProfileId", profile._id).eq("problemId", problem._id))
      .unique();
    if (existing) await ctx.db.delete(existing._id);

    await ctx.db.insert("problemPointsVotes", {
      points,
      voterProfileId: profile._id,
      problemId: problem._id,
      voteTime: Date.now(),
      note: body,
    });
    return { points };
  },
});

export const deleteVote = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const profile = await requireViewer(ctx);
    const { problem, permission } = await voteContext(ctx, code);
    if (!voteCanVote(permission)) {
      throw forbidden("Not allowed to delete votes on this problem.");
    }
    const existing = await ctx.db
      .query("problemPointsVotes")
      .withIndex("by_voter_problem", (q) => q.eq("voterProfileId", profile._id).eq("problemId", problem._id))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

export const voteStats = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const problem = await problemByCode(ctx, code);
    if (!problem) return null;
    const viewer = await loadViewerContext(ctx);
    if (!(await canAccessProblem(ctx, problem, viewer))) return null;

    const sets = await solveSetsFor(ctx, viewer);
    const permission = votePermissionForUser(toCoreProblem(problem), viewer.core, {
      hasSolvedProblem: sets.solved.has(problem._id),
    });
    if (!voteCanView(permission)) return null;

    const rows = await ctx.db
      .query("problemPointsVotes")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect();
    const votes = rows.map((row) => row.points).sort((a, b) => a - b);

    let meanValue: number | null = null;
    let medianValue: number | null = null;
    if (votes.length > 0) {
      meanValue = votes.reduce((sum, value) => sum + value, 0) / votes.length;
      const mid = Math.floor(votes.length / 2);
      medianValue =
        votes.length % 2 === 1
          ? (votes[mid] as number)
          : ((votes[mid - 1] as number) + (votes[mid] as number)) / 2;
    }

    return {
      votes,
      mean: meanValue,
      median: medianValue,
      minPossibleVote: MIN_USER_POINTS_VOTE,
      maxPossibleVote: MAX_USER_POINTS_VOTE,
      currentPoints: problem.points,
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

/* -------------------------------------------------------------------------- */
/* PDF cache                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Everything `/problem/[code]/pdf` needs in one read: the statement to render,
 * the info-box values the Typst template prints, and whatever is already in the
 * `pdfCache` for this problem and language.
 *
 * The route hashes `statement + meta` itself and compares against
 * `cached.sourceHash`, so a statement edit invalidates the cache without the
 * query having to hash anything (which would make it non-deterministic to
 * re-run when the template changes).
 */
export const pdfSource = query({
  args: { code: v.string(), language: v.optional(v.string()) },
  handler: async (ctx, { code, language }) => {
    const problem = await problemByCode(ctx, code);
    if (!problem) return null;

    const viewer = await loadViewerContext(ctx);
    if (!(await canAccessProblem(ctx, problem, viewer))) return null;

    const lang = language ?? "en";
    const translation = await translationFor(ctx, problem._id, lang);

    const authors: string[] = [];
    for (const id of problem.authorProfileIds) {
      const row = await ctx.db.get(id);
      if (row) authors.push(row.username);
    }

    // The Typst template prints a python time limit when there is one.
    const limits = await ctx.db
      .query("languageLimits")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect();
    let pythonTimeLimit: number | null = null;
    for (const limit of limits) {
      const lang3 = await ctx.db.get(limit.languageId);
      if (lang3 && (lang3.key === "PY3" || lang3.key.toLowerCase().startsWith("py"))) {
        pythonTimeLimit = limit.timeLimit;
        break;
      }
    }

    const cached = await ctx.db
      .query("pdfCache")
      .withIndex("by_problem_language", (q) => q.eq("problemCode", problem.code).eq("language", lang))
      .unique();

    return {
      code: problem.code,
      language: lang,
      statement: translation?.description ?? problem.description,
      meta: {
        name: translation?.name ?? problem.name,
        code: problem.code,
        points: problem.points,
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
        pythonTimeLimit,
        authors,
        inputType: "standard input",
        outputType: "standard output",
      },
      cached: cached
        ? {
            sourceHash: cached.sourceHash,
            url: await ctx.storage.getUrl(cached.storageId),
            renderedAt: cached.renderedAt,
          }
        : null,
    };
  },
});

/** An upload slot for a freshly rendered PDF; access-checked like the read. */
export const pdfUploadUrl = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const problem = await problemByCode(ctx, code);
    if (!problem) throw notFound("Problem");
    const viewer = await loadViewerContext(ctx);
    if (!(await canAccessProblem(ctx, problem, viewer))) throw notFound("Problem");
    return await ctx.storage.generateUploadUrl();
  },
});

export const savePdf = mutation({
  args: {
    code: v.string(),
    language: v.string(),
    sourceHash: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const problem = await problemByCode(ctx, args.code);
    if (!problem) throw notFound("Problem");
    const viewer = await loadViewerContext(ctx);
    if (!(await canAccessProblem(ctx, problem, viewer))) throw notFound("Problem");

    const existing = await ctx.db
      .query("pdfCache")
      .withIndex("by_problem_language", (q) =>
        q.eq("problemCode", problem.code).eq("language", args.language),
      )
      .unique();

    if (existing) {
      if (existing.storageId !== args.storageId) await ctx.storage.delete(existing.storageId);
      await ctx.db.patch(existing._id, {
        storageId: args.storageId,
        sourceHash: args.sourceHash,
        renderedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("pdfCache", {
        problemCode: problem.code,
        language: args.language,
        storageId: args.storageId,
        sourceHash: args.sourceHash,
        renderedAt: Date.now(),
      });
    }

    await ctx.db.insert("uploads", {
      storageId: args.storageId,
      uploaderProfileId: viewer.profile?._id,
      kind: "pdf",
      name: `${problem.code}.${args.language}.pdf`,
      createdAt: Date.now(),
      cacheKey: `pdf:${problem.code}:${args.language}:${args.sourceHash}`,
    });

    return { ok: true };
  },
});
