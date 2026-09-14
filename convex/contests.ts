/**
 * Contests: the list, the calendar, the contest page, joining and leaving,
 * participations, clarifications, statistics, cloning and MOSS.
 *
 * Ported from judge/views/contests.py and judge/models/contest.py. Every rule
 * lives in `@moj/core`; this module is the Convex plumbing around it.
 *
 * `navBar` and `homeSidebar` were written by the foundation agent for the site
 * shell and the home page; they keep their names and their shapes.
 */

import {
  type ContestAccess,
  type ContestProblemRow,
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
  shouldLeaveContest,
} from "@moj/core";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import {
  contestByKey,
  formatFor,
  labelForProblem,
  loadContestProblems,
  toContestProblemRow,
  toContestRow,
  toParticipationRow,
  toViewerRowInContest,
} from "./contestFormats";
import { optionalViewer, requireViewer } from "./lib/auth";
import { forbidden, invalid, mojError, notFound } from "./lib/errors";
import { requireSebTicket } from "./lib/seb";

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

function userRef(profile: Doc<"profiles">): UserRef {
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

async function liveParticipationOf(
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

async function participationsOf(
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
      ...ongoing.map((row) => shape(row, "ongoing")),
      ...upcoming.map((row) => shape(row, "upcoming")),
    ].slice(0, take);
  },
});

