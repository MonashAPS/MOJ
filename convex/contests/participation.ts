/**
 * Joining, leaving and the participations a contest has: the mutations that
 * put a viewer in contest mode and take them out of it, the per-user
 * participation lists the contest page shows, and disqualification.
 *
 * Ported from judge/views/contests.py (`ContestJoin`, `ContestLeave`,
 * `ContestParticipationList`, `ContestParticipationDisqualify`) and
 * `Profile.update_contest`.
 */

import {
  type ContestProblemRow,
  contestAccessCheck,
  contestCanSeeFullScoreboard,
  contestIsEditableBy,
  contestJoinDecision,
  PARTICIPATION_LIVE,
  PARTICIPATION_SPECTATE,
  participationEndTime,
  participationHasEnded,
  shouldLeaveContest,
} from "@moj/core";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "../_generated/server";
import { liveParticipationOf, participationsOf, type UserRef, userRef } from "../contests";
import { optionalViewer, requireViewer } from "../lib/auth";
import { forbidden, invalid, mojError, notFound } from "../lib/errors";
import {
  contestByKey,
  formatFor,
  labelForProblem,
  loadContestProblems,
  toContestProblemRow,
  toContestRow,
  toParticipationRow,
  toViewerRowInContest,
} from "./formats";

/** The access check every contest mutation runs before anything else. */
export async function requireAccessibleContest(
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
  args: { key: v.string(), accessCode: v.optional(v.string()) },
  handler: async (
    ctx,
    { key, accessCode },
  ): Promise<{ participationId: Id<"contestParticipations">; virtual: number }> => {
    const profile = await requireViewer(ctx);
    const contest = await requireAccessibleContest(ctx, key, profile);
    // Joining a supervised contest is not itself gated. Reading a problem and
    // submitting to one are, and those are the acts that matter; refusing the
    // join as well only meant someone could not get as far as being told what
    // to do about it.
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
    await ctx.runMutation(internal.contests.rankings.recomputeParticipation, { participationId });

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
