/**
 * Background jobs: a `jobs` document, work done a chunk at a time through the
 * scheduler, and a progress query for the bar in the staff console.
 *
 * DMOJ runs these on Celery with `judge/utils/celery.py:Progress` writing the
 * progress back. Convex has no worker pool, so a job is a chain of mutations:
 * each one does a page of work and schedules the next, which keeps every step
 * inside a transaction and inside Convex's limits.
 *
 * Ported from judge/tasks/submission.py (`rejudge_problem_filter`,
 * `rescore_problem`, `apply_submission_filter`).
 */

import { pyRound } from "@moj/core";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx, query } from "./_generated/server";
import { queueSubmission, recomputeParticipation, recomputeProfilePoints } from "./judging";
import { optionalViewer } from "./lib/auth";
import { forbidden, notFound } from "./lib/errors";

/** How many submissions one scheduled step touches, per SPEC section 6. */
export const JOB_CHUNK_SIZE = 100;
/**
 * A job's `total` is counted up front so the progress bar has a denominator.
 * The count is one transaction, so it is capped; a bigger job still runs, its
 * progress just pins at the cap.
 */
export const JOB_COUNT_LIMIT = 20_000;

export type JobType = "rejudge" | "rescore" | "rateContest" | "moss" | "userExport" | "pdf" | "sitemap";

export interface RejudgeFilter {
  problemId?: Id<"problems">;
  /** Inclusive range over the integer submission id (`legacyId`). */
  idRange?: [number, number];
  languageIds?: Id<"languages">[];
  results?: string[];
  /** DMOJ's `archive_locked`: false leaves locked submissions alone. */
  archiveLocked?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Job records                                                                */
/* -------------------------------------------------------------------------- */

export async function createJob(
  ctx: MutationCtx,
  type: JobType,
  args: unknown,
  options: { total: number; stage: string; createdByProfileId?: Id<"profiles"> },
): Promise<Id<"jobs">> {
  return await ctx.db.insert("jobs", {
    type,
    status: "queued",
    progress: { done: 0, total: options.total, stage: options.stage },
    args,
    createdByProfileId: options.createdByProfileId,
    createdAt: Date.now(),
  });
}

async function advance(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  done: number,
  stage?: string,
): Promise<Doc<"jobs"> | null> {
  const job = await ctx.db.get(jobId);
  if (!job) return null;
  await ctx.db.patch(jobId, {
    status: "running",
    progress: {
      done: Math.min(done, Math.max(job.progress.total, done)),
      total: job.progress.total,
      stage: stage ?? job.progress.stage,
    },
  });
  return job;
}

async function finishJob(ctx: MutationCtx, jobId: Id<"jobs">, result: unknown): Promise<void> {
  const job = await ctx.db.get(jobId);
  if (!job) return;
  await ctx.db.patch(jobId, {
    status: "done",
    result,
    finishedAt: Date.now(),
    progress: { ...job.progress, total: Math.max(job.progress.total, job.progress.done) },
  });
}

async function failJob(ctx: MutationCtx, jobId: Id<"jobs">, error: string): Promise<void> {
  await ctx.db.patch(jobId, { status: "failed", error, finishedAt: Date.now() });
}

/** The progress bar's query. Staff only: jobs name problems and users. */
export const status = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const profile = await optionalViewer(ctx);
    if (!profile || !(profile.isStaff || profile.isSuperuser)) throw forbidden("Staff only.");
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    return {
      _id: job._id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      result: job.result ?? null,
      error: job.error ?? null,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt ?? null,
    };
  },
});

/** Recent jobs for the staff console's job list. */
export const recent = query({
  args: { limit: v.optional(v.number()), type: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const profile = await optionalViewer(ctx);
    if (!profile || !(profile.isStaff || profile.isSuperuser)) throw forbidden("Staff only.");
    const take = Math.max(1, Math.min(args.limit ?? 25, 100));
    const rows = args.type
      ? await ctx.db
          .query("jobs")
          .withIndex("by_type_createdAt", (q) => q.eq("type", args.type as string))
          .order("desc")
          .take(take)
      : await ctx.db.query("jobs").withIndex("by_type_createdAt").order("desc").take(take);
    return rows;
  },
});

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `apply_submission_filter`: the id range, languages and results the staff
 * console offers, plus DMOJ's two implicit rules — a submission that is being
 * graded is never touched, and locked submissions are skipped unless the
 * "archive locked submissions" box was ticked.
 */
