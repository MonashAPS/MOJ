import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("judge recovery", { minutes: 1 }, internal.maintenance.recoverStuckSubmissions, {});
crons.interval("judge offline marking", { minutes: 1 }, internal.maintenance.markOfflineJudges, {});
crons.interval("stale contest-mode cleanup", { minutes: 5 }, internal.maintenance.cleanupContestMode, {});
crons.interval("hot problems refresh", { minutes: 15 }, internal.maintenance.refreshHotProblems, {});

export default crons;
