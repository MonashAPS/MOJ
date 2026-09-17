/**
 * Contests: the home page side box, the contest bar, the list, the calendar,
 * the contest page and its statistics.
 *
 * Ported from judge/views/contests.py and judge/models/contest.py. Every rule
 * lives in `@moj/core`; this module is the Convex plumbing around it. The
 * mutations and the reads that hang off a contest live beside it:
 * `contests/participation.ts`, `contests/clarifications.ts`,
 * `contests/rankings.ts` and `contests/tools.ts`.
 */

import {
  type ContestAccess,
  contestAccessCheck,
  contestCanSeeFullScoreboard,
  contestCanSeeOwnScoreboard,
  contestEnded,
  contestHasCompletedContest,
  contestIsEditableBy,
  contestIsLiveJoinableBy,
  contestIsSpectatableBy,
  contestIsVisibleTo,
  contestJoinDecision,
  contestShowScoreboard,
  contestStarted,
  freezeTime,
  hasPerm,
  isFullSolve,
  PARTICIPATION_LIVE,
  PARTICIPATION_SPECTATE,
  participationEndTime,
  participationHasEnded,
  participationTimeRemaining,
  type ScoringLine,
} from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, query } from "./_generated/server";
import {
  contestByKey,
  formatFor,
  labelForProblem,
  loadContestProblems,
  toContestRow,
  toParticipationRow,
  toViewerRowInContest,
} from "./contests/formats";
import { optionalViewer } from "./lib/auth";
import { canAccessProblem, loadViewerContext, statementHasSamples } from "./problems";

/** One person's submission history, capped so a prolific account cannot
 *  turn the contest list into a full scan. */
const MAX_SUBMISSION_SCAN = 20_000;

/* -------------------------------------------------------------------------- */
/* Shared shapes                                                              */
/* -------------------------------------------------------------------------- */

export type ProblemState = "solved" | "partial" | "attempted" | "untouched";

export type ContestBarProblem = {
  contestProblemId: Id<"contestProblems">;
  problemId: Id<"problems">;
  code: string;
  name: string;
  label: string;
  points: number;
  state: ProblemState;
};

export type ContestBarData = {
  contest: {
    _id: Id<"contests">;
    key: string;
    name: string;
    startTime: number;
    endTime: number;
    useClarifications: boolean;
    freezeMinutes: number;
    /** The site turns into this contest while the viewer is competing in it. */
    /** The site turns into this contest while the viewer is competing in it.
     *  On unless the contest opted out. */
    isLockedDown: boolean;
  };
  problems: ContestBarProblem[];
  participationId: Id<"contestParticipations"> | null;
  endsAt: number | null;
  isSpectating: boolean;
  isVirtual: boolean;
  /** Links the bar renders; each is false when the page would not be there. */
  links: { standings: boolean; submissions: boolean; clarifications: boolean };
  now: number;
  timeRemaining: number | null;
} | null;

export type HomeSidebarContest = {
  _id: Id<"contests">;
  key: string;
  name: string;
  startTime: number;
  endTime: number;
  userCount: number;
  state: "ongoing" | "upcoming";
};

export type UserRef = {
  _id: Id<"profiles">;
  username: string;
  displayName: string;
  rating: number | null;
  displayRank: string;
};

export type TagRef = { _id: Id<"contestTags">; name: string; color: string; description: string };

export type OrganizationRef = {
  _id: Id<"organizations">;
  name: string;
  slug: string;
  shortName: string;
};

export type ContestListRow = {
  _id: Id<"contests">;
  key: string;
  name: string;
  startTime: number;
  endTime: number;
  timeLimit: number | null;
  userCount: number;
  isRated: boolean;
  isPrivate: boolean;
  isOrganizationPrivate: boolean;
  isVisible: boolean;
  formatName: string;
  tags: TagRef[];
  organizations: OrganizationRef[];
  authors: UserRef[];
  isEditorOrTester: boolean;
  hasCompleted: boolean;
  proctorRequired: boolean;
  /** The viewer's way through this contest, or null when signed out. */
  progress: ContestProgress | null;
};

/**
 * How far the viewer has got through a contest.
 *
 * The squares carry problem names in their tooltips, so they are shown on
 * exactly the terms the problems themselves are.
 */
export type ContestProgress = {
  solved: number;
  total: number;
  problems: { code: string; name: string; label: string; solved: boolean }[];
};

export type ActiveParticipation = {
  participationId: Id<"contestParticipations">;
  contest: ContestListRow;
  virtual: number;
  endsAt: number;
  timeRemaining: number | null;
};

export type ContestListPayload = {
  now: number;
  activeParticipations: ActiveParticipation[];
  current: ContestListRow[];
  future: ContestListRow[];
  /** Keys of running contests the viewer already finished (`finished_contests`). */
  finishedKeys: string[];
  past: { page: ContestListRow[]; isDone: boolean; continueCursor: string };
  totalPast: number;
};

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function displayNameOf(profile: Doc<"profiles">): string {
  return profile.usernameDisplayOverride || profile.username;
}

export function userRef(profile: Doc<"profiles">): UserRef {
  return {
    _id: profile._id,
    username: profile.username,
    displayName: displayNameOf(profile),
    rating: profile.rating ?? null,
    displayRank: profile.displayRank,
  };
}

async function userRefs(ctx: QueryCtx | MutationCtx, ids: readonly Id<"profiles">[]): Promise<UserRef[]> {
  const out: UserRef[] = [];

  for (const id of ids) {
    const profile = await ctx.db.get(id);

    if (profile) out.push(userRef(profile));
  }

  return out;
}

async function tagRefs(ctx: QueryCtx | MutationCtx, ids: readonly Id<"contestTags">[]): Promise<TagRef[]> {
  const out: TagRef[] = [];

  for (const id of ids) {
    const tag = await ctx.db.get(id);

    if (tag) {
      out.push({ _id: tag._id, name: tag.name, color: tag.color, description: tag.description });
    }
  }

  return out;
}

async function organizationRefs(
  ctx: QueryCtx | MutationCtx,
  ids: readonly Id<"organizations">[],
): Promise<OrganizationRef[]> {
  const out: OrganizationRef[] = [];

  for (const id of ids) {
    const organization = await ctx.db.get(id);

    if (organization) {
      out.push({
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        shortName: organization.shortName,
      });
    }
  }

  return out;
}

