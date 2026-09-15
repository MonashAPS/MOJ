/**
 * Staff console: submission management.
 *
 * `/problem/<code>/manage/submission` in DMOJ, which is
 * `judge/views/problem_manage.py`. Everything here is permission-checked and
 * hands the actual work to `convex/jobs.ts`.
 */

import { hasPerm as coreHasPerm, isLocked, problemIsEditableBy } from "@moj/core";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import { type RejudgeFilter, startRejudgeJob, startRescoreJob } from "../jobs";
import { queueSubmission, resolveSubmission } from "../judging";
import { requireViewer } from "../lib/auth";
import { forbidden, invalid, notFound } from "../lib/errors";
import { requireProblem, toCoreProblem } from "../problems";
import { coreProfile } from "../submissions";

/**
 * `Problem.is_subs_manageable_by(user)`: staff, with `rejudge_submission`, who
 * can edit the problem.
 */
async function requireSubsManageable(ctx: Parameters<typeof requireViewer>[0], problemCode: string) {
  const profile = await requireViewer(ctx);
  const viewer = await coreProfile(ctx, profile);
  const problem = await requireProblem(ctx, problemCode);

  const staff = profile.isStaff || profile.isSuperuser;
  if (
    !staff ||
    !coreHasPerm(viewer, "judge.rejudge_submission") ||
    !problemIsEditableBy(toCoreProblem(problem), viewer)
  ) {
    throw forbidden("You may not manage submissions for this problem.");
  }
  return { profile, viewer, problem };
}

/** One submission, from the staff console rather than the submission page. */
export const rejudgeOne = mutation({
  args: { submissionId: v.union(v.string(), v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);
    const viewer = await coreProfile(ctx, profile);
    if (!coreHasPerm(viewer, "judge.rejudge_submission")) {
      throw forbidden("Missing permission judge.rejudge_submission.");
    }
    const submission = await resolveSubmission(ctx, args.submissionId);
    if (!submission) throw notFound("Submission");
    if (isLocked({ lockedAfter: submission.lockedAfter ?? null }) && !profile.isSuperuser) {
      throw forbidden("This submission is locked.");
    }
    const queued = await queueSubmission(ctx, submission._id, { rejudge: true });
    if (!queued) throw invalid("This submission is already being judged.");
    return { ok: true };
  },
});

/**
 * `rejudge_problem_filter`: everything matching the filter goes back in the
 * queue at batch-rejudge priority, a hundred submissions per scheduled step.
 */
export const batchRejudge = mutation({
  args: {
    problemCode: v.string(),
    idRange: v.optional(v.array(v.number())),
    languageKeys: v.optional(v.array(v.string())),
    results: v.optional(v.array(v.string())),
    archiveLocked: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ jobId: Id<"jobs"> }> => {
    const { profile, viewer, problem } = await requireSubsManageable(ctx, args.problemCode);
    if (!coreHasPerm(viewer, "judge.rejudge_submission_lot")) {
      throw forbidden("Missing permission judge.rejudge_submission_lot.");
    }

    if (args.idRange && args.idRange.length !== 2) {
      throw invalid("An id range is a pair of submission ids.");
    }
    if (args.idRange && (args.idRange[0] as number) > (args.idRange[1] as number)) {
      throw invalid("The id range starts after it ends.");
    }

    const languageIds: Id<"languages">[] = [];
    for (const key of args.languageKeys ?? []) {
      const language = await ctx.db
        .query("languages")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (language) languageIds.push(language._id);
    }

    const filter: RejudgeFilter = {
      problemId: problem._id,
      idRange: args.idRange ? [args.idRange[0] as number, args.idRange[1] as number] : undefined,
      languageIds: languageIds.length ? languageIds : undefined,
      results: args.results?.length ? args.results : undefined,
      archiveLocked: args.archiveLocked === true,
    };

    const jobId = await startRejudgeJob(ctx, problem._id, filter, profile._id);
    return { jobId };
  },
});

/**
 * `rescore_problem`: points are recomputed from the stored case points, so a
 * problem's value can change without regrading anything.
 */
export const rescoreProblem = mutation({
  args: { problemCode: v.string() },
  handler: async (ctx, args): Promise<{ jobId: Id<"jobs"> }> => {
    const { profile, problem } = await requireSubsManageable(ctx, args.problemCode);
    const jobId = await startRescoreJob(ctx, problem._id, profile._id);
    return { jobId };
  },
});
