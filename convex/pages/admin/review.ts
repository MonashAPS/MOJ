/**
 * The console's review queue: submissions to staff-scored problems that are
 * waiting for their score, oldest first, narrowed to the ones the viewer may
 * score. Scoring itself is `submissions.review`.
 */

import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { query } from "../../_generated/server";
import { mayReview, reviewOutOf } from "../../submissions";
import { staffViewer } from "./console";

export type ReviewQueueRow = {
  id: Id<"submissions">;
  displayId: number | string;
  date: number;
  username: string;
  problemCode: string;
  problemName: string;
  contestKey: string | null;
  contestName: string | null;
  language: string;
  outOf: number;
};

export type ReviewQueue = {
  rows: ReviewQueueRow[];
  /** The problems and contests with something waiting, for the filters. */
  problems: Array<{ code: string; name: string; count: number }>;
  contests: Array<{ key: string; name: string; count: number }>;
  /** More were waiting than one read looks at. */
  truncated: boolean;
};

/** How many waiting submissions one read looks at. */
export const REVIEW_QUEUE_SCAN = 500;

export const queue = query({
  args: { problemCode: v.optional(v.string()), contestKey: v.optional(v.string()) },
  handler: async (ctx, args): Promise<ReviewQueue | null> => {
    const viewer = await staffViewer(ctx);

    if (!viewer) return null;

    const waiting = await ctx.db
      .query("submissions")
      .withIndex("by_status_priority", (q) => q.eq("status", "RV"))
      .take(REVIEW_QUEUE_SCAN + 1);

    const truncated = waiting.length > REVIEW_QUEUE_SCAN;
    const problems = new Map<Id<"problems">, Doc<"problems"> | null>();
    const contests = new Map<Id<"contests">, Doc<"contests"> | null>();
    const problemCounts = new Map<string, { code: string; name: string; count: number }>();
    const contestCounts = new Map<string, { key: string; name: string; count: number }>();
    const rows: ReviewQueueRow[] = [];

    for (const submission of waiting.slice(0, REVIEW_QUEUE_SCAN)) {
      if (!problems.has(submission.problemId)) {
        problems.set(submission.problemId, await ctx.db.get(submission.problemId));
      }

      const problem = problems.get(submission.problemId);

      if (!problem) continue;

      const contestId = submission.contestId;

      if (contestId && !contests.has(contestId)) contests.set(contestId, await ctx.db.get(contestId));
      const contest = contestId ? (contests.get(contestId) ?? null) : null;

      if (!mayReview(viewer.core, problem, contest)) continue;

      const problemCount = problemCounts.get(problem.code) ?? {
        code: problem.code,
        name: problem.name,
        count: 0,
      };

      problemCount.count += 1;
      problemCounts.set(problem.code, problemCount);

      if (contest) {
        const contestCount = contestCounts.get(contest.key) ?? {
          key: contest.key,
          name: contest.name,
          count: 0,
        };

        contestCount.count += 1;
        contestCounts.set(contest.key, contestCount);
      }

      if (args.problemCode && problem.code !== args.problemCode) continue;

      if (args.contestKey && contest?.key !== args.contestKey) continue;

      const author = await ctx.db.get(submission.profileId);
      const language = await ctx.db.get(submission.languageId);

      rows.push({
        id: submission._id,
        displayId: submission.legacyId ?? submission._id,
        date: submission.date,
        username: author?.username ?? "",
        problemCode: problem.code,
        problemName: problem.name,
        contestKey: contest?.key ?? null,
        contestName: contest?.name ?? null,
        language: language?.name ?? "",
        outOf: await reviewOutOf(ctx, submission, problem),
      });
    }

    // Oldest first, whichever index order the scan came back in.
    rows.sort((a, b) => a.date - b.date);

    return {
      rows,
      problems: [...problemCounts.values()].sort((a, b) => a.code.localeCompare(b.code)),
      contests: [...contestCounts.values()].sort((a, b) => a.key.localeCompare(b.key)),
      truncated,
    };
  },
});
