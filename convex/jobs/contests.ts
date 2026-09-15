/**
 * Chunked job runners for contests (SPEC section 12): rescoring, rating,
 * rejudging one contest problem and MOSS. The `jobs` row itself is kept by the
 * helpers in `convex/jobs.ts`; each runner does a bounded amount of work and
 * schedules the next chunk.
 */

import { shouldLeaveContest } from "@moj/core";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { toContestRow, toParticipationRow, toViewerRowInContest } from "../contests/formats";
import { RESCORE_CHUNK, recompute } from "../contests/rankings";
import { advance, failJob, finishJob, startJob } from "../jobs";
import { queueSubmission } from "../judging";

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
      await failJob(ctx, jobId, "The contest no longer exists.");
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
      await ctx.scheduler.runAfter(0, internal.jobs.contests.rescoreChunk, {
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
      await failJob(ctx, jobId, "The contest no longer exists.");
      return null;
    }
    const result = await ctx.runMutation(internal.ratings.rateContestInternal, { contestId });
    await finishJob(ctx, jobId, result);
    return null;
  },
});

export const REJUDGE_CHUNK = 100;

/**
 * Rejudge every submission to one contest problem, `REJUDGE_CHUNK` at a time.
 * Each one goes back through `queueSubmission`, so it is queued exactly as
 * DMOJ's `Submission.judge(rejudge=True)` queues it.
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
      await failJob(ctx, jobId, "The contest problem no longer exists.");
      return null;
    }

    const submissions = (
      await ctx.db
        .query("submissions")
        .withIndex("by_contest_date", (q) => q.eq("contestId", contestId))
        .collect()
    ).filter((row) => row.contestProblemId === contestProblemId);

    // A submission already on a judge is left alone, as DMOJ does; that is
    // what `queueSubmission` refusing it means.
    for (const submission of submissions.slice(cursor, cursor + REJUDGE_CHUNK)) {
      await queueSubmission(ctx, submission._id, { batchRejudge: true });
    }

    const done = Math.min(cursor + REJUDGE_CHUNK, submissions.length);
    await advance(ctx, jobId, done);

    if (done < submissions.length) {
      await ctx.scheduler.runAfter(0, internal.jobs.contests.rejudgeContestProblemChunk, {
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
      await failJob(ctx, jobId, "MOSS is not configured.");
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
