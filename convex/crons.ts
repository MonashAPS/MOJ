import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Judge recovery and offline marking live in the judge API's own modules; the
// two stubs in convex/maintenance.ts belong to other agents.
crons.interval("judge recovery", { minutes: 1 }, internal.judging.recoverStuckSubmissions, {});
crons.interval("judge offline marking", { minutes: 1 }, internal.judgeApi.markOfflineJudges, {});
crons.interval("stale contest-mode cleanup", { minutes: 5 }, internal.maintenance.cleanupContestMode, {});
crons.interval("hot problems refresh", { minutes: 15 }, internal.maintenance.refreshHotProblems, {});

export default crons;
