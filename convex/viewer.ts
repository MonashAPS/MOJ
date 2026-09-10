import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { optionalViewer } from "./lib/auth";

export type ViewerState = {
  profile: Doc<"profiles"> | null;
  participation: Doc<"contestParticipations"> | null;
  contest: Doc<"contests"> | null;
  inContest: boolean;
};

export const current = query({
  args: {},
  handler: async (ctx): Promise<ViewerState> => {
    const profile = await optionalViewer(ctx);
    if (!profile) {
      return { profile: null, participation: null, contest: null, inContest: false };
    }

    if (!profile.currentParticipationId) {
      return { profile, participation: null, contest: null, inContest: false };
    }

    const participation = await ctx.db.get(profile.currentParticipationId);
    if (!participation) {
      return { profile, participation: null, contest: null, inContest: false };
    }

    const contest = await ctx.db.get(participation.contestId);
    if (!contest) {
      return { profile, participation, contest: null, inContest: false };
    }

    const now = Date.now();
    const ended = participation.virtual === -1 ? now > contest.endTime : endTimeOf(contest, participation) < now;
    return { profile, participation, contest, inContest: !ended };
  },
});

export const isAuthenticated = query({
  args: {},
  handler: async (ctx) => (await ctx.auth.getUserIdentity()) !== null,
});

export const permissions = query({
  args: { codes: v.array(v.string()) },
  handler: async (ctx, { codes }) => {
    const profile = await optionalViewer(ctx);
    const out: Record<string, boolean> = {};
    for (const code of codes) {
      out[code] = !!profile && (profile.isSuperuser || profile.permissions.includes(code));
    }
    return out;
  },
});

function endTimeOf(contest: Doc<"contests">, participation: Doc<"contestParticipations">): number {
  if (contest.timeLimit) {
    const windowEnd = participation.realStart + contest.timeLimit * 1000;
    return participation.virtual > 0 ? windowEnd : Math.min(windowEnd, contest.endTime);
  }
  return participation.virtual > 0 ? contest.endTime - contest.startTime + participation.realStart : contest.endTime;
}