function shape(row: Doc<"contests">, state: "ongoing" | "upcoming"): HomeSidebarContest {
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

    if (key) {
      contest = await contestByKey(ctx, key);
      if (contest && profile) {
        const rows = await participationsOf(ctx, contest._id, profile._id);
        const current = profile.currentParticipationId
          ? (rows.find((row) => row._id === profile.currentParticipationId) ?? null)
          : null;
        participation = current ?? rows.sort((a, b) => b.virtual - a.virtual)[0] ?? null;
      }
    } else if (profile?.currentParticipationId) {
      participation = await ctx.db.get(profile.currentParticipationId);
      if (participation) contest = await ctx.db.get(participation.contestId);
    }

    if (!contest) return null;

    const viewer = await toViewerRowInContest(ctx, profile);
    const contestRow = toContestRow(contest);
    const isCurrent = !!participation && profile?.currentParticipationId === participation._id;
    if (!isCurrent && contestAccessCheck(contestRow, viewer).kind !== "ok") return null;

    const contestProblems = await loadContestProblems(ctx, contest._id);
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
type Sort = (typeof SORTS)[number];

function compareContests(a: Doc<"contests">, b: Doc<"contests">, sort: Sort, descending: boolean): number {
  let result: number;
  if (sort === "name") result = a.name.localeCompare(b.name);
  else if (sort === "userCount") result = a.userCount - b.userCount;
  else result = a.startTime - b.startTime;
  if (result === 0) result = a.key.localeCompare(b.key);
  return descending ? -result : result;
}

async function listRow(
  ctx: QueryCtx,
  contest: Doc<"contests">,
  editorOrTester: boolean,
  hasCompleted: boolean,
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

    const filtered = tagId
      ? visible.filter((contest) => contest.tagIds.includes(tagId as Id<"contestTags">))
      : visible;

    const editorOrTester = (contest: Doc<"contests">): boolean =>
      !!profile &&
      (contest.authorProfileIds.includes(profile._id) ||
        contest.curatorProfileIds.includes(profile._id) ||
        contest.testerProfileIds.includes(profile._id));

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
    for (const contest of running) {
      const participation = profile ? await liveParticipationOf(ctx, contest._id, profile._id) : null;
      if (!participation) {
        current.push(contest);
        continue;
      }
      if (participationHasEnded(toParticipationRow(participation), toContestRow(contest), now)) {
        finishedKeys.push(contest.key);
        current.push(contest);
        continue;
      }
      const endsAt = endTimeOf(contest, participation);
      activeParticipations.push({
        participationId: participation._id,
        contest: await listRow(ctx, contest, editorOrTester(contest), false),
        virtual: participation.virtual,
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

    const sort: Sort = SORTS.includes(args.sort as Sort) ? (args.sort as Sort) : "startTime";
    const descending = args.descending ?? sort !== "name";
    past.sort((a, b) => compareContests(a, b, sort, descending));

    const numItems = Math.max(1, Math.min(args.paginationOpts?.numItems ?? 20, 100));
    const offset = Number.parseInt(args.paginationOpts?.cursor ?? "0", 10) || 0;
    const slice = past.slice(offset, offset + numItems);

    const pastRows: ContestListRow[] = [];
    for (const contest of slice) {
      const participation = profile ? await liveParticipationOf(ctx, contest._id, profile._id) : null;
      pastRows.push(await listRow(ctx, contest, editorOrTester(contest), !!participation));
    }

    const currentRows: ContestListRow[] = [];
    for (const contest of current) {
      currentRows.push(
        await listRow(ctx, contest, editorOrTester(contest), finishedKeys.includes(contest.key)),
      );
    }
    const futureRows: ContestListRow[] = [];
    for (const contest of future) {
      futureRows.push(await listRow(ctx, contest, editorOrTester(contest), false));
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

function stepMonth(year: number, month: number, delta: number): { year: number; month: number } {
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
          const bucket = buckets.get(date) as Bucket;
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
    /** Locked to Safe Exam Browser. The keys themselves are never projected. */
    sebRequired: boolean;
    sebLaunchUrl: string | null;
    tags: TagRef[];
    organizations: OrganizationRef[];
    authors: UserRef[];
    curators: UserRef[];
    testers: UserRef[];
    spectators: UserRef[];
  } | null;
  problems: ContestProblemEntry[];
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
    const problems: ContestProblemEntry[] = [];
    let hasPartials = false;
    let hasPretests = false;
    let hasSubmissionCap = false;
    let hasPublicEditorials = false;

    for (const [index, contestProblem] of contestProblems.entries()) {
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
        publicSolveCount: problem.userCount,
        acRate: problem.acRate,
        hasPublicEditorial,
        isAccessible: problem.isPublic && !problem.isOrganizationPrivate,
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
        sebRequired: contest.sebRequired ?? false,
        sebLaunchUrl: contest.sebLaunchUrl ?? null,
        tags: await tagRefs(ctx, contest.tagIds),
        organizations: await organizationRefs(ctx, contest.organizationIds),
        authors: await userRefs(ctx, contest.authorProfileIds),
        curators: await userRefs(ctx, contest.curatorProfileIds),
        testers: await userRefs(ctx, contest.testerProfileIds),
        spectators: await userRefs(ctx, contest.spectatorProfileIds),
      },
      problems,
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
/* Joining and leaving                                                        */
/* -------------------------------------------------------------------------- */

/** The access check every contest mutation runs before anything else. */
async function requireAccessibleContest(
  ctx: MutationCtx,
  key: string,
  profile: Doc<"profiles">,
): Promise<Doc<"contests">> {
  const contest = await contestByKey(ctx, key);
  if (!contest) throw notFound(`Contest "${key}"`);

  if (profile.currentParticipationId) {
    const participation = await ctx.db.get(profile.currentParticipationId);
    if (participation?.contestId === contest._id) return contest;
  }

  const viewer = await toViewerRowInContest(ctx, profile);
  const access = contestAccessCheck(toContestRow(contest), viewer);
  if (access.kind === "ok") return contest;
  if (access.kind === "inaccessible") throw notFound(`Contest "${key}"`);
  throw forbidden(`Access to contest "${contest.name}" denied.`);
}

async function updateUserCount(ctx: MutationCtx, contestId: Id<"contests">): Promise<number> {
  const live = await ctx.db
    .query("contestParticipations")
    .withIndex("by_contest_virtual_score", (q) =>
      q.eq("contestId", contestId).eq("virtual", PARTICIPATION_LIVE),
    )
    .collect();
  await ctx.db.patch(contestId, { userCount: live.length });
  return live.length;
}

/**
 * `ContestJoin.join_contest` (contests.py:384).
 *
 * The virtual counter is read back inside the loop exactly as DMOJ retries on
 * the unique constraint, so two joins racing for the same virtual id cannot
 * both win.
 */
export const join = mutation({
  args: { key: v.string(), accessCode: v.optional(v.string()), sebTicket: v.optional(v.string()) },
  handler: async (
    ctx,
    { key, accessCode, sebTicket },
  ): Promise<{ participationId: Id<"contestParticipations">; virtual: number }> => {
    const profile = await requireViewer(ctx);
    const contest = await requireAccessibleContest(ctx, key, profile);
    // Joining is what puts the viewer in contest mode, and contest mode is what
    // opens the contest's problems regardless of their own visibility. A locked
    // contest therefore has to be gated here and not only at the page render.
    await requireSebTicket(ctx, contest, profile._id, sebTicket);
    const viewer = await toViewerRowInContest(ctx, profile);
    const contestRow = toContestRow(contest);
    const now = Date.now();

    let participations = await participationsOf(ctx, contest._id, profile._id);
    const decision = contestJoinDecision(contestRow, viewer, {
      now,
      participations: participations.map(toParticipationRow),
      accessCode: accessCode ?? null,
    });

    if (decision.kind === "loginRequired") {
      throw mojError("UNAUTHENTICATED", "You must be logged in to join a contest.");
    }
    if (decision.kind === "notStarted") {
      throw invalid(`"${contest.name}" is not currently ongoing.`);
    }
    if (decision.kind === "banned") {
      throw forbidden(
        "You have been declared persona non grata for this contest. " +
          "You are permanently barred from joining this contest.",
      );
    }
    if (decision.kind === "accessCodeRequired") {
      throw new ConvexError({
        code: "INVALID",
        message: `Enter the access code for "${contest.name}".`,
        reason: "accessCodeRequired",
      });
    }
    if (decision.kind === "cannotEnter") {
      throw forbidden("You are not able to join this contest.");
    }

    let participation: Doc<"contestParticipations"> | null = null;

    if (decision.kind === "virtual") {
      // DMOJ loops on the unique constraint; re-read the counter each time.
      for (let attempt = 0; attempt < 5 && !participation; attempt++) {
        participations = await participationsOf(ctx, contest._id, profile._id);
        const highest = participations.reduce((max, row) => Math.max(max, row.virtual), 0);
        const virtualId = Math.max(highest + 1, 1);
        if (participations.some((row) => row.virtual === virtualId)) continue;
        const id = await ctx.db.insert("contestParticipations", {
          contestId: contest._id,
          profileId: profile._id,
          realStart: now,
          score: 0,
          cumtime: 0,
          isDisqualified: false,
          tiebreaker: 0,
          virtual: virtualId,
          formatData: {},
        });
        participation = await ctx.db.get(id);
      }
      if (!participation) throw mojError("CONFLICT", "Could not start a virtual participation.");
    } else {
      const wanted = decision.kind === "live" ? PARTICIPATION_LIVE : PARTICIPATION_SPECTATE;
      const existing =
        (decision.participationId
          ? participations.find((row) => row._id === decision.participationId)
          : undefined) ?? participations.find((row) => row.virtual === wanted);

      if (existing) {
        participation = existing;
      } else {
        const id = await ctx.db.insert("contestParticipations", {
          contestId: contest._id,
          profileId: profile._id,
          realStart: now,
          score: 0,
          cumtime: 0,
          isDisqualified: false,
          tiebreaker: 0,
          virtual: wanted,
          formatData: {},
        });
        participation = await ctx.db.get(id);
      }
    }

    if (!participation) throw mojError("CONFLICT", "Could not join the contest.");

    await ctx.db.patch(profile._id, { currentParticipationId: participation._id });
    await updateUserCount(ctx, contest._id);
    return { participationId: participation._id, virtual: participation.virtual };
  },
});

/** `ContestLeave` (contests.py:468). */
export const leave = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<null> => {
    const profile = await requireViewer(ctx);
    const contest = await contestByKey(ctx, key);
    if (!contest) throw notFound(`Contest "${key}"`);

    const participation = profile.currentParticipationId
      ? await ctx.db.get(profile.currentParticipationId)
      : null;
    if (!participation || participation.contestId !== contest._id) {
      throw notFound(`You are not in contest "${contest.key}"`);
    }

    await ctx.db.patch(profile._id, { currentParticipationId: undefined });
    return null;
  },
});

/**
 * `Profile.update_contest()` (judge/models/profile.py:294) as an explicit call.
 *
 * `viewer.current` reports a stale contest mode but cannot write; the shell
 * calls this once when it sees `contestModeStale`.
 */
export const clearStaleContest = mutation({
  args: {},
  handler: async (ctx): Promise<{ cleared: boolean }> => {
    const profile = await requireViewer(ctx);
    if (!profile.currentParticipationId) return { cleared: false };

    const participation = await ctx.db.get(profile.currentParticipationId);
    if (!participation) {
      await ctx.db.patch(profile._id, { currentParticipationId: undefined });
      return { cleared: true };
    }
    const contest = await ctx.db.get(participation.contestId);
    if (!contest) {
      await ctx.db.patch(profile._id, { currentParticipationId: undefined });
      return { cleared: true };
    }

    const viewer = await toViewerRowInContest(ctx, profile);
    if (!shouldLeaveContest(toParticipationRow(participation), toContestRow(contest), viewer, Date.now())) {
      return { cleared: false };
    }

    await ctx.db.patch(profile._id, { currentParticipationId: undefined });
    return { cleared: true };
  },
});

/* -------------------------------------------------------------------------- */
/* Participations                                                             */
/* -------------------------------------------------------------------------- */

export type ParticipationCell = {
  contestProblemId: Id<"contestProblems">;
  label: string;
  state: string;
  points: number;
  pointsText: string;
  timeText: string;
  penalty?: number;
  penaltyText?: string;
  bonus?: number;
  bonusText?: string;
};

export type ParticipationRow = {
  _id: Id<"contestParticipations">;
  virtual: number;
  realStart: number;
  score: number;
  cumtime: number;
  tiebreaker: number;
  isDisqualified: boolean;
  endsAt: number;
  ended: boolean;
  user: UserRef;
  /** `format.display_participation_result`. */
  result: { points: number; pointsText: string; cumtime: number; cumtimeText: string };
  problems: (ParticipationCell | null)[];
};

/**
 * `make_contest_ranking_profile` swallows a `format_data` that no longer
 * matches the contest's format and renders '???'; here the cell is dropped.
 */
export function safeDisplay(
  format: ReturnType<typeof formatFor>,
  participation: ReturnType<typeof toParticipationRow>,
  contestProblem: ContestProblemRow,
  contest: ReturnType<typeof toContestRow>,
) {
  try {
    return format.displayUserProblem(participation, contestProblem, contest);
  } catch {
    return null;
  }
}

async function participationRows(
  ctx: QueryCtx,
  contest: Doc<"contests">,
  rows: readonly Doc<"contestParticipations">[],
  contestProblems: readonly Doc<"contestProblems">[],
  now: number,
): Promise<ParticipationRow[]> {
  const format = formatFor(contest);
  const contestRow = toContestRow(contest);
  const problemRows: ContestProblemRow[] = contestProblems.map((row) => toContestProblemRow(row));
  const labels = contestProblems.map((_row, index) => labelForProblem(contest, index));

  const out: ParticipationRow[] = [];
  for (const participation of rows) {
    const profile = await ctx.db.get(participation.profileId);
    if (!profile) continue;
    const participationRow = toParticipationRow(participation);
    out.push({
      _id: participation._id,
      virtual: participation.virtual,
      realStart: participation.realStart,
      score: participation.score,
      cumtime: participation.cumtime,
      tiebreaker: participation.tiebreaker,
      isDisqualified: participation.isDisqualified,
      endsAt: participationEndTime(participationRow, contestRow),
      ended: participationHasEnded(participationRow, contestRow, now),
      user: userRef(profile),
      result: format.displayParticipationResult(participationRow, contestRow),
      problems: problemRows.map((problem, index) => {
        const cell = safeDisplay(format, participationRow, problem, contestRow);
        if (!cell) return null;
        return {
          contestProblemId: problem.id as Id<"contestProblems">,
          label: labels[index] as string,
          state: cell.state,
          points: cell.points,
          pointsText: cell.pointsText,
          timeText: cell.timeText,
          penalty: cell.penalty,
          penaltyText: cell.penaltyText,
          bonus: cell.bonus,
          bonusText: cell.bonusText,
        };
      }),
    });
  }
  return out;
}

/** `ContestParticipationList` (contests.py:785) for the viewer. */
export const participations = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<ParticipationRow[] | null> => {
    const profile = await optionalViewer(ctx);
    if (!profile) return null;
    const contest = await contestByKey(ctx, key);
    if (!contest) return null;

    const viewer = await toViewerRowInContest(ctx, profile);
    if (contestAccessCheck(toContestRow(contest), viewer).kind !== "ok") return null;

    const now = Date.now();
    const rows = (await participationsOf(ctx, contest._id, profile._id))
      .filter((row) => row.virtual >= 0)
      .sort((a, b) => b.virtual - a.virtual);
    return await participationRows(ctx, contest, rows, await loadContestProblems(ctx, contest._id), now);
  },
});

/** The same list for another user, which needs the full scoreboard. */
export const participationsOfUser = query({
  args: { key: v.string(), username: v.string() },
  handler: async (ctx, { key, username }): Promise<ParticipationRow[] | null> => {
    const profile = await optionalViewer(ctx);
    if (!profile) return null;
    const contest = await contestByKey(ctx, key);
    if (!contest) return null;

    const target = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!target) return null;

    const viewer = await toViewerRowInContest(ctx, profile);
    const contestRow = toContestRow(contest);
    if (contestAccessCheck(contestRow, viewer).kind !== "ok") return null;

    const now = Date.now();
    const liveParticipation = await liveParticipationOf(ctx, contest._id, profile._id);
    const context = {
      now,
      liveParticipation: liveParticipation ? toParticipationRow(liveParticipation) : null,
    };
    if (target._id !== profile._id && !contestCanSeeFullScoreboard(contestRow, viewer, context)) {
      return null;
    }

    const rows = (await participationsOf(ctx, contest._id, target._id))
      .filter((row) => row.virtual >= 0)
      .sort((a, b) => b.virtual - a.virtual);
    return await participationRows(ctx, contest, rows, await loadContestProblems(ctx, contest._id), now);
  },
});

/**
 * `ContestParticipationDisqualify` (contests.py:823) and
 * `ContestParticipation.set_disqualified` (contest.py:539).
 */
export const disqualify = mutation({
  args: {
    key: v.string(),
    participationId: v.id("contestParticipations"),
    disqualified: v.boolean(),
  },
  handler: async (ctx, { key, participationId, disqualified }): Promise<null> => {
    const profile = await requireViewer(ctx);
    const contest = await contestByKey(ctx, key);
    if (!contest) throw notFound(`Contest "${key}"`);
    const viewer = await toViewerRowInContest(ctx, profile);
    if (!contestIsEditableBy(toContestRow(contest), viewer)) throw forbidden();

    const participation = await ctx.db.get(participationId);
    if (!participation || participation.contestId !== contest._id) throw notFound("Participation");

    await ctx.db.patch(participationId, { isDisqualified: disqualified });
    await ctx.runMutation(internal.contestRankings.recomputeParticipation, { participationId });

    const banned = new Set<Id<"profiles">>(contest.bannedProfileIds);
    if (disqualified) {
      banned.add(participation.profileId);
      const target = await ctx.db.get(participation.profileId);
      if (target?.currentParticipationId === participationId) {
        await ctx.db.patch(target._id, { currentParticipationId: undefined });
      }
    } else {
      banned.delete(participation.profileId);
    }
    await ctx.db.patch(contest._id, { bannedProfileIds: [...banned] });

    // DMOJ re-rates the contest chain when the contest is rated and has ratings.
    if (contest.isRated) {
      const rated = await ctx.db
        .query("ratings")
        .withIndex("by_contest", (q) => q.eq("contestId", contest._id))
        .first();
      if (rated) {
        await ctx.scheduler.runAfter(0, internal.ratings.rateContestInternal, {
          contestId: contest._id,
        });
      }
    }

    await ctx.db.insert("revisions", {
      entityType: "contestParticipation",
      entityId: participationId,
      snapshot: { virtual: participation.virtual, isDisqualified: disqualified },
      authorProfileId: profile._id,
      reason: disqualified ? "Disqualified participation" : "Reinstated participation",
      createdAt: Date.now(),
    });
    return null;
  },
});

/* -------------------------------------------------------------------------- */
/* Clarifications                                                             */
/* -------------------------------------------------------------------------- */

export type Clarification = {
  _id: Id<"problemClarifications">;
  problemId: Id<"problems">;
  problemCode: string;
  problemName: string;
  label: string;
  description: string;
  date: number;
};

/**
 * DMOJ's contest clarifications are `ProblemClarification` rows on the
 * contest's problems (judge/views/blog.py:49).
 */
export const clarifications = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<Clarification[] | null> => {
    const contest = await contestByKey(ctx, key);
    if (!contest) return null;

    const profile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);
    const current = profile?.currentParticipationId ? await ctx.db.get(profile.currentParticipationId) : null;
    const inThisContest = current?.contestId === contest._id;
    if (!inThisContest && contestAccessCheck(toContestRow(contest), viewer).kind !== "ok") {
      return null;
    }

    const contestProblems = await loadContestProblems(ctx, contest._id);
    const out: Clarification[] = [];
    for (const [index, contestProblem] of contestProblems.entries()) {
      const problem = await ctx.db.get(contestProblem.problemId);
      if (!problem) continue;
      const rows = await ctx.db
        .query("problemClarifications")
        .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
        .collect();
      for (const row of rows) {
        out.push({
          _id: row._id,
          problemId: problem._id,
          problemCode: problem.code,
          problemName: problem.name,
          label: labelForProblem(contest, index),
          description: row.description,
          date: row.date,
        });
      }
    }
    return out.sort((a, b) => b.date - a.date);
  },
});

