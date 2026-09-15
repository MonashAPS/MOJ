/**
 * The console's submission list: `SubmissionAdmin.get_queryset` with DMOJ's
 * list filters plus the id range and judge the batch tools need.
 */

import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { query } from "../../_generated/server";
import { contestByKey } from "../../contests/formats";
import { problemByCode } from "../../problems";
import { staffViewer } from "./console";

export type AdminSubmissionRow = {
  id: Id<"submissions">;
  legacyId: number | null;
  displayId: number | string;
  date: number;
  username: string;
  problemCode: string;
  problemName: string;
  language: string;
  status: string;
  result: string | null;
  points: number | null;
  total: number;
  time: number | null;
  memory: number | null;
  judge: string | null;
  contestKey: string | null;
  isLocked: boolean;
};

/**
 * `SubmissionAdmin.get_queryset` with DMOJ's list filters plus the id range and
 * judge the console's batch tools need. Staff only, because it ignores every
 * per-problem visibility rule the public list applies.
 */
export const list = query({
  args: {
    username: v.optional(v.string()),
    problemCode: v.optional(v.string()),
    contestKey: v.optional(v.string()),
    languageKeys: v.optional(v.array(v.string())),
    results: v.optional(v.array(v.string())),
    status: v.optional(v.string()),
    judgeName: v.optional(v.string()),
    idFrom: v.optional(v.number()),
    idTo: v.optional(v.number()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ items: AdminSubmissionRow[]; total: number; page: number; pageSize: number }> => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return { items: [], total: 0, page: 1, pageSize: 0 };

    const page = Math.max(1, Math.floor(args.page ?? 1));
    const pageSize = Math.max(1, Math.min(Math.floor(args.pageSize ?? 50), 200));

    const profile = args.username
      ? await ctx.db
          .query("profiles")
          .withIndex("by_username", (q) => q.eq("username", args.username as string))
          .unique()
      : null;
    const problem = args.problemCode ? await problemByCode(ctx, args.problemCode) : null;
    const contest = args.contestKey ? await contestByKey(ctx, args.contestKey) : null;
    const judge = args.judgeName
      ? await ctx.db
          .query("judges")
          .withIndex("by_name", (q) => q.eq("name", args.judgeName as string))
          .unique()
      : null;
    if (
      (args.username && !profile) ||
      (args.problemCode && !problem) ||
      (args.contestKey && !contest) ||
      (args.judgeName && !judge)
    ) {
      return { items: [], total: 0, page, pageSize };
    }

    const languageIds = new Set<string>();
    for (const key of args.languageKeys ?? []) {
      const row = await ctx.db
        .query("languages")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (row) languageIds.add(row._id as string);
    }
    if ((args.languageKeys?.length ?? 0) > 0 && languageIds.size === 0) {
      return { items: [], total: 0, page, pageSize };
    }
    const results = new Set(args.results ?? []);

    const source = problem
      ? ctx.db.query("submissions").withIndex("by_problem_date", (q) => q.eq("problemId", problem._id))
      : profile
        ? ctx.db.query("submissions").withIndex("by_profile_date", (q) => q.eq("profileId", profile._id))
        : contest
          ? ctx.db.query("submissions").withIndex("by_contest_date", (q) => q.eq("contestId", contest._id))
          : ctx.db.query("submissions").withIndex("by_date");

    const scanned = await source.order("desc").take(20_000);
    const matched = scanned.filter((submission) => {
      if (profile && submission.profileId !== profile._id) return false;
      if (problem && submission.problemId !== problem._id) return false;
      if (contest && submission.contestId !== contest._id) return false;
      if (judge && submission.judgedOnJudgeId !== judge._id) return false;
      if (languageIds.size > 0 && !languageIds.has(submission.languageId as string)) return false;
      if (results.size > 0 && !(submission.result && results.has(submission.result))) return false;
      if (args.status && submission.status !== args.status) return false;
      const id = submission.legacyId ?? null;
      if (args.idFrom !== undefined && (id === null || id < args.idFrom)) return false;
      if (args.idTo !== undefined && (id === null || id > args.idTo)) return false;
      return true;
    });
    matched.sort((a, b) => b.date - a.date);

    const items: AdminSubmissionRow[] = [];
    for (const submission of matched.slice((page - 1) * pageSize, page * pageSize)) {
      const [author, problemRow, language, judgeRow, contestRow] = await Promise.all([
        ctx.db.get(submission.profileId),
        ctx.db.get(submission.problemId),
        ctx.db.get(submission.languageId),
        submission.judgedOnJudgeId ? ctx.db.get(submission.judgedOnJudgeId) : Promise.resolve(null),
        submission.contestId ? ctx.db.get(submission.contestId) : Promise.resolve(null),
      ]);
      items.push({
        id: submission._id,
        legacyId: submission.legacyId ?? null,
        displayId: submission.legacyId ?? submission._id,
        date: submission.date,
        username: author?.username ?? "",
        problemCode: problemRow?.code ?? "",
        problemName: problemRow?.name ?? "",
        language: language?.shortName || language?.name || "",
        status: submission.status,
        result: submission.result ?? null,
        points: submission.points ?? null,
        total: problemRow?.points ?? 0,
        time: submission.time ?? null,
        memory: submission.memory ?? null,
        judge: judgeRow?.name ?? null,
        contestKey: contestRow?.key ?? null,
        isLocked: submission.lockedAfter !== undefined,
      });
    }
    return { items, total: matched.length, page, pageSize };
  },
});
