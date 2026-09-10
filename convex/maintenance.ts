import { internalMutation } from "./_generated/server";

export const recoverStuckSubmissions = internalMutation({
  args: {},
  handler: async () => {
    // TODO(judging): requeue submissions stuck in P/G whose judge stopped
    // heartbeating for 60 s, or whose claim is older than 15 min with no case
    // progress. Implemented by the judge-api agent in convex/judging.ts.
    return null;
  },
});

export const markOfflineJudges = internalMutation({
  args: {},
  handler: async () => {
    // TODO(judges): flip judges with no heartbeat in the last 60 s to offline.
    return null;
  },
});

export const cleanupContestMode = internalMutation({
  args: {},
  handler: async () => {
    // TODO(contests): clear profiles.currentParticipationId once the
    // participation window has closed.
    return null;
  },
});

export const refreshHotProblems = internalMutation({
  args: {},
  handler: async () => {
    // TODO(problems): recompute the "hot problems" side box on the home page.
    return null;
  },
});
