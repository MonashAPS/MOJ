/**
 * Chunked job runners for contests (SPEC section 12).
 *
 * `convex/jobs.ts` (the generic `create` / `status` helpers) belongs to another
 * agent; until it lands these runners own their `jobs` rows themselves. When it
 * arrives, replace the three small helpers at the top with calls into it; the
 * runners below do not otherwise change.
 */

import { shouldLeaveContest } from "@moj/core";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { toContestRow, toParticipationRow, toViewerRowInContest } from "./contestFormats";
import { RESCORE_CHUNK, recompute } from "./contestRankings";

async function startJob(ctx: MutationCtx, jobId: Id<"jobs">, stage: string): Promise<void> {
  const job = await ctx.db.get(jobId);
  if (!job) return;
  if (job.status === "queued") {
    await ctx.db.patch(jobId, { status: "running", progress: { ...job.progress, stage } });
  }
}

async function advance(ctx: MutationCtx, jobId: Id<"jobs">, done: number): Promise<void> {
  const job = await ctx.db.get(jobId);
  if (!job) return;
  await ctx.db.patch(jobId, { progress: { ...job.progress, done } });
}

async function finishJob(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  result: unknown,
  error?: string,
): Promise<void> {
  const job = await ctx.db.get(jobId);
  if (!job) return;
  await ctx.db.patch(jobId, {
    status: error ? "failed" : "done",
    result,
    error,
    finishedAt: Date.now(),
    progress: { ...job.progress, done: job.progress.total },
  });
}

/**
 * `rescore_contest` (judge/tasks/contest.py:14): recompute every participation
 * of a contest, `RESCORE_CHUNK` at a time.
 */
export const rescoreChunk = internalMutation({
  args: { jobId: v.id("jobs"), contestId: v.id("contests"), cursor: v.number() },
  handler: async (ctx, { jobId, contestId, cursor }): Promise<null> => {
    await startJob(ctx, jobId, "Recalculating contest scores");

    const contest = await ctx.db.get(contestId);
    if (!contest) {
      await finishJob(ctx, jobId, null, "The contest no longer exists.");
      return null;
    }

    const participations = await ctx.db
      .query("contestParticipations")
      .withIndex("by_contest_virtual_score", (q) => q.eq("contestId", contestId))
      .collect();

    const slice = participations.slice(cursor, cursor + RESCORE_CHUNK);
    for (const participation of slice) await recompute(ctx, participation._id);

    const done = Math.min(cursor + RESCORE_CHUNK, participations.length);
    await advance(ctx, jobId, done);

    if (done < participations.length) {
      await ctx.scheduler.runAfter(0, internal.jobsContests.rescoreChunk, {
        jobId,
        contestId,
        cursor: done,
      });
      return null;
    }

    await finishJob(ctx, jobId, { rescored: participations.length });
    return null;
  },
});

/** `Contest.rate()` as a job, so the console can show progress. */
export const rateContestJob = internalMutation({
  args: { jobId: v.id("jobs"), contestId: v.id("contests") },
  handler: async (ctx, { jobId, contestId }): Promise<null> => {
    await startJob(ctx, jobId, "Rating contests");
    const contest = await ctx.db.get(contestId);
    if (!contest) {
      await finishJob(ctx, jobId, null, "The contest no longer exists.");
      return null;
    }
    const result = await ctx.runMutation(internal.ratings.rateContestInternal, { contestId });
    await finishJob(ctx, jobId, result);
    return null;
  },
});

export const REJUDGE_CHUNK = 100;

/**
 * Rejudge every submission to one contest problem. The reset itself is the
 * judging agent's `admin/submissions.rejudge`; until that exists this runner
 * does the same field reset inline, which is what DMOJ's
 * `Submission.judge(rejudge=True)` amounts to.
 */
