import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// SPEC section 12. Every target is an internal mutation in the module that owns
// the work, so a cron run is the same transaction a manual run would be.
crons.interval("judge recovery", { minutes: 1 }, internal.judging.recoverStuckSubmissions, {});
crons.interval("judge offline marking", { minutes: 1 }, internal.judgeApi.markOfflineJudges, {});
crons.interval("stale contest-mode cleanup", { minutes: 5 }, internal.jobsContests.sweepContestMode, {});
crons.interval("stats refresh", { minutes: 15 }, internal.stats.refresh, {});

export default crons;