/** `ContestParticipation.end_time` for a Convex pair. */
export function endTimeOf(contest: Doc<"contests">, participation: Doc<"contestParticipations">): number {
  return participationEndTime(toParticipationRow(participation), toContestRow(contest));
}

export async function liveParticipationOf(
  ctx: QueryCtx | MutationCtx,
  contestId: Id<"contests">,
  profileId: Id<"profiles">,
): Promise<Doc<"contestParticipations"> | null> {
  const rows = await ctx.db
    .query("contestParticipations")
    .withIndex("by_profile_contest", (q) => q.eq("profileId", profileId).eq("contestId", contestId))
    .collect();

  return rows.find((row) => row.virtual === PARTICIPATION_LIVE) ?? null;
}

export async function participationsOf(
  ctx: QueryCtx | MutationCtx,
  contestId: Id<"contests">,
  profileId: Id<"profiles">,
): Promise<Doc<"contestParticipations">[]> {
  return await ctx.db
    .query("contestParticipations")
    .withIndex("by_profile_contest", (q) => q.eq("profileId", profileId).eq("contestId", contestId))
    .collect();
}

/**
 * SPEC section 20, "Contest problem states": the viewer's standing on one
 * contest problem, counting submissions made inside and outside the contest.
 */
export type ProblemStateResult = {
  state: ProblemState;
  bestScore: number;
  contestBestScore: number;
  solvedDuringContest: boolean;
  solvedSinceContest: boolean;
  attemptCount: number;
  contestAttemptCount: number;
};

const UNTOUCHED: ProblemStateResult = {
  state: "untouched",
  bestScore: 0,
  contestBestScore: 0,
  solvedDuringContest: false,
  solvedSinceContest: false,
  attemptCount: 0,
  contestAttemptCount: 0,
};

export async function problemStateFor(
  ctx: QueryCtx | MutationCtx,
  profileId: Id<"profiles"> | null,
  problem: Doc<"problems">,
  contestId: Id<"contests"> | null,
): Promise<ProblemStateResult> {
  if (!profileId) return UNTOUCHED;

  const submissions = await ctx.db
    .query("submissions")
    .withIndex("by_profile_problem", (q) => q.eq("profileId", profileId).eq("problemId", problem._id))
    .collect();

  if (submissions.length === 0) return UNTOUCHED;

  let bestScore = 0;
  let contestBestScore = 0;
  let solved = false;
  let solvedDuringContest = false;
  let contestAttemptCount = 0;

  for (const submission of submissions) {
    const points = submission.points ?? 0;

    if (points > bestScore) bestScore = points;
    const full = isFullSolve(submission) || (problem.points > 0 && points >= problem.points);

    if (full) solved = true;

    if (contestId && submission.contestId === contestId) {
      contestAttemptCount += 1;
      const contestPoints = submission.contestPoints ?? 0;

      if (contestPoints > contestBestScore) contestBestScore = contestPoints;

      if (full) solvedDuringContest = true;
    }
  }

  const state: ProblemState = solved ? "solved" : bestScore > 0 ? "partial" : "attempted";

  return {
    state,
    bestScore,
    contestBestScore,
    solvedDuringContest,
    solvedSinceContest: solved && !solvedDuringContest,
    attemptCount: submissions.length,
    contestAttemptCount,
  };
}

/* -------------------------------------------------------------------------- */
/* Home page side box                                                         */
/* -------------------------------------------------------------------------- */

/** Home page side box: contests running now and the next few coming up. */
export const homeSidebar = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<HomeSidebarContest[]> => {
    const take = Math.max(1, Math.min(limit ?? 5, 20));
    const now = Date.now();

    const rows = await ctx.db
      .query("contests")
      .withIndex("by_visible_start", (q) => q.eq("isVisible", true))
      .collect();

    const ongoing = rows
      .filter(
        (row) => !row.isPrivate && !row.isOrganizationPrivate && row.startTime <= now && row.endTime > now,
      )
      .sort((a, b) => a.endTime - b.endTime);

    const upcoming = rows
      .filter((row) => !row.isPrivate && !row.isOrganizationPrivate && row.startTime > now)
      .sort((a, b) => a.startTime - b.startTime);

    return [
      ...ongoing.map((row) => sidebarContest(row, "ongoing")),
      ...upcoming.map((row) => sidebarContest(row, "upcoming")),
    ].slice(0, take);
  },
});

function sidebarContest(row: Doc<"contests">, state: "ongoing" | "upcoming"): HomeSidebarContest {
  return {
    _id: row._id,
    key: row.key,
    name: row.name,
    startTime: row.startTime,
    endTime: row.endTime,
    userCount: row.userCount,
    state,
  };
}

/* -------------------------------------------------------------------------- */
/* The contest bar (SPEC section 20)                                          */
/* -------------------------------------------------------------------------- */

