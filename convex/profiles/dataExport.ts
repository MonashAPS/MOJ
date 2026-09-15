/**
 * `/data/prepare/`: the archive of their own submissions and comments a user
 * can ask for, once a day. The work happens in a `userExport` job; these are
 * the request and the status behind the page's progress bar.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, type QueryCtx, query } from "../_generated/server";
import { requireViewer } from "../lib/auth";
import { forbidden, invalid, mojError } from "../lib/errors";

/** `settings.DMOJ_USER_DATA_DOWNLOAD_RATELIMIT`. */
export const DATA_DOWNLOAD_RATELIMIT_MS = 24 * 60 * 60 * 1000;

export const dataExportOptions = v.object({
  submissionDownload: v.boolean(),
  commentDownload: v.boolean(),
  submissionProblemGlob: v.optional(v.string()),
  submissionResults: v.optional(v.array(v.string())),
});

export type DataExportStatus = {
  canPrepare: boolean;
  msUntilCanPrepare: number;
  rateLimitMs: number;
  job: {
    _id: Id<"jobs">;
    status: "queued" | "running" | "done" | "failed";
    progress: { done: number; total: number; stage: string };
    error?: string;
    createdAt: number;
    finishedAt?: number;
  } | null;
  download: { storageId: Id<"_storage">; name: string; createdAt: number } | null;
};

async function latestExportJob(ctx: QueryCtx, profileId: Id<"profiles">): Promise<Doc<"jobs"> | null> {
  return await ctx.db
    .query("jobs")
    .withIndex("by_creator_type_createdAt", (q) =>
      q.eq("createdByProfileId", profileId).eq("type", "userExport"),
    )
    .order("desc")
    .first();
}

export const status = query({
  args: {},
  handler: async (ctx): Promise<DataExportStatus> => {
    const profile = await requireViewer(ctx);
    const job = await latestExportJob(ctx, profile._id);
    const now = Date.now();

    const last = profile.dataLastDownloaded;
    const msUntilCanPrepare = last === undefined ? 0 : Math.max(0, last + DATA_DOWNLOAD_RATELIMIT_MS - now);
    const running = job?.status === "queued" || job?.status === "running";

    let download: DataExportStatus["download"] = null;

    if (job?.status === "done" && job.result?.storageId) {
      download = {
        storageId: job.result.storageId as Id<"_storage">,
        name: `${profile.username}-data.zip`,
        createdAt: job.finishedAt ?? job.createdAt,
      };
    }

    return {
      canPrepare: !profile.mute && msUntilCanPrepare === 0 && !running,
      msUntilCanPrepare,
      rateLimitMs: DATA_DOWNLOAD_RATELIMIT_MS,
      job: job
        ? {
            _id: job._id,
            status: job.status,
            progress: job.progress,
            error: job.error,
            createdAt: job.createdAt,
            finishedAt: job.finishedAt,
          }
        : null,
      download,
    };
  },
});

/** `UserPrepareData.form_valid`, with `DownloadDataForm`'s validation. */
export const prepare = mutation({
  args: { options: dataExportOptions },
  handler: async (ctx, { options }): Promise<Id<"jobs">> => {
    const profile = await requireViewer(ctx);

    if (profile.mute) throw forbidden("Your part is silent, little toad.");

    if (!options.submissionDownload && !options.commentDownload) {
      throw invalid("Please select at least one thing to download.");
    }

    const now = Date.now();
    const last = profile.dataLastDownloaded;

    if (last !== undefined && last + DATA_DOWNLOAD_RATELIMIT_MS > now) {
      throw mojError("RATE_LIMITED", "You may only prepare your data once a day.");
    }

    const existing = await latestExportJob(ctx, profile._id);

    if (existing && (existing.status === "queued" || existing.status === "running")) {
      throw mojError("CONFLICT", "Your data is already being prepared.");
    }

    const jobId = await ctx.db.insert("jobs", {
      type: "userExport",
      status: "queued",
      progress: { done: 0, total: 2, stage: "Applying filters" },
      args: {
        profileId: profile._id,
        submissionDownload: options.submissionDownload,
        commentDownload: options.commentDownload,
        submissionProblemGlob: options.submissionDownload ? (options.submissionProblemGlob ?? "*") : "*",
        submissionResults: options.submissionDownload ? (options.submissionResults ?? []) : [],
      },
      createdByProfileId: profile._id,
      createdAt: now,
    });

    await ctx.db.patch(profile._id, { dataLastDownloaded: now });
    await ctx.scheduler.runAfter(0, internal.jobs.users.run, { jobId });

    return jobId;
  },
});
