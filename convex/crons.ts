import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// SPEC section 12. Every target is an internal mutation in the module that owns
// the work, so a cron run is the same transaction a manual run would be.
crons.interval("judge recovery", { minutes: 1 }, internal.judging.recoverStuckSubmissions, {});

crons.interval("judge offline marking", { minutes: 1 }, internal.judgeApi.markOfflineJudges, {});

crons.interval("stale contest-mode cleanup", { minutes: 5 }, internal.jobs.contests.sweepContestMode, {});

crons.interval(
  "publish ended contests' problems",
  { minutes: 5 },
  internal.jobs.contests.publishEndedContestProblems,
  {},
);

crons.interval("stats refresh", { minutes: 15 }, internal.stats.refresh, {});

// Recordings are the largest thing stored and the least often looked at.
crons.interval("proctor retention", { hours: 6 }, internal.jobs.proctor.sweepRecordings, {});

export default crons;
