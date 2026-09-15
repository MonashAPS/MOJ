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
import { forbidden } from "./lib/errors";

/** How many submissions one scheduled step touches, per SPEC section 6. */
export const JOB_CHUNK_SIZE = 100;
/**
 * A job's `total` is counted up front so the progress bar has a denominator.
 * The count is one transaction, so it is capped; a bigger job still runs, its
 * progress just pins at the cap.
 */
export const JOB_COUNT_LIMIT = 20_000;

export type JobType =
  | "rejudge"
  | "rescore"
  | "rescoreContest"
  | "rateContest"
  | "rejudgeContestProblem"
  | "moss"
  | "userExport"
  | "pdf"
  | "sitemap";

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

/** Marks a queued job running under the stage it is about to work through. */
export async function startJob(ctx: MutationCtx, jobId: Id<"jobs">, stage: string): Promise<void> {
  const job = await ctx.db.get(jobId);
  if (!job) return;
  if (job.status === "queued") {
    await ctx.db.patch(jobId, { status: "running", progress: { ...job.progress, stage } });
  }
}

export async function advance(
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

/** A finished job reads as complete: the bar is filled to its own total. */
export async function finishJob(ctx: MutationCtx, jobId: Id<"jobs">, result: unknown): Promise<void> {
  const job = await ctx.db.get(jobId);
  if (!job) return;
  const total = Math.max(job.progress.total, job.progress.done);
  await ctx.db.patch(jobId, {
    status: "done",
    result,
    finishedAt: Date.now(),
    progress: { ...job.progress, total, done: total },
  });
}

export async function failJob(ctx: MutationCtx, jobId: Id<"jobs">, error: string): Promise<void> {
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

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                   */
/* -------------------------------------------------------------------------- */

type JobArgs = Record<string, unknown>;

function jobArgs(job: Doc<"jobs">): JobArgs {
  return (job.args ?? {}) as JobArgs;
}

async function resolveProblemId(ctx: MutationCtx, args: JobArgs): Promise<Id<"problems"> | null> {
  if (typeof args.problemId === "string") return args.problemId as Id<"problems">;
  if (typeof args.problemCode === "string") {
    const problem = await ctx.db
      .query("problems")
      .withIndex("by_code", (q) => q.eq("code", args.problemCode as string))
      .unique();
    return problem?._id ?? null;
  }
  return null;
}

async function resolveLanguageIds(ctx: MutationCtx, args: JobArgs): Promise<Id<"languages">[]> {
  if (Array.isArray(args.languageIds)) return args.languageIds as Id<"languages">[];
  const keys = Array.isArray(args.languages) ? (args.languages as string[]) : [];
  const ids: Id<"languages">[] = [];
  for (const key of keys) {
    const row = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (row) ids.push(row._id);
  }
  return ids;
}

function resolveIdRange(args: JobArgs): [number, number] | undefined {
  const raw = args.idRange;
  if (!raw) return undefined;
  if (Array.isArray(raw) && raw.length === 2) return [Number(raw[0]), Number(raw[1])];
  const range = raw as { start?: number; end?: number };
  if (typeof range.start === "number" && typeof range.end === "number") return [range.start, range.end];
  return undefined;
}

/**
 * The one entry point a queued `jobs` row is started through. Modules that
 * cannot import a runner (`admin/problems.ts` schedules `"jobs:run"` by name)
 * insert the row and schedule this; it reads `type` off the document and hands
 * the work to the chunk runner that owns it.
 */
export const run = internalMutation({
  args: {
    jobId: v.id("jobs"),
    type: v.optional(v.string()),
    args: v.optional(v.any()),
  },
  handler: async (ctx, params): Promise<null> => {
    const job = await ctx.db.get(params.jobId);
    if (!job) return null;
    if (job.status === "done" || job.status === "failed") return null;

    const jobId = job._id;
    const type = params.type ?? job.type;
    const args: JobArgs = { ...jobArgs(job), ...((params.args ?? {}) as JobArgs) };
    const contestId = typeof args.contestId === "string" ? (args.contestId as Id<"contests">) : null;

    switch (type) {
      case "rejudge": {
        if (contestId && typeof args.contestProblemId === "string") {
          await ctx.scheduler.runAfter(0, internal.jobs.contests.rejudgeContestProblemChunk, {
            jobId,
            contestId,
            contestProblemId: args.contestProblemId as Id<"contestProblems">,
            cursor: 0,
          });
          return null;
        }
        const problemId = await resolveProblemId(ctx, args);
        if (!problemId) {
          await failJob(ctx, jobId, "The problem no longer exists.");
          return null;
        }
        const filter: RejudgeFilter = {
          problemId,
          idRange: resolveIdRange(args),
          languageIds: await resolveLanguageIds(ctx, args),
          results: Array.isArray(args.results) ? (args.results as string[]) : [],
          archiveLocked: args.archiveLocked === true,
        };
        const total = await countMatching(ctx, problemId, filter, Date.now());
        await ctx.db.patch(jobId, {
          status: "running",
          progress: { done: 0, total, stage: "Rejudging submissions" },
        });
        await ctx.scheduler.runAfter(0, internal.jobs.rejudgeChunk, {
          jobId,
          problemId,
          filter: {
            problemId,
            idRange: filter.idRange,
            languageIds: filter.languageIds,
            results: filter.results,
            archiveLocked: filter.archiveLocked,
          },
          cursor: null,
          done: 0,
          rejudged: 0,
          archived: 0,
        });
        return null;
      }

      case "rescore": {
        if (contestId) return await runContestRescore(ctx, jobId, contestId);
        const problemId = await resolveProblemId(ctx, args);
        if (!problemId) {
          await failJob(ctx, jobId, "The problem no longer exists.");
          return null;
        }
        const rows = await ctx.db
          .query("submissions")
          .withIndex("by_problem_date", (q) => q.eq("problemId", problemId))
          .take(JOB_COUNT_LIMIT);
        await ctx.db.patch(jobId, {
          status: "running",
          progress: { done: 0, total: rows.length, stage: "Modifying submissions" },
        });
        await ctx.scheduler.runAfter(0, internal.jobs.rescoreChunk, {
          jobId,
          problemId,
          cursor: null,
          done: 0,
          profileIds: [],
        });
        return null;
      }

      case "rescoreContest":
        return await runContestRescore(ctx, jobId, contestId);

      case "rateContest": {
        if (!contestId) {
          await failJob(ctx, jobId, "The contest no longer exists.");
          return null;
        }
        await ctx.scheduler.runAfter(0, internal.jobs.contests.rateContestJob, { jobId, contestId });
        return null;
      }

      case "rejudgeContestProblem": {
        if (!contestId || typeof args.contestProblemId !== "string") {
          await failJob(ctx, jobId, "The contest problem no longer exists.");
          return null;
        }
        await ctx.scheduler.runAfter(0, internal.jobs.contests.rejudgeContestProblemChunk, {
          jobId,
          contestId,
          contestProblemId: args.contestProblemId as Id<"contestProblems">,
          cursor: 0,
        });
        return null;
      }

      case "moss": {
        if (!contestId) {
          await failJob(ctx, jobId, "The contest no longer exists.");
          return null;
        }
        await ctx.scheduler.runAfter(0, internal.jobs.contests.mossJob, { jobId, contestId });
        return null;
      }

      case "userExport": {
        await ctx.scheduler.runAfter(0, internal.jobs.users.run, { jobId });
        return null;
      }

      // `pdf` and `sitemap` are rendered by the web app, not by Convex: the job
      // row exists so the console can show that one was asked for.
      case "pdf":
      case "sitemap": {
        await ctx.db.patch(jobId, {
          status: "running",
          progress: { ...job.progress, stage: type === "pdf" ? "Rendering PDF" : "Building sitemap" },
        });
        await finishJob(ctx, jobId, { skipped: true, reason: `${type} is rendered by the web app` });
        return null;
      }

      default:
        await failJob(ctx, jobId, `Unknown job type "${type}".`);
        return null;
    }
  },
});

async function runContestRescore(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  contestId: Id<"contests"> | null,
): Promise<null> {
  if (!contestId) {
    await failJob(ctx, jobId, "The contest no longer exists.");
    return null;
  }
  const participations = await ctx.db
    .query("contestParticipations")
    .withIndex("by_contest_virtual_score", (q) => q.eq("contestId", contestId))
    .collect();
  await ctx.db.patch(jobId, {
    status: "running",
    progress: { done: 0, total: participations.length, stage: "Recalculating contest scores" },
  });
  await ctx.scheduler.runAfter(0, internal.jobs.contests.rescoreChunk, { jobId, contestId, cursor: 0 });
  return null;
}
