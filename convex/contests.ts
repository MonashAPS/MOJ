// NOTE (foundation agent): this module only carries the ContestBar query from
// spec section 20. The contests agent owns the rest of convex/contests.ts and
// should merge `navBar` into their module rather than replacing this file.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { optionalViewer } from "./lib/auth";

export type ContestBarProblem = {
  contestProblemId: Id<"contestProblems">;
  problemId: Id<"problems">;
  code: string;
  name: string;
  label: string;
  points: number;
  state: "solved" | "partial" | "attempted" | "untouched";
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

export const navBar = query({
  args: { key: v.optional(v.string()) },
  handler: async (ctx, { key }): Promise<ContestBarData> => {
    const viewer = await optionalViewer(ctx);

    let participation: Doc<"contestParticipations"> | null = null;
    let contest: Doc<"contests"> | null = null;

    if (key) {
      contest = await ctx.db
        .query("contests")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (contest && viewer) {
        participation = await ctx.db
          .query("contestParticipations")
          .withIndex("by_profile_contest", (q) => q.eq("profileId", viewer._id).eq("contestId", contest!._id))
          .order("desc")
          .first();
      }
    } else if (viewer?.currentParticipationId) {
      participation = await ctx.db.get(viewer.currentParticipationId);
      if (participation) contest = await ctx.db.get(participation.contestId);
    }

    if (!contest) return null;

    const contestProblems = await ctx.db
      .query("contestProblems")
      .withIndex("by_contest_order", (q) => q.eq("contestId", contest!._id))
      .collect();

    const problems: ContestBarProblem[] = [];
    for (const contestProblem of contestProblems) {
      const problem = await ctx.db.get(contestProblem.problemId);
      if (!problem) continue;
      problems.push({
        contestProblemId: contestProblem._id,
        problemId: contestProblem.problemId,
        code: problem.code,
        name: problem.name,
        label: labelFor(contest, contestProblem.order),
        points: contestProblem.points,
        state: participation ? await stateFor(ctx, participation._id, contestProblem) : "untouched",
      });
    }

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
      endsAt: participation ? endTimeOf(contest, participation) : contest.endTime,
      isSpectating: participation?.virtual === -1,
      isVirtual: (participation?.virtual ?? 0) > 0,
    };
  },
});

function labelFor(contest: Doc<"contests">, order: number): string {
  if (contest.labelScheme === "numbers") return String(order + 1);
  if (contest.labelScheme === "custom") return contest.customLabels[order] ?? String(order + 1);
  let label = "";
  let index = order;
  do {
    label = String.fromCharCode(65 + (index % 26)) + label;
    index = Math.floor(index / 26) - 1;
  } while (index >= 0);
  return label;
}

async function stateFor(
  ctx: any,
  participationId: Id<"contestParticipations">,
  contestProblem: Doc<"contestProblems">,
): Promise<ContestBarProblem["state"]> {
  const submissions: Doc<"submissions">[] = await ctx.db
    .query("submissions")
    .withIndex("by_participation", (q: any) => q.eq("participationId", participationId))
    .collect();
  const mine = submissions.filter((row) => row.problemId === contestProblem.problemId);
  if (mine.length === 0) return "untouched";
  const best = Math.max(...mine.map((row) => row.contestPoints ?? row.points ?? 0));
  if (best >= contestProblem.points && contestProblem.points > 0) return "solved";
  if (best > 0) return "partial";
  return "attempted";
}

function endTimeOf(contest: Doc<"contests">, participation: Doc<"contestParticipations">): number {
  if (contest.timeLimit) {
    const windowEnd = participation.realStart + contest.timeLimit * 1000;
    return participation.virtual > 0 ? windowEnd : Math.min(windowEnd, contest.endTime);
  }
  return participation.virtual > 0
    ? contest.endTime - contest.startTime + participation.realStart
    : contest.endTime;
}
