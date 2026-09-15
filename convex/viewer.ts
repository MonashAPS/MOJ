import { shouldLeaveContest } from "@moj/core";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { toContestRow, toParticipationRow, toViewerRowInContest } from "./contests/formats";
import { optionalViewer } from "./lib/auth";

export type ViewerState = {
  profile: Doc<"profiles"> | null;
  participation: Doc<"contestParticipations"> | null;
  contest: Doc<"contests"> | null;
  inContest: boolean;
  /**
   * True when `currentParticipationId` points at a window that has closed, or
   * at a contest the viewer may no longer access. `contests.clearStaleContest`
   * (or the next mutation the viewer runs) drops it; a query cannot write.
   */
  contestModeStale: boolean;
};

/**
 * `Profile.update_contest()` (judge/models/profile.py:294): contest mode ends
 * when the participation's window closes or the contest stops being accessible.
 * A query cannot patch the profile, so the stale participation is reported as
 * "not in contest" and flagged for the next mutation to clear.
 */
export const current = query({
  args: {},
  handler: async (ctx): Promise<ViewerState> => {
    const profile = await optionalViewer(ctx);
    if (!profile) {
      return {
        profile: null,
        participation: null,
        contest: null,
        inContest: false,
        contestModeStale: false,
      };
    }

    if (!profile.currentParticipationId) {
      return {
        profile,
        participation: null,
        contest: null,
        inContest: false,
        contestModeStale: false,
      };
    }

    const participation = await ctx.db.get(profile.currentParticipationId);
    if (!participation) {
      return {
        profile,
        participation: null,
        contest: null,
        inContest: false,
        contestModeStale: true,
      };
    }

    const contest = await ctx.db.get(participation.contestId);
    if (!contest) {
      return { profile, participation, contest: null, inContest: false, contestModeStale: true };
    }

    const viewer = await toViewerRowInContest(ctx, profile);
    const stale = shouldLeaveContest(
      toParticipationRow(participation),
      toContestRow(contest),
      viewer,
      Date.now(),
    );

    return {
      profile,
      participation,
      contest,
      inContest: !stale,
      contestModeStale: stale,
    };
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