export function matchesFilter(submission: Doc<"submissions">, filter: RejudgeFilter, now: number): boolean {
  if (submission.status === "QU" || submission.status === "P" || submission.status === "G") {
    return false;
  }
  if (filter.idRange) {
    const id = submission.legacyId;
    if (id === undefined) return false;
    if (id < filter.idRange[0] || id > filter.idRange[1]) return false;
  }
  if (filter.languageIds?.length && !filter.languageIds.includes(submission.languageId)) return false;
  if (filter.results?.length && !filter.results.includes(submission.result ?? "")) return false;
  if (!filter.archiveLocked) {
    if (submission.lockedAfter !== undefined && submission.lockedAfter < now) return false;
  }
  return true;
}

function isSubmissionLocked(submission: Doc<"submissions">, now: number): boolean {
  return submission.lockedAfter !== undefined && submission.lockedAfter < now;
}

async function countMatching(
  ctx: QueryCtx,
  problemId: Id<"problems">,
  filter: RejudgeFilter,
  now: number,
): Promise<number> {
  const rows = await ctx.db
    .query("submissions")
    .withIndex("by_problem_date", (q) => q.eq("problemId", problemId))
    .take(JOB_COUNT_LIMIT);
  return rows.filter((row) => matchesFilter(row, filter, now)).length;
}

/* -------------------------------------------------------------------------- */
/* Batch rejudge                                                              */
/* -------------------------------------------------------------------------- */

export async function startRejudgeJob(
  ctx: MutationCtx,
  problemId: Id<"problems">,
  filter: RejudgeFilter,
  createdByProfileId?: Id<"profiles">,
): Promise<Id<"jobs">> {
  const now = Date.now();
  const total = await countMatching(ctx, problemId, filter, now);
  const jobId = await createJob(
    ctx,
    "rejudge",
    { problemId, ...filter },
    { total, stage: "Rejudging submissions", createdByProfileId },
  );
  await ctx.scheduler.runAfter(0, internal.jobs.rejudgeChunk, {
    jobId,
    problemId,
    filter,
    cursor: null,
    done: 0,
    rejudged: 0,
    archived: 0,
  });
  return jobId;
}

const rejudgeFilterValidator = v.object({
  problemId: v.optional(v.id("problems")),
  idRange: v.optional(v.array(v.number())),
  languageIds: v.optional(v.array(v.id("languages"))),
  results: v.optional(v.array(v.string())),
  archiveLocked: v.optional(v.boolean()),
});

export const rejudgeChunk = internalMutation({
  args: {
    jobId: v.id("jobs"),
    problemId: v.id("problems"),
    filter: rejudgeFilterValidator,
    cursor: v.union(v.string(), v.null()),
    done: v.number(),
    rejudged: v.number(),
    archived: v.number(),
  },
  handler: async (ctx, args): Promise<null> => {
    const job = await advance(ctx, args.jobId, args.done);
    if (!job || job.status === "failed") return null;

    const now = Date.now();
    const filter: RejudgeFilter = {
      ...args.filter,
      idRange:
        args.filter.idRange && args.filter.idRange.length === 2
          ? [args.filter.idRange[0] as number, args.filter.idRange[1] as number]
          : undefined,
    };

    const page = await ctx.db
      .query("submissions")
      .withIndex("by_problem_date", (q) => q.eq("problemId", args.problemId))
      .paginate({ numItems: JOB_CHUNK_SIZE, cursor: args.cursor });

    let { done, rejudged, archived } = args;
    for (const submission of page.page) {
      if (!matchesFilter(submission, filter, now)) continue;
      done += 1;
      if (isSubmissionLocked(submission, now)) {
        // `Submission.archive()`: a locked submission is filed away rather than
        // regraded, so the contest it belongs to keeps its results.
        await ctx.db.patch(submission._id, { isArchived: true });
        archived += 1;
      } else {
        await queueSubmission(ctx, submission._id, { rejudge: true, batchRejudge: true });
        rejudged += 1;
      }
    }

    await advance(ctx, args.jobId, done);

    if (page.isDone) {
      await finishJob(ctx, args.jobId, { rejudged, archived });
      return null;
    }
    await ctx.scheduler.runAfter(0, internal.jobs.rejudgeChunk, {
      ...args,
      cursor: page.continueCursor,
      done,
      rejudged,
      archived,
    });
    return null;
  },
});

/* -------------------------------------------------------------------------- */
/* Rescore                                                                    */
/* -------------------------------------------------------------------------- */