export const navBar = query({
  args: { key: v.optional(v.string()) },
  handler: async (ctx, { key }): Promise<ContestBarData> => {
    const profile = await optionalViewer(ctx);
    const now = Date.now();

    let participation: Doc<"contestParticipations"> | null = null;
    let contest: Doc<"contests"> | null = null;

    // The bar says one thing: you are in this contest now. It used to fall back
    // to any participation row the viewer had ever had here, so leaving a contest
    // left the bar up and its clock running on a contest they were no longer in.
    if (key) {
      contest = await contestByKey(ctx, key);

      if (!contest || !profile?.currentParticipationId) return null;
      participation = await ctx.db.get(profile.currentParticipationId);

      if (!participation || participation.contestId !== contest._id) return null;
    } else if (profile?.currentParticipationId) {
      participation = await ctx.db.get(profile.currentParticipationId);

      if (participation) contest = await ctx.db.get(participation.contestId);
    }

    if (!contest) return null;

    const viewer = await toViewerRowInContest(ctx, profile);
    const contestRow = toContestRow(contest);

    const contestProblems = problemsReleasedFor(contest, profile, true, Date.now())
      ? await loadContestProblems(ctx, contest._id)
      : [];

    const problems: ContestBarProblem[] = [];

    for (const [index, contestProblem] of contestProblems.entries()) {
      const problem = await ctx.db.get(contestProblem.problemId);

      if (!problem) continue;
      const state = await problemStateFor(ctx, profile?._id ?? null, problem, contest._id);
      problems.push({
        contestProblemId: contestProblem._id,
        problemId: contestProblem.problemId,
        code: problem.code,
        name: problem.name,
        label: labelForProblem(contest, index),
        points: contestProblem.points,
        state: state.state,
      });
    }

    const liveParticipation = profile ? await liveParticipationOf(ctx, contest._id, profile._id) : null;

    const context = {
      now,
      liveParticipation: liveParticipation ? toParticipationRow(liveParticipation) : null,
    };

    const endsAt = participation ? endTimeOf(contest, participation) : contest.endTime;

    return {
      contest: {
        _id: contest._id,
        key: contest.key,
        name: contest.name,
        startTime: contest.startTime,
        endTime: contest.endTime,
        useClarifications: contest.useClarifications,
        freezeMinutes: contest.freezeMinutes,
        isLockedDown: contest.disableLockdown !== true,
      },
      problems,
      participationId: participation?._id ?? null,
      endsAt,
      isSpectating: participation?.virtual === PARTICIPATION_SPECTATE,
      isVirtual: (participation?.virtual ?? 0) > 0,
      links: {
        standings: contestCanSeeOwnScoreboard(contestRow, viewer, context),
        submissions: !!profile,
        clarifications: contest.useClarifications,
      },
      now,
      timeRemaining: endsAt >= now ? endsAt - now : null,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* The contest list                                                           */
/* -------------------------------------------------------------------------- */

const SORTS = ["name", "userCount", "startTime"] as const;

const SORT_KEYS = new Set<string>(SORTS);

type Sort = (typeof SORTS)[number];

function isSort(value: string | undefined): value is Sort {
  return value !== undefined && SORT_KEYS.has(value);
}

function compareContests(a: Doc<"contests">, b: Doc<"contests">, sort: Sort, descending: boolean): number {
  let result: number;

  if (sort === "name") result = a.name.localeCompare(b.name);
  else if (sort === "userCount") result = a.userCount - b.userCount;
  else result = a.startTime - b.startTime;

  if (result === 0) result = a.key.localeCompare(b.key);

  return descending ? -result : result;
}

/**
 * The viewer's progress through one contest.
 *
 * Solved means solved at all, not solved during the contest: the question
 * being answered on the contest list is "have I done these", and a problem
 * solved afterwards is still done.
 */
/**
 * Whether a contest's problems may be named yet.
 *
 * DMOJ's gate on the problem table (`contest/contest.html`): `contest.ended or
 * is_superuser or is_editor or is_tester or (is_spectator and
 * contest.started)`. Naming a problem before the contest is over hands it to
 * anybody who opens the page. Participants are added, who plainly need to read
 * what they are competing on.
 */
function problemsReleasedFor(
  contest: Doc<"contests">,
  profile: Doc<"profiles"> | null,
  taking: boolean,
  now: number,
): boolean {
  if (contest.endTime <= now) return true;

  if (!profile) return false;

  if (
    profile.isSuperuser ||
    contest.authorProfileIds.includes(profile._id) ||
    contest.curatorProfileIds.includes(profile._id) ||
    contest.testerProfileIds.includes(profile._id)
  ) {
    return true;
  }

  const started = contest.startTime <= now;

  return started && (taking || contest.spectatorProfileIds.includes(profile._id));
}

async function progressFor(
  ctx: QueryCtx,
  contest: Doc<"contests">,
  solved: Set<string> | null,
  released: boolean,
): Promise<ContestProgress | null> {
  if (!solved) return null;

  if (!released) return null;

  const links = await ctx.db
    .query("contestProblems")
    .withIndex("by_contest_order", (q) => q.eq("contestId", contest._id))
    .collect();

  const problems: ContestProgress["problems"] = [];

  for (const [index, link] of links.entries()) {
    const problem = await ctx.db.get(link.problemId);

    if (!problem) continue;
    problems.push({
      code: problem.code,
      name: problem.name,
      label: labelForProblem(contest, index),
      solved: solved.has(problem._id),
    });
  }

  return {
    solved: problems.filter((row) => row.solved).length,
    total: problems.length,
    problems,
  };
}

async function listRow(
  ctx: QueryCtx,
  contest: Doc<"contests">,
  editorOrTester: boolean,
  hasCompleted: boolean,
  solved: Set<string> | null = null,
  released = false,
): Promise<ContestListRow> {
  return {
    _id: contest._id,
    key: contest.key,
    name: contest.name,
    startTime: contest.startTime,
    endTime: contest.endTime,
    timeLimit: contest.timeLimit ?? null,
    userCount: contest.userCount,
    isRated: contest.isRated,
    isPrivate: contest.isPrivate,
    isOrganizationPrivate: contest.isOrganizationPrivate,
    isVisible: contest.isVisible,
    formatName: contest.formatName,
    tags: await tagRefs(ctx, contest.tagIds),
    organizations: await organizationRefs(ctx, contest.organizationIds),
    authors: await userRefs(ctx, contest.authorProfileIds),
    isEditorOrTester: editorOrTester,
    hasCompleted,
    proctorRequired: contest.proctorRequired ?? false,
    progress: await progressFor(ctx, contest, solved, released),
  };
}

/**
 * `ContestList` (contests.py:69): the past contests are paginated and
 * searchable; the running and upcoming ones come whole, with the viewer's
 * still-open participations pulled out of the running list as DMOJ does.
 *
 * The cursor is an offset into the filtered list, because contest visibility
 * cannot be expressed as an index range.
 */
export const list = query({
  args: {
    paginationOpts: v.optional(v.object({ numItems: v.number(), cursor: v.union(v.string(), v.null()) })),
    search: v.optional(v.string()),
    tagName: v.optional(v.string()),
    sort: v.optional(v.string()),
    descending: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ContestListPayload> => {
    const now = Date.now();
    const profile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);

    const all = await ctx.db.query("contests").collect();
    const visible = all.filter((contest) => contestIsVisibleTo(toContestRow(contest), viewer));

    let tagId: Id<"contestTags"> | null = null;

    if (args.tagName) {
      const tagName = args.tagName;

      const tag = await ctx.db
        .query("contestTags")
        .withIndex("by_name", (q) => q.eq("name", tagName))
        .unique();

      if (!tag) {
        return {
          now,
          activeParticipations: [],
          current: [],
          future: [],
          finishedKeys: [],
          past: { page: [], isDone: true, continueCursor: "0" },
          totalPast: 0,
        };
      }

      tagId = tag._id;
    }

    const wantedTagId = tagId;

    const filtered = wantedTagId
      ? visible.filter((contest) => contest.tagIds.includes(wantedTagId))
      : visible;

    const editorOrTester = (contest: Doc<"contests">): boolean =>
      !!profile &&
      (contest.authorProfileIds.includes(profile._id) ||
        contest.curatorProfileIds.includes(profile._id) ||
        contest.testerProfileIds.includes(profile._id));

    // One pass over the viewer's submissions for the whole page, rather than
    // one per contest row, and the contests they took part in, which decides
    // whether a live contest's problems may be named to them.
    let solvedIds: Set<string> | null = null;
    const joinedContests = new Set<string>();

    if (profile) {
      const submissions = await ctx.db
        .query("submissions")
        .withIndex("by_profile_date", (q) => q.eq("profileId", profile._id))
        .take(MAX_SUBMISSION_SCAN);

      solvedIds = new Set(submissions.filter((row) => row.result === "AC").map((row) => row.problemId));

      for (const row of await ctx.db
        .query("contestParticipations")
        .withIndex("by_profile_contest", (q) => q.eq("profileId", profile._id))
        .collect()) {
        joinedContests.add(row.contestId);
      }
    }

    const released = (contest: Doc<"contests">): boolean =>
      problemsReleasedFor(contest, profile, joinedContests.has(contest._id), now);

    const running: Doc<"contests">[] = [];
    const future: Doc<"contests">[] = [];

    for (const contest of filtered) {
      if (contest.endTime < now) continue;

      if (contest.startTime > now) future.push(contest);
      else running.push(contest);
    }

    const activeParticipations: ActiveParticipation[] = [];
    const finishedKeys: string[] = [];
    const current: Doc<"contests">[] = [];

    // A live participation that has run out is why a row offers Spectate rather
    // than Join; it says nothing about which contest the viewer is in.
    for (const contest of running) {
      const participation = profile ? await liveParticipationOf(ctx, contest._id, profile._id) : null;

      if (
        participation &&
        participationHasEnded(toParticipationRow(participation), toContestRow(contest), now)
      ) {
        finishedKeys.push(contest.key);
      }

      current.push(contest);
    }

    /**
     * The contest the viewer is actually in, which is the only one this section
     * can offer to leave.
     *
     * It used to list every contest where they held a live participation row. An
     * open-ended contest never ends one, so joining the tutorial once put it here
     * for good, with a Leave button that answered `You are not in contest`. It
     * also missed a virtual run, which happens on a contest that has finished and
     * so was never among the running ones looked at.
     */
    const held = profile?.currentParticipationId ? await ctx.db.get(profile.currentParticipationId) : null;

    const heldContest = held ? await ctx.db.get(held.contestId) : null;

    if (held && heldContest) {
      // It is listed as the contest they are in, so it is not also listed as one
      // they could join.
      const index = current.findIndex((row) => row._id === heldContest._id);

      if (index >= 0) current.splice(index, 1);

      const endsAt = endTimeOf(heldContest, held);
      activeParticipations.push({
        participationId: held._id,
        contest: await listRow(
          ctx,
          heldContest,
          editorOrTester(heldContest),
          false,
          solvedIds,
          released(heldContest),
        ),
        virtual: held.virtual,
        endsAt,
        timeRemaining: endsAt >= now ? endsAt - now : null,
      });
    }

    activeParticipations.sort((a, b) => a.endsAt - b.endsAt || a.contest.key.localeCompare(b.contest.key));
    current.sort((a, b) => a.endTime - b.endTime || a.key.localeCompare(b.key));
    future.sort((a, b) => a.startTime - b.startTime || a.key.localeCompare(b.key));

    const needle = (args.search ?? "").trim().toLowerCase();
    let past = filtered.filter((contest) => contest.endTime < now);

    if (needle) {
      past = past.filter(
        (contest) =>
          contest.name.toLowerCase().includes(needle) || contest.key.toLowerCase().includes(needle),
      );
    }

    const sort: Sort = isSort(args.sort) ? args.sort : "startTime";
    const descending = args.descending ?? sort !== "name";
    past.sort((a, b) => compareContests(a, b, sort, descending));

    const numItems = Math.max(1, Math.min(args.paginationOpts?.numItems ?? 20, 100));
    const offset = Number.parseInt(args.paginationOpts?.cursor ?? "0", 10) || 0;
    const slice = past.slice(offset, offset + numItems);

    const pastRows: ContestListRow[] = [];

    for (const contest of slice) {
      const participation = profile ? await liveParticipationOf(ctx, contest._id, profile._id) : null;
      pastRows.push(
        await listRow(ctx, contest, editorOrTester(contest), !!participation, solvedIds, released(contest)),
      );
    }

    const currentRows: ContestListRow[] = [];

    for (const contest of current) {
      currentRows.push(
        await listRow(
          ctx,
          contest,
          editorOrTester(contest),
          finishedKeys.includes(contest.key),
          solvedIds,
          released(contest),
        ),
      );
    }

    const futureRows: ContestListRow[] = [];

    for (const contest of future) {
      futureRows.push(
        await listRow(ctx, contest, editorOrTester(contest), false, solvedIds, released(contest)),
      );
    }

    return {
      now,
      activeParticipations,
      current: currentRows,
      future: futureRows,
      finishedKeys,
      past: {
        page: pastRows,
        isDone: offset + numItems >= past.length,
        continueCursor: String(offset + numItems),
      },
      totalPast: past.length,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Calendar and iCal                                                          */
/* -------------------------------------------------------------------------- */

export type CalendarContest = {
  _id: Id<"contests">;
  key: string;
  name: string;
  startTime: number;
  endTime: number;
  isRated: boolean;
};

export type CalendarDay = {
  /** `YYYY-MM-DD` in the requested offset. */
  date: string;
  isPad: boolean;
  isToday: boolean;
  starts: CalendarContest[];
  ends: CalendarContest[];
  oneday: CalendarContest[];
};

export type CalendarPayload = {
  year: number;
  month: number;
  now: number;
  weeks: CalendarDay[][];
  prevMonth: { year: number; month: number } | null;
  nextMonth: { year: number; month: number } | null;
} | null;

const DAY = 86_400_000;

function dayKey(timestamp: number, offsetMinutes: number): string {
  return new Date(timestamp + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function calendarDays(year: number, month: number): string[] {
  // Weeks start on Sunday, as DMOJ's calendar does.
  const first = Date.UTC(year, month - 1, 1);
  const start = first - new Date(first).getUTCDay() * DAY;
  const lastOfMonth = Date.UTC(year, month, 0);
  const end = lastOfMonth + (6 - new Date(lastOfMonth).getUTCDay()) * DAY;
  const days: string[] = [];

  for (let day = start; day <= end; day += DAY) days.push(new Date(day).toISOString().slice(0, 10));

  return days;
}

function comparePair(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

type YearMonth = {
  year: number;
  month: number;
};

function stepMonth(year: number, month: number, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;

  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * `ContestCalendar` (contests.py:484). Dates are bucketed in the offset the
 * caller passes (minutes east of UTC), because Convex has no notion of the
 * viewer's timezone.
 */
export const calendar = query({
  args: { year: v.number(), month: v.number(), offsetMinutes: v.optional(v.number()) },
  handler: async (ctx, { year, month, offsetMinutes }): Promise<CalendarPayload> => {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
    const offset = offsetMinutes ?? 0;
    const now = Date.now();

    const profile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);
    const all = await ctx.db.query("contests").collect();
    const contests = all.filter((contest) => contestIsVisibleTo(toContestRow(contest), viewer));

    const days = calendarDays(year, month);

    type Bucket = { starts: CalendarContest[]; ends: CalendarContest[]; oneday: CalendarContest[] };

    const buckets = new Map<string, Bucket>();

    for (const day of days) buckets.set(day, { starts: [], ends: [], oneday: [] });

    for (const contest of contests) {
      const startDay = dayKey(contest.startTime, offset);
      // DMOJ takes the day of `end_time - 1s`, so a contest ending at midnight
      // belongs to the previous day.
      const endDay = dayKey(contest.endTime - 1000, offset);

      const row: CalendarContest = {
        _id: contest._id,
        key: contest.key,
        name: contest.name,
        startTime: contest.startTime,
        endTime: contest.endTime,
        isRated: contest.isRated,
      };

      if (startDay === endDay) buckets.get(startDay)?.oneday.push(row);
      else {
        buckets.get(startDay)?.starts.push(row);
        buckets.get(endDay)?.ends.push(row);
      }
    }

    const today = dayKey(now, offset);
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    const weeks: CalendarDay[][] = [];

    for (let i = 0; i < days.length; i += 7) {
      weeks.push(
        days.slice(i, i + 7).map((date) => {
          const bucket = buckets.get(date) ?? { starts: [], ends: [], oneday: [] };

          return {
            date,
            isPad: !date.startsWith(monthPrefix),
            isToday: date === today,
            starts: bucket.starts,
            ends: bucket.ends,
            oneday: bucket.oneday,
          };
        }),
      );
    }

    // DMOJ bounds the calendar by the earliest start and the latest end.
    const nowDate = new Date(now + offset * 60_000);
    let minMonth: [number, number] = [nowDate.getUTCFullYear(), nowDate.getUTCMonth() + 1];
    let maxMonth: [number, number] = [minMonth[0], minMonth[1]];

    for (const contest of all) {
      const start = new Date(contest.startTime + offset * 60_000);
      const end = new Date(contest.endTime + offset * 60_000);
      const startPair: [number, number] = [start.getUTCFullYear(), start.getUTCMonth() + 1];
      const endPair: [number, number] = [end.getUTCFullYear(), end.getUTCMonth() + 1];

      if (comparePair(startPair, minMonth) < 0) minMonth = startPair;

      if (comparePair(endPair, maxMonth) > 0) maxMonth = endPair;
    }

    const here: [number, number] = [year, month];

    if (comparePair(here, minMonth) < 0 || comparePair(here, maxMonth) > 0) return null;

    return {
      year,
      month,
      now,
      weeks,
      prevMonth: comparePair(here, minMonth) > 0 ? stepMonth(year, month, -1) : null,
      nextMonth: comparePair(here, maxMonth) < 0 ? stepMonth(year, month, 1) : null,
    };
  },
});

export type ICalEntry = {
  uid: string;
  key: string;
  name: string;
  startTime: number;
  endTime: number;
};

/** `ContestICal` (contests.py:564): the data behind `/contests.ics`. */
export const ical = query({
  args: {},
  handler: async (ctx): Promise<ICalEntry[]> => {
    const profile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);
    const all = await ctx.db.query("contests").collect();

    return all
      .filter((contest) => contestIsVisibleTo(toContestRow(contest), viewer))
      .sort((a, b) => a.startTime - b.startTime)
      .map((contest) => ({
        uid: `contest-${contest.key}`,
        key: contest.key,
        name: contest.name,
        startTime: contest.startTime,
        endTime: contest.endTime,
      }));
  },
});

/* -------------------------------------------------------------------------- */
/* The contest page                                                           */
/* -------------------------------------------------------------------------- */

export type AccessDecision =
  | { kind: "ok" }
  | { kind: "notFound" }
  | { kind: "inaccessible" }
  | {
      kind: "privateContest";
      name: string;
      isPrivate: boolean;
      isOrganizationPrivate: boolean;
      organizations: OrganizationRef[];
      classes: { _id: Id<"classes">; name: string; slug: string }[];
    };

export type ContestProblemEntry = {
  contestProblemId: Id<"contestProblems">;
  problemId: Id<"problems">;
  code: string;
  name: string;
  label: string;
  order: number;
  points: number;
  partial: boolean;
  isPretested: boolean;
  maxSubmissions: number | null;
  /** `Problem.submissions_left` for the viewer's own run; null where uncapped. */
  submissionsLeft: number | null;
  /** Whether the statement has samples to download. */
  hasSamples: boolean;
  /** SPEC section 20: how many people have solved it outside the contest too. */
  publicSolveCount: number;
  acRate: number;
  hasPublicEditorial: boolean;
  isAccessible: boolean;
  state: ProblemState;
  bestScore: number;
  contestBestScore: number;
  solvedDuringContest: boolean;
  solvedSinceContest: boolean;
  submissionCount: number;
};

export type ParticipationSummary = {
  _id: Id<"contestParticipations">;
  virtual: number;
  realStart: number;
  score: number;
  cumtime: number;
  tiebreaker: number;
  isDisqualified: boolean;
  endsAt: number;
  ended: boolean;
  timeRemaining: number | null;
};

export type ContestDetail = {
  access: AccessDecision;
  now: number;
  contest: {
    _id: Id<"contests">;
    key: string;
    name: string;
    description: string;
    summary: string | null;
    startTime: number;
    endTime: number;
    timeLimit: number | null;
    isVisible: boolean;
    isRated: boolean;
    isPrivate: boolean;
    isOrganizationPrivate: boolean;
    useClarifications: boolean;
    hideProblemTags: boolean;
    hideProblemAuthors: boolean;
    runPretestsOnly: boolean;
    showShortDisplay: boolean;
    scoreboardVisibility: string;
    freezeMinutes: number;
    blindDuringFreeze: boolean;
    pointsPrecision: number;
    userCount: number;
    ogImage: string | null;
    logoOverrideImage: string | null;
    lockedAfter: number | null;
    ratingFloor: number | null;
    ratingCeiling: number | null;
    proctorRequired: boolean;
    tags: TagRef[];
    organizations: OrganizationRef[];
    authors: UserRef[];
    curators: UserRef[];
    testers: UserRef[];
    spectators: UserRef[];
  } | null;
  problems: ContestProblemEntry[];
  /**
   * Whether the problems may be named yet. False leaves `problems` empty and
   * the page says so, rather than pretending the contest has none.
   */
  problemsReleased: boolean;
  metadata: {
    problemCount: number;
    hasPartials: boolean;
    hasPretests: boolean;
    hasSubmissionCap: boolean;
    hasPublicEditorials: boolean;
  };
  format: { name: string; displayName: string; shortFormDisplay: ScoringLine[]; labelScheme: string };
  participation: ParticipationSummary | null;
  liveParticipation: ParticipationSummary | null;
  timing: {
    started: boolean;
    ended: boolean;
    timeBeforeStart: number | null;
    timeBeforeEnd: number | null;
    timeRemaining: number | null;
    frozenAt: number | null;
  };
  viewer: {
    isAuthenticated: boolean;
    isEditor: boolean;
    isTester: boolean;
    isSpectator: boolean;
    canEdit: boolean;
    canClone: boolean;
    canMoss: boolean;
    canRate: boolean;
    hasJoined: boolean;
    inContest: boolean;
    hasCompleted: boolean;
    isBanned: boolean;
    requiresAccessCode: boolean;
    canJoinLive: boolean;
    canSpectate: boolean;
    canJoinVirtual: boolean;
    canSeeScoreboard: boolean;
    canSeeFullScoreboard: boolean;
    canSeeOwnScoreboard: boolean;
  };
  hasRating: boolean;
  hasMossResults: boolean;
};

function emptyDetail(access: AccessDecision, now: number): ContestDetail {
  return {
    access,
    now,
    contest: null,
    problems: [],
    problemsReleased: false,
    metadata: {
      problemCount: 0,
      hasPartials: false,
      hasPretests: false,
      hasSubmissionCap: false,
      hasPublicEditorials: false,
    },
    format: {
      name: "default",
      displayName: "Default",
      shortFormDisplay: [],
      labelScheme: "numbers",
    },
    participation: null,
    liveParticipation: null,
    timing: {
      started: false,
      ended: false,
      timeBeforeStart: null,
      timeBeforeEnd: null,
      timeRemaining: null,
      frozenAt: null,
    },
    viewer: {
      isAuthenticated: false,
      isEditor: false,
      isTester: false,
      isSpectator: false,
      canEdit: false,
      canClone: false,
      canMoss: false,
      canRate: false,
      hasJoined: false,
      inContest: false,
      hasCompleted: false,
      isBanned: false,
      requiresAccessCode: false,
      canJoinLive: false,
      canSpectate: false,
      canJoinVirtual: false,
      canSeeScoreboard: false,
      canSeeFullScoreboard: false,
      canSeeOwnScoreboard: false,
    },
    hasRating: false,
    hasMossResults: false,
  };
}

function summarise(
  contest: Doc<"contests">,
  participation: Doc<"contestParticipations">,
  now: number,
): ParticipationSummary {
  const contestRow = toContestRow(contest);
  const participationRow = toParticipationRow(participation);

  return {
    _id: participation._id,
    virtual: participation.virtual,
    realStart: participation.realStart,
    score: participation.score,
    cumtime: participation.cumtime,
    tiebreaker: participation.tiebreaker,
    isDisqualified: participation.isDisqualified,
    endsAt: participationEndTime(participationRow, contestRow),
    ended: participationHasEnded(participationRow, contestRow, now),
    timeRemaining: participationTimeRemaining(participationRow, contestRow, now),
  };
}

/**
 * `ContestDetail` (contests.py:267), with SPEC section 20's per-problem viewer
 * state and public solve counts folded in.
 */
export const get = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<ContestDetail> => {
    const now = Date.now();
    const contest = await contestByKey(ctx, key);

    if (!contest) return emptyDetail({ kind: "notFound" }, now);

    const profile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);
    const contestRow = toContestRow(contest);

    // `ContestMixin.get_object`: being in the contest beats the access check.
    const currentParticipationDoc = profile?.currentParticipationId
      ? await ctx.db.get(profile.currentParticipationId)
      : null;

    const inThisContest = currentParticipationDoc?.contestId === contest._id;

    const access: ContestAccess = contestAccessCheck(contestRow, viewer);

    if (!inThisContest && access.kind !== "ok") {
      if (access.kind === "inaccessible") return emptyDetail({ kind: "inaccessible" }, now);
      const organizations = await organizationRefs(ctx, contest.organizationIds);
      const classes: { _id: Id<"classes">; name: string; slug: string }[] = [];

      for (const id of contest.classIds) {
        const row = await ctx.db.get(id);

        if (row) classes.push({ _id: row._id, name: row.name, slug: row.slug });
      }

      return emptyDetail(
        {
          kind: "privateContest",
          name: contest.name,
          isPrivate: contest.isPrivate,
          isOrganizationPrivate: contest.isOrganizationPrivate,
          organizations,
          classes,
        },
        now,
      );
    }

    const contestProblems = await loadContestProblems(ctx, contest._id);

    /**
     * DMOJ's gate on the problem table (`contest/contest.html`):
     * `contest.ended or is_superuser or is_editor or is_tester or
     * (is_spectator and contest.started)`. Naming a problem before the contest
     * is over hands it to anybody who opens the page, so the same rule applies
     * here — with participants added, who plainly need to read what they are
     * competing on.
     */
    const problemsReleased = problemsReleasedFor(contest, profile, inThisContest, now);

    // `Problem.is_accessible_by`, not a local guess at it: a problem that is not
    // public is still the viewer's to open while they are inside this contest,
    // and the shared rule is the one that knows that (and that proctoring can
    // take it away again).
    const problemViewer = await loadViewerContext(ctx);

    /**
     * What a capped problem has left, counted once for the whole table rather
     * than per row: the list can be submitted from now, and it has to say the
     * same number the problem's own submit page does — which counts the run,
     * not the contest, so a second virtual attempt starts over.
     */
    const usedInRun = new Map<Id<"problems">, number>();
    const countingRun = inThisContest && !!currentParticipationDoc;

    if (currentParticipationDoc && inThisContest) {
      const runId = currentParticipationDoc._id;

      const runSubmissions = await ctx.db
        .query("submissions")
        .withIndex("by_participation", (q) => q.eq("participationId", runId))
        .collect();

      for (const submission of runSubmissions) {
        if (submission.status === "IE") continue;
        usedInRun.set(submission.problemId, (usedInRun.get(submission.problemId) ?? 0) + 1);
      }
    }

    const problems: ContestProblemEntry[] = [];
    let hasPartials = false;
    let hasPretests = false;
    let hasSubmissionCap = false;
    let hasPublicEditorials = false;

    for (const [index, contestProblem] of problemsReleased ? contestProblems.entries() : []) {
      const problem = await ctx.db.get(contestProblem.problemId);

      if (!problem) continue;

      const solution = await ctx.db
        .query("solutions")
        .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
        .unique();

      const hasPublicEditorial = !!solution && solution.isPublic && solution.publishOn <= now;

      if (problem.isPublic && hasPublicEditorial) hasPublicEditorials = true;

      if (contestProblem.partial && problem.partial) hasPartials = true;

      if (contestProblem.isPretested && contest.runPretestsOnly) hasPretests = true;

      if (contestProblem.maxSubmissions) hasSubmissionCap = true;

      const state = await problemStateFor(ctx, profile?._id ?? null, problem, contest._id);
      problems.push({
        contestProblemId: contestProblem._id,
        problemId: problem._id,
        code: problem.code,
        name: problem.name,
        label: labelForProblem(contest, index),
        order: contestProblem.order,
        points: contestProblem.points,
        partial: contestProblem.partial,
        isPretested: contestProblem.isPretested,
        maxSubmissions: contestProblem.maxSubmissions ?? null,
        submissionsLeft:
          countingRun && contestProblem.maxSubmissions
            ? Math.max(contestProblem.maxSubmissions - (usedInRun.get(problem._id) ?? 0), 0)
            : null,
        publicSolveCount: problem.userCount,
        acRate: problem.acRate,
        // The default statement, not the reader's translation: this only says
        // whether the button is worth offering, and a translated statement
        // carries the same samples as the one it was translated from.
        hasSamples: statementHasSamples(problem.description),
        hasPublicEditorial,
        isAccessible: await canAccessProblem(ctx, problem, problemViewer),
        state: state.state,
        bestScore: state.bestScore,
        contestBestScore: state.contestBestScore,
        solvedDuringContest: state.solvedDuringContest,
        solvedSinceContest: state.solvedSinceContest,
        submissionCount: state.contestAttemptCount,
      });
    }

    const participations = profile ? await participationsOf(ctx, contest._id, profile._id) : [];
    const liveParticipation = participations.find((row) => row.virtual === PARTICIPATION_LIVE) ?? null;

    const currentParticipation =
      participations.find((row) => row._id === profile?.currentParticipationId) ?? null;

    const context = {
      now,
      liveParticipation: liveParticipation ? toParticipationRow(liveParticipation) : null,
    };

    const canEdit = contestIsEditableBy(contestRow, viewer);

    const isEditor =
      !!profile &&
      (contest.authorProfileIds.includes(profile._id) || contest.curatorProfileIds.includes(profile._id));

    const isTester = !!profile && contest.testerProfileIds.includes(profile._id);

    const decision = contestJoinDecision(contestRow, viewer, {
      now,
      participations: participations.map(toParticipationRow),
    });

    const settings = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
      .unique();

    const rating = await ctx.db
      .query("ratings")
      .withIndex("by_contest", (q) => q.eq("contestId", contest._id))
      .first();

    const mossRow = await ctx.db
      .query("contestMoss")
      .withIndex("by_contest", (q) => q.eq("contestId", contest._id))
      .first();

    const format = formatFor(contest);
    let shortFormDisplay: ScoringLine[] = [];

    try {
      shortFormDisplay = format.getShortFormDisplay(contest.formatConfig);
    } catch {
      shortFormDisplay = [];
    }

    return {
      access: { kind: "ok" },
      now,
      contest: {
        _id: contest._id,
        key: contest.key,
        name: contest.name,
        description: contest.description,
        summary: contest.summary ?? null,
        startTime: contest.startTime,
        endTime: contest.endTime,
        timeLimit: contest.timeLimit ?? null,
        isVisible: contest.isVisible,
        isRated: contest.isRated,
        isPrivate: contest.isPrivate,
        isOrganizationPrivate: contest.isOrganizationPrivate,
        useClarifications: contest.useClarifications,
        hideProblemTags: contest.hideProblemTags,
        hideProblemAuthors: contest.hideProblemAuthors,
        runPretestsOnly: contest.runPretestsOnly,
        showShortDisplay: contest.showShortDisplay,
        scoreboardVisibility: contest.scoreboardVisibility,
        freezeMinutes: contest.freezeMinutes,
        blindDuringFreeze: contest.blindDuringFreeze,
        pointsPrecision: contest.pointsPrecision,
        userCount: contest.userCount,
        ogImage: contest.ogImage ?? null,
        logoOverrideImage: contest.logoOverrideImage ?? null,
        lockedAfter: contest.lockedAfter ?? null,
        ratingFloor: contest.ratingFloor ?? null,
        ratingCeiling: contest.ratingCeiling ?? null,
        proctorRequired: contest.proctorRequired ?? false,
        tags: await tagRefs(ctx, contest.tagIds),
        organizations: await organizationRefs(ctx, contest.organizationIds),
        authors: await userRefs(ctx, contest.authorProfileIds),
        curators: await userRefs(ctx, contest.curatorProfileIds),
        testers: await userRefs(ctx, contest.testerProfileIds),
        spectators: await userRefs(ctx, contest.spectatorProfileIds),
      },
      problems,
      problemsReleased,
      metadata: {
        problemCount: problems.length,
        hasPartials,
        hasPretests,
        hasSubmissionCap,
        hasPublicEditorials,
      },
      format: {
        name: format.name,
        displayName: format.displayName,
        shortFormDisplay,
        labelScheme: contest.labelScheme,
      },
      participation: currentParticipation ? summarise(contest, currentParticipation, now) : null,
      liveParticipation: liveParticipation ? summarise(contest, liveParticipation, now) : null,
      timing: {
        started: contestStarted(contestRow, now),
        ended: contestEnded(contestRow, now),
        timeBeforeStart: contest.startTime >= now ? contest.startTime - now : null,
        timeBeforeEnd: contest.endTime >= now ? contest.endTime - now : null,
        timeRemaining: currentParticipation
          ? participationTimeRemaining(toParticipationRow(currentParticipation), contestRow, now)
          : null,
        frozenAt: freezeTime(contestRow),
      },
      viewer: {
        isAuthenticated: !!profile,
        isEditor,
        isTester,
        isSpectator: !!profile && contest.spectatorProfileIds.includes(profile._id),
        canEdit,
        canClone: hasPerm(viewer, "judge.clone_contest"),
        canMoss: hasPerm(viewer, "judge.moss_contest") && canEdit && !!settings?.mossApiKey,
        canRate: hasPerm(viewer, "judge.contest_rating"),
        hasJoined: !!liveParticipation,
        inContest: !!currentParticipation,
        hasCompleted: contestHasCompletedContest(contestRow, viewer, context),
        isBanned: !!profile && contest.bannedProfileIds.includes(profile._id),
        requiresAccessCode: decision.kind === "accessCodeRequired",
        canJoinLive: contestStarted(contestRow, now) && contestIsLiveJoinableBy(contestRow, viewer, context),
        canSpectate:
          contestStarted(contestRow, now) &&
          !contestEnded(contestRow, now) &&
          !contestIsLiveJoinableBy(contestRow, viewer, context) &&
          contestIsSpectatableBy(contestRow, viewer),
        canJoinVirtual: !!profile && contestEnded(contestRow, now),
        canSeeScoreboard: contestShowScoreboard(contestRow, now),
        canSeeFullScoreboard: contestCanSeeFullScoreboard(contestRow, viewer, context),
        canSeeOwnScoreboard: contestCanSeeOwnScoreboard(contestRow, viewer, context),
      },
      hasRating: !!rating,
      hasMossResults: !!mossRow,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Statistics                                                                 */
/* -------------------------------------------------------------------------- */

export type ContestStats = {
  problems: { label: string; code: string; name: string; acRate: number; total: number }[];
  /** One entry per result code, with a count per problem, in problem order. */
  problemStatusCount: { code: string; counts: number[] }[];
  languageCount: { name: string; count: number }[];
  languageAcRate: { name: string; acRate: number }[];
  totalSubmissions: number;
} | null;

/** `ContestStats` (contests.py:587). Editors may look before the contest ends. */
export const stats = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<ContestStats> => {
    const contest = await contestByKey(ctx, key);

    if (!contest) return null;

    const profile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);
    const contestRow = toContestRow(contest);

    if (contestAccessCheck(contestRow, viewer).kind !== "ok") return null;

    const now = Date.now();
    const canEdit = contestIsEditableBy(contestRow, viewer);

    if (!contestEnded(contestRow, now) && !canEdit) return null;

    const contestProblems = await loadContestProblems(ctx, contest._id);
    const problemIndex = new Map<string, number>();
    const problems: { label: string; code: string; name: string; acRate: number; total: number }[] = [];

    for (const [index, contestProblem] of contestProblems.entries()) {
      const problem = await ctx.db.get(contestProblem.problemId);

      if (!problem) continue;
      problemIndex.set(problem._id, problems.length);
      problems.push({
        label: labelForProblem(contest, index),
        code: problem.code,
        name: problem.name,
        acRate: 0,
        total: 0,
      });
    }

    const submissions = await ctx.db
      .query("submissions")
      .withIndex("by_contest_date", (q) => q.eq("contestId", contest._id))
      .collect();

    const statusCounts = new Map<string, number[]>();
    const languageTotals = new Map<string, { count: number; accepted: number }>();
    const accepted = new Array<number>(problems.length).fill(0);

    for (const submission of submissions) {
      const index = problemIndex.get(submission.problemId);
      const code = submission.result ?? submission.status;

      if (index !== undefined) {
        const row = statusCounts.get(code) ?? new Array<number>(problems.length).fill(0);
        row[index] = (row[index] ?? 0) + 1;
        statusCounts.set(code, row);
        const problemRow = problems[index];

        if (problemRow) problemRow.total += 1;

        if (submission.result === "AC") accepted[index] = (accepted[index] ?? 0) + 1;
      }

      const language = await ctx.db.get(submission.languageId);
      const name = language?.name ?? "Unknown";
      const bucket = languageTotals.get(name) ?? { count: 0, accepted: 0 };
      bucket.count += 1;

      if (submission.result === "AC") bucket.accepted += 1;
      languageTotals.set(name, bucket);
    }

    problems.forEach((problem, index) => {
      problem.acRate = problem.total ? (100 * (accepted[index] ?? 0)) / problem.total : 0;
    });

    return {
      problems,
      problemStatusCount: [...statusCounts.entries()]
        .map(([code, counts]) => ({ code, counts }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      languageCount: [...languageTotals.entries()]
        .map(([name, bucket]) => ({ name, count: bucket.count }))
        .sort((a, b) => b.count - a.count),
      languageAcRate: [...languageTotals.entries()].flatMap(([name, bucket]) => {
        const acRate = bucket.count ? (100 * bucket.accepted) / bucket.count : 0;

        return acRate > 0 ? [{ name, acRate }] : [];
      }),
      totalSubmissions: submissions.length,
    };
  },
});
