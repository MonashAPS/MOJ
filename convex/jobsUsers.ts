/**
 * The `userExport` job: `/data/prepare/`.
 *
 * Ports `judge/tasks/user.py:prepare_user_data`, including the zip layout
 * (`submissions/<id>.<ext>`, `submissions/info.json`, `comments/<id>.txt`,
 * `comments/info.json`) and the two progress stages. The zip lands in Convex
 * storage and the job result carries the storage id, which `/data/download/`
 * turns into a signed URL.
 */

import { v } from "convex/values";
import { strToU8, zipSync } from "fflate";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";

/** How many submissions are read (and zipped) per scheduler slice. */
const CHUNK = 200;

export type ExportArgs = {
  profileId: Id<"profiles">;
  submissionDownload: boolean;
  commentDownload: boolean;
  submissionProblemGlob: string;
  submissionResults: string[];
};

/** `judge/tasks/user.py` compresses runs of `*` before translating the glob. */
export function globToRegExp(glob: string): RegExp {
  const compressed = glob.replace(/\*+/g, "*");
  let source = "";
  for (const character of compressed) {
    if (character === "*") source += ".*";
    else if (character === "?") source += ".";
    else source += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

const RELATED_OBJECT: Record<string, string> = {
  blog: "blog post",
  contest: "contest",
  problem: "problem",
  solution: "problem editorial",
};

export type ExportSubmission = {
  id: Id<"submissions">;
  legacyId?: number;
  problem: string;
  date: number;
  time: number | null;
  memory: number | null;
  language: string;
  extension: string;
  status: string;
  result: string | null;
  casePoints: number;
  caseTotal: number;
  source: string;
};

export type ExportComment = {
  id: Id<"comments">;
  legacyId?: number;
  date: number;
  relatedObject: string;
  page: string;
  score: number;
  body: string;
};

export type ExportPayload = {
  username: string;
  submissions: ExportSubmission[];
  comments: ExportComment[];
};

export const loadExport = internalQuery({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<ExportPayload | null> => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    const args = job.args as ExportArgs;
    const profile = await ctx.db.get(args.profileId);
    if (!profile) return null;

    const matcher =
      args.submissionProblemGlob && args.submissionProblemGlob !== "*"
        ? globToRegExp(args.submissionProblemGlob)
        : null;
    const wantedResults = new Set(args.submissionResults);

    const submissions: ExportSubmission[] = [];

    if (args.submissionDownload) {
      const rows = await ctx.db
        .query("submissions")
        .withIndex("by_profile_date", (q) => q.eq("profileId", args.profileId))
        .collect();
      for (const row of rows) {
        if (wantedResults.size > 0 && !(row.result && wantedResults.has(row.result))) continue;
        const problem = await ctx.db.get(row.problemId);
        if (!problem) continue;
        if (matcher && !matcher.test(problem.code)) continue;
        const language = await ctx.db.get(row.languageId);
        const source = await ctx.db
          .query("submissionSources")
          .withIndex("by_submission", (q) => q.eq("submissionId", row._id))
          .unique();
        submissions.push({
          id: row._id,
          legacyId: row.legacyId,
          problem: problem.code,
          date: row.date,
          time: row.time ?? null,
          memory: row.memory ?? null,
          language: language?.key ?? "",
          extension: language?.extension ?? "txt",
          status: row.status,
          result: row.result ?? null,
          casePoints: row.casePoints,
          caseTotal: row.caseTotal,
          source: source?.source ?? "",
        });
      }
    }

    const comments: ExportComment[] = [];

    if (args.commentDownload) {
      const rows = await ctx.db
        .query("comments")
        .withIndex("by_author", (q) => q.eq("authorProfileId", args.profileId))
        .collect();
      for (const row of rows) {
        comments.push({
          id: row._id,
          legacyId: row.legacyId,
          date: row.time,
          relatedObject: RELATED_OBJECT[row.targetType] ?? row.targetType,
          page: row.targetKey,
          score: row.score,
          body: row.body,
        });
      }
    }

    return { username: profile.username, submissions, comments };
  },
});

export const setProgress = internalMutation({
  args: {
    jobId: v.id("jobs"),
    status: v.optional(
      v.union(v.literal("queued"), v.literal("running"), v.literal("done"), v.literal("failed")),
    ),
    progress: v.optional(v.object({ done: v.number(), total: v.number(), stage: v.string() })),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    finished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const patch: Partial<Doc<"jobs">> = {};
    if (args.status !== undefined) patch.status = args.status;
    if (args.progress !== undefined) patch.progress = args.progress;
    if (args.result !== undefined) patch.result = args.result;
    if (args.error !== undefined) patch.error = args.error;
    if (args.finished) patch.finishedAt = Date.now();
    await ctx.db.patch(args.jobId, patch);
  },
});

export const recordUpload = internalMutation({
  args: {
    jobId: v.id("jobs"),
    storageId: v.id("_storage"),
    name: v.string(),
    profileId: v.id("profiles"),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("uploads", {
      storageId: args.storageId,
      uploaderProfileId: args.profileId,
      kind: "export",
      name: args.name,
      createdAt: Date.now(),
      cacheKey: `userExport:${args.profileId}`,
    });
  },
});

export const run = internalAction({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<{ storageId: Id<"_storage">; count: number }> => {
    await ctx.runMutation(internal.jobsUsers.setProgress, {
      jobId,
      status: "running",
      progress: { done: 0, total: 2, stage: "Applying filters" },
    });

    try {
      const data: ExportPayload | null = await ctx.runQuery(internal.jobsUsers.loadExport, {
        jobId,
      });
      if (!data) throw new Error("job or profile is gone");

      await ctx.runMutation(internal.jobsUsers.setProgress, {
        jobId,
        progress: { done: 2, total: 2, stage: "Applying filters" },
      });

      const files: Record<string, Uint8Array> = {};

      if (data.submissions.length > 0) {
        const total = data.submissions.length;
        const submissionInfo: Record<string, unknown> = {};
        let prepared = 0;
        for (const submission of data.submissions) {
          const key = String(submission.legacyId ?? submission.id);
          submissionInfo[key] = {
            problem: submission.problem,
            date: new Date(submission.date).toISOString(),
            time: submission.time,
            memory: submission.memory,
            language: submission.language,
            status: submission.status,
            result: submission.result,
            case_points: submission.casePoints,
            case_total: submission.caseTotal,
          };
          files[`submissions/${key}.${submission.extension}`] = strToU8(submission.source);
          prepared += 1;
          if (prepared % CHUNK === 0) {
            await ctx.runMutation(internal.jobsUsers.setProgress, {
              jobId,
              progress: { done: prepared, total, stage: "Preparing your submission data" },
            });
          }
        }
        files["submissions/info.json"] = strToU8(sortedJson(submissionInfo));
        await ctx.runMutation(internal.jobsUsers.setProgress, {
          jobId,
          progress: { done: total, total, stage: "Preparing your submission data" },
        });
      }

      if (data.comments.length > 0) {
        const total = data.comments.length;
        const commentInfo: Record<string, unknown> = {};
        let prepared = 0;
        for (const comment of data.comments) {
          const key = String(comment.legacyId ?? comment.id);
          commentInfo[key] = {
            date: new Date(comment.date).toISOString(),
            related_object: comment.relatedObject,
            page: comment.page,
            score: comment.score,
          };
          files[`comments/${key}.txt`] = strToU8(comment.body);
          prepared += 1;
          if (prepared % CHUNK === 0) {
            await ctx.runMutation(internal.jobsUsers.setProgress, {
              jobId,
              progress: { done: prepared, total, stage: "Preparing your comment data" },
            });
          }
        }
        files["comments/info.json"] = strToU8(sortedJson(commentInfo));
        await ctx.runMutation(internal.jobsUsers.setProgress, {
          jobId,
          progress: { done: total, total, stage: "Preparing your comment data" },
        });
      }

      const zipped = zipSync(files, { level: 6 });
      const blob = new Blob([zipped as BlobPart], { type: "application/zip" });
      const storageId = await ctx.storage.store(blob);
      const name = `${data.username}-data.zip`;

      const profileId: Id<"profiles"> | null = await ctx.runQuery(internal.jobsUsers.exportProfileId, {
        jobId,
      });
      if (profileId) {
        await ctx.runMutation(internal.jobsUsers.recordUpload, {
          jobId,
          storageId,
          name,
          profileId,
        });
      }

      await ctx.runMutation(internal.jobsUsers.setProgress, {
        jobId,
        status: "done",
        result: {
          storageId,
          name,
          submissionCount: data.submissions.length,
          commentCount: data.comments.length,
        },
        finished: true,
      });
      return { storageId, count: data.submissions.length + data.comments.length };
    } catch (error) {
      await ctx.runMutation(internal.jobsUsers.setProgress, {
        jobId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        finished: true,
      });
      throw error;
    }
  },
});

export const exportProfileId = internalQuery({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<Id<"profiles"> | null> => {
    const job = await ctx.db.get(jobId);
    return job ? ((job.args as ExportArgs).profileId ?? null) : null;
  },
});

/** `json.dumps(..., sort_keys=True, indent=4)`. */
export function sortedJson(value: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = value[key];
  return JSON.stringify(sorted, null, 4);
}