export async function startRescoreJob(
  ctx: MutationCtx,
  problemId: Id<"problems">,
  createdByProfileId?: Id<"profiles">,
): Promise<Id<"jobs">> {
  const rows = await ctx.db
    .query("submissions")
    .withIndex("by_problem_date", (q) => q.eq("problemId", problemId))
    .take(JOB_COUNT_LIMIT);
  const jobId = await createJob(
    ctx,
    "rescore",
    { problemId },
    { total: rows.length, stage: "Modifying submissions", createdByProfileId },
  );
  await ctx.scheduler.runAfter(0, internal.jobs.rescoreChunk, {
    jobId,
    problemId,
    cursor: null,
    done: 0,
    profileIds: [],
  });
  return jobId;
}

/**
 * `rescore_problem`, first phase: recompute every submission's points from its
 * stored case points, then its contest points and its participation.
 *
 * DMOJ rounds to one decimal here where `on_grading_end` rounds to three; both
 * are reproduced as they stand.
 */
export const rescoreChunk = internalMutation({
  args: {
    jobId: v.id("jobs"),
    problemId: v.id("problems"),
    cursor: v.union(v.string(), v.null()),
    done: v.number(),
    profileIds: v.array(v.id("profiles")),
  },
  handler: async (ctx, args): Promise<null> => {
    const job = await advance(ctx, args.jobId, args.done, "Modifying submissions");
    if (!job) return null;

    const problem = await ctx.db.get(args.problemId);
    if (!problem) {
      await failJob(ctx, args.jobId, "problem vanished");
      return null;
    }

    const page = await ctx.db
      .query("submissions")
      .withIndex("by_problem_date", (q) => q.eq("problemId", args.problemId))
      .paginate({ numItems: JOB_CHUNK_SIZE, cursor: args.cursor });

    let done = args.done;
    const profileIds = new Set<Id<"profiles">>(args.profileIds);
    const participationIds = new Set<Id<"contestParticipations">>();

    for (const submission of page.page) {
      let points = pyRound(
        submission.caseTotal ? (submission.casePoints / submission.caseTotal) * problem.points : 0,
        1,
      );
      if (!problem.partial && points < problem.points) points = 0;
      if (submission.points !== points) await ctx.db.patch(submission._id, { points });
      if (submission.participationId) participationIds.add(submission.participationId);
      profileIds.add(submission.profileId);
      done += 1;
    }

    for (const participationId of participationIds) {
      await recomputeParticipation(ctx, participationId);
    }
    await advance(ctx, args.jobId, done);

    if (page.isDone) {
      await ctx.scheduler.runAfter(0, internal.jobs.rescoreProfilesChunk, {
        jobId: args.jobId,
        problemId: args.problemId,
        profileIds: [...profileIds],
        index: 0,
        rescored: done,
      });
      return null;
    }
    await ctx.scheduler.runAfter(0, internal.jobs.rescoreChunk, {
      ...args,
      cursor: page.continueCursor,
      done,
      profileIds: [...profileIds],
    });
    return null;
  },
});

/** `rescore_problem`, second phase: recalculate the affected users' points. */
export const rescoreProfilesChunk = internalMutation({
  args: {
    jobId: v.id("jobs"),
    problemId: v.id("problems"),
    profileIds: v.array(v.id("profiles")),
    index: v.number(),
    rescored: v.number(),
  },
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    await ctx.db.patch(args.jobId, {
      status: "running",
      progress: {
        done: args.index,
        total: args.profileIds.length,
        stage: "Recalculating user points",
      },
    });

    // Profile recomputes walk a whole submission history, so they go a few at a
    // time rather than a hundred.
    const batch = 10;
    const end = Math.min(args.index + batch, args.profileIds.length);
    for (let i = args.index; i < end; i++) {
      await recomputeProfilePoints(ctx, args.profileIds[i] as Id<"profiles">);
    }

    if (end >= args.profileIds.length) {
      await ctx.db.patch(args.jobId, {
        progress: {
          done: args.profileIds.length,
          total: args.profileIds.length,
          stage: "Recalculating user points",
        },
      });
      await finishJob(ctx, args.jobId, {
        rescored: args.rescored,
        users: args.profileIds.length,
      });
      return null;
    }

    await ctx.scheduler.runAfter(0, internal.jobs.rescoreProfilesChunk, { ...args, index: end });
    return null;
  },
});

/** Used by the admin mutations to fail fast on a problem code that does not exist. */
export async function problemByCode(ctx: QueryCtx, code: string): Promise<Doc<"problems">> {
  const problem = await ctx.db
    .query("problems")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
  if (!problem) throw notFound("Problem");
  return problem;
}