export const addClarification = mutation({
  args: { key: v.string(), problemCode: v.string(), description: v.string() },
  handler: async (ctx, { key, problemCode, description }): Promise<Id<"problemClarifications">> => {
    const profile = await requireViewer(ctx);
    const contest = await contestByKey(ctx, key);
    if (!contest) throw notFound(`Contest "${key}"`);
    const viewer = await toViewerRowInContest(ctx, profile);
    if (!contestIsEditableBy(toContestRow(contest), viewer)) throw forbidden();

    const body = description.trim();
    if (!body) throw invalid("A clarification needs a body.");

    const problem = await ctx.db
      .query("problems")
      .withIndex("by_code", (q) => q.eq("code", problemCode))
      .unique();
    if (!problem) throw notFound(`Problem "${problemCode}"`);

    const contestProblems = await loadContestProblems(ctx, contest._id);
    if (!contestProblems.some((row) => row.problemId === problem._id)) {
      throw invalid(`"${problemCode}" is not in this contest.`);
    }

    return await ctx.db.insert("problemClarifications", {
      problemId: problem._id,
      description: body,
      date: Date.now(),
    });
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
        row[index] = (row[index] as number) + 1;
        statusCounts.set(code, row);
        (problems[index] as { total: number }).total += 1;
        if (submission.result === "AC") accepted[index] = (accepted[index] as number) + 1;
      }

      const language = await ctx.db.get(submission.languageId);
      const name = language?.name ?? "Unknown";
      const bucket = languageTotals.get(name) ?? { count: 0, accepted: 0 };
      bucket.count += 1;
      if (submission.result === "AC") bucket.accepted += 1;
      languageTotals.set(name, bucket);
    }

    problems.forEach((problem, index) => {
      problem.acRate = problem.total ? (100 * (accepted[index] as number)) / problem.total : 0;
    });

    return {
      problems,
      problemStatusCount: [...statusCounts.entries()]
        .map(([code, counts]) => ({ code, counts }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      languageCount: [...languageTotals.entries()]
        .map(([name, bucket]) => ({ name, count: bucket.count }))
        .sort((a, b) => b.count - a.count),
      languageAcRate: [...languageTotals.entries()]
        .map(([name, bucket]) => ({
          name,
          acRate: bucket.count ? (100 * bucket.accepted) / bucket.count : 0,
        }))
        .filter((row) => row.acRate > 0),
      totalSubmissions: submissions.length,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Clone and MOSS                                                             */
/* -------------------------------------------------------------------------- */

const KEY_PATTERN = /^[a-z0-9]+$/;

/** `ContestClone` (contests.py:317). */
export const clone = mutation({
  args: { key: v.string(), newKey: v.string() },
  handler: async (ctx, { key, newKey }): Promise<{ contestId: Id<"contests">; key: string }> => {
    const profile = await requireViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);
    if (!hasPerm(viewer, "judge.clone_contest")) {
      throw forbidden("Missing permission judge.clone_contest.");
    }

    const contest = await requireAccessibleContest(ctx, key, profile);

    const wanted = newKey.trim();
    if (!KEY_PATTERN.test(wanted) || wanted.length > 20) {
      throw invalid("Contest id must be lowercase letters and digits, at most 20 characters.");
    }
    if (await contestByKey(ctx, wanted)) {
      throw mojError("CONFLICT", "That contest id is already taken.");
    }

    const { _id, _creationTime, legacyId, ...fields } = contest;
    const contestId = await ctx.db.insert("contests", {
      ...fields,
      key: wanted,
      isVisible: false,
      userCount: 0,
      lockedAfter: undefined,
      authorProfileIds: [profile._id],
      revealState: undefined,
      freezeRevealed: undefined,
      revealedUntilRank: undefined,
      isUnfrozen: undefined,
    });

    for (const contestProblem of await loadContestProblems(ctx, contest._id)) {
      const {
        _id: _problemRowId,
        _creationTime: _problemCreated,
        legacyId: _problemLegacyId,
        ...problemFields
      } = contestProblem;
      await ctx.db.insert("contestProblems", { ...problemFields, contestId });
    }

    await ctx.db.insert("revisions", {
      entityType: "contest",
      entityId: contestId,
      snapshot: { key: wanted, clonedFrom: contest.key },
      authorProfileId: profile._id,
      reason: `Cloned contest from ${contest.key}`,
      createdAt: Date.now(),
    });

    return { contestId, key: wanted };
  },
});

export type MossPayload = {
  configured: boolean;
  message: string | null;
  results: {
    problemCode: string;
    problemName: string;
    languageKey: string;
    submissionCount: number;
    url: string | null;
  }[];
};

/**
 * `ContestMossView` (contests.py:852). MOSS itself needs an outbound call with
 * a key we do not have; without one the page says so and offers nothing.
 */
export const moss = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<MossPayload | null> => {
    const profile = await optionalViewer(ctx);
    if (!profile) return null;
    const contest = await contestByKey(ctx, key);
    if (!contest) return null;

    const viewer = await toViewerRowInContest(ctx, profile);
    if (!hasPerm(viewer, "judge.moss_contest")) return null;
    if (!contestIsEditableBy(toContestRow(contest), viewer)) return null;

    const settings = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
      .unique();
    if (!settings?.mossApiKey) {
      return { configured: false, message: "MOSS is not configured.", results: [] };
    }

    const rows = await ctx.db
      .query("contestMoss")
      .withIndex("by_contest", (q) => q.eq("contestId", contest._id))
      .collect();

    const results: MossPayload["results"] = [];
    for (const row of rows) {
      const problem = await ctx.db.get(row.problemId);
      results.push({
        problemCode: problem?.code ?? "",
        problemName: problem?.name ?? "",
        languageKey: row.languageKey,
        submissionCount: row.submissionCount,
        url: row.url ?? null,
      });
    }
    return { configured: true, message: null, results };
  },
});