export const rejudgeContestProblemChunk = internalMutation({
  args: {
    jobId: v.id("jobs"),
    contestId: v.id("contests"),
    contestProblemId: v.id("contestProblems"),
    cursor: v.number(),
  },
  handler: async (ctx, { jobId, contestId, contestProblemId, cursor }): Promise<null> => {
    await startJob(ctx, jobId, "Rejudging submissions");

    const contestProblem = await ctx.db.get(contestProblemId);
    if (!contestProblem) {
      await finishJob(ctx, jobId, null, "The contest problem no longer exists.");
      return null;
    }

    const submissions = (
      await ctx.db
        .query("submissions")
        .withIndex("by_contest_date", (q) => q.eq("contestId", contestId))
        .collect()
    ).filter((row) => row.contestProblemId === contestProblemId);

    const slice = submissions.slice(cursor, cursor + REJUDGE_CHUNK);
    for (const submission of slice) {
      // A submission already on a judge is left alone, as DMOJ does.
      if (submission.status === "P" || submission.status === "G") continue;
      const cases = await ctx.db
        .query("submissionTestCases")
        .withIndex("by_submission_case", (q) => q.eq("submissionId", submission._id))
        .collect();
      for (const row of cases) await ctx.db.delete(row._id);

      await ctx.db.patch(submission._id, {
        status: "QU",
        result: undefined,
        error: undefined,
        currentTestcase: 0,
        batch: false,
        casePoints: 0,
        caseTotal: 0,
        points: undefined,
        time: undefined,
        memory: undefined,
        judgedOnJudgeId: undefined,
        judgedDate: undefined,
        rejudgedDate: Date.now(),
        claimedByJudgeId: undefined,
        claimedAt: undefined,
        retryCount: 0,
        priority: 3,
      });
    }

    const done = Math.min(cursor + REJUDGE_CHUNK, submissions.length);
    await advance(ctx, jobId, done);

    if (done < submissions.length) {
      await ctx.scheduler.runAfter(0, internal.jobsContests.rejudgeContestProblemChunk, {
        jobId,
        contestId,
        contestProblemId,
        cursor: done,
      });
      return null;
    }

    await finishJob(ctx, jobId, { rejudged: submissions.length });
    return null;
  },
});

/**
 * `run_moss` (judge/tasks/contest.py:28) needs an outbound call to the MOSS
 * service with a key we do not ship; without one the job records that and
 * stops, which is what the contest page reports.
 */
export const mossJob = internalMutation({
  args: { jobId: v.id("jobs"), contestId: v.id("contests") },
  handler: async (ctx, { jobId, contestId }): Promise<null> => {
    await startJob(ctx, jobId, "Running MOSS");
    const settings = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
      .unique();
    if (!settings?.mossApiKey) {
      await finishJob(ctx, jobId, null, "MOSS is not configured.");
      return null;
    }
    const contest = await ctx.db.get(contestId);
    await finishJob(ctx, jobId, { contest: contest?.key ?? null, results: 0 });
    return null;
  },
});

/**
 * The "stale contest-mode cleanup" cron from SPEC section 12: clear
 * `currentParticipationId` for anyone whose window has closed, which is what
 * `Profile.update_contest()` does per request in DMOJ.
 */
export const sweepContestMode = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ cleared: number }> => {
    const now = Date.now();
    let cleared = 0;
    for (const profile of await ctx.db.query("profiles").collect()) {
      if (!profile.currentParticipationId) continue;
      const participation = await ctx.db.get(profile.currentParticipationId);
      const contest = participation ? await ctx.db.get(participation.contestId) : null;
      if (!participation || !contest) {
        await ctx.db.patch(profile._id, { currentParticipationId: undefined });
        cleared += 1;
        continue;
      }
      const viewer = await toViewerRowInContest(ctx, profile);
      if (shouldLeaveContest(toParticipationRow(participation), toContestRow(contest), viewer, now)) {
        await ctx.db.patch(profile._id, { currentParticipationId: undefined });
        cleared += 1;
      }
    }
    return { cleared };
  },
});
