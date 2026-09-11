/**
 * What the submission pages need on top of `convex/submissions.ts`.
 *
 * `submissions.list`, `submissions.detail` and `submissions.source` already
 * answer the rows, the cases and the source. These queries answer the rest of
 * DMOJ's context: the filter panel's options (`get_searchable_status_codes`),
 * the tab links and titles each list view computes, the header of
 * `submission/status.html` (the judge, the effective time limit, the maximum
 * single-case runtime) and the permission flags the templates read off
 * `perms.judge.*`.
 */

import {
  canSeeSubmissionDetail,
  contestCanSeeFullScoreboard,
  hasPerm as coreHasPerm,
  isStaff as coreIsStaff,
  isSuperuser as coreIsSuperuser,
  isLocked,
  problemIsAccessibleBy,
  problemIsEditableBy,
  problemIsVisibleTo,
  resolveSubmissionSourceVisibility,
  SUBMISSION_RESULTS,
  USER_DISPLAY_CODES,
} from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { type QueryCtx, query } from "../_generated/server";
import { resolveSubmission } from "../judging";
import { globalSourceVisibility, siteSettings } from "../lib/community";
import { coreContest, coreProblem, viewerContext } from "../submissions";

/* -------------------------------------------------------------------------- */
/* Filter options                                                             */
/* -------------------------------------------------------------------------- */

/** `SubmissionsListBase.get_searchable_status_codes`: `SC` is never searchable,
 *  and `IE` only for staff. */
function searchableStatusCodes(isStaff: boolean): Array<{ code: string; name: string }> {
  const hidden = new Set<string>(["SC"]);
  if (!isStaff) hidden.add("IE");
  return SUBMISSION_RESULTS.filter((code) => !hidden.has(code)).map((code) => ({
    code,
    name: USER_DISPLAY_CODES[code] ?? code,
  }));
}

/* -------------------------------------------------------------------------- */
/* List context                                                               */
/* -------------------------------------------------------------------------- */

export type SubmissionListContext = {
  /** `null` when a named user, problem or contest does not exist. */
  found: boolean;
  /** The viewer may not open this list at all (`access_check`). */
  allowed: boolean;
  viewer: {
    username: string;
    canRejudge: boolean;
    canAbortAny: boolean;
    canViewAllSubmissions: boolean;
    canEditAllProblems: boolean;
    isStaff: boolean;
  } | null;
  languages: Array<{ key: string; name: string }>;
  statuses: Array<{ code: string; name: string }>;
  user: {
    username: string;
    rating: number | null;
    displayRank: string;
    isSelf: boolean;
  } | null;
  problem: {
    code: string;
    name: string;
    editable: boolean;
  } | null;
  contest: {
    key: string;
    name: string;
    /** `ContestProblem.order`, DMOJ's problem number inside the contest. */
    problemNumber: number | null;
    canSeeFullScoreboard: boolean;
    isParticipant: boolean;
  } | null;
  /** The viewer is in contest mode, so every list is pinned to that contest. */
  inContestMode: boolean;
};

/**
 * The filter panel's options, the subject of the list and the permission flags
 * its rows read — one subscription for everything `submission/list.html` reads
 * out of its view's context.
 */
export const listContext = query({
  args: {
    username: v.optional(v.string()),
    problemCode: v.optional(v.string()),
    contestKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SubmissionListContext> => {
    const now = Date.now();
    const viewerCtx = await viewerContext(ctx);
    const viewer = viewerCtx.viewer;
    const staff = coreIsStaff(viewer);

    const languages = (await ctx.db.query("languages").collect())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => ({ key: row.key, name: row.name }));

    const base: SubmissionListContext = {
      found: true,
      allowed: true,
      viewer: viewerCtx.profile
        ? {
            username: viewerCtx.profile.username,
            canRejudge: coreHasPerm(viewer, "judge.rejudge_submission"),
            canAbortAny: coreHasPerm(viewer, "judge.abort_any_submission"),
            canViewAllSubmissions: coreHasPerm(viewer, "judge.view_all_submission"),
            canEditAllProblems: coreHasPerm(viewer, "judge.edit_all_problem"),
            isStaff: staff,
          }
        : null,
      languages,
      statuses: searchableStatusCodes(staff),
      user: null,
      problem: null,
      contest: null,
      inContestMode: viewerCtx.inContest,
    };

    if (args.username) {
      const author = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", args.username as string))
        .unique();
      if (!author) return { ...base, found: false };
      base.user = {
        username: author.username,
        rating: author.rating ?? null,
        displayRank: author.displayRank,
        isSelf: viewerCtx.profile?._id === author._id,
      };
    }

    let problem: Doc<"problems"> | null = null;
    if (args.problemCode) {
      problem = await ctx.db
        .query("problems")
        .withIndex("by_code", (q) => q.eq("code", args.problemCode as string))
        .unique();
      if (!problem) return { ...base, found: false };
      // `ProblemSubmissionsBase.access_check`.
      if (!problemIsAccessibleBy(coreProblem(problem), viewer)) {
        return { ...base, allowed: false };
      }
      base.problem = {
        code: problem.code,
        name: problem.name,
        editable: problemIsEditableBy(coreProblem(problem), viewer),
      };
    }

    if (args.contestKey) {
      const contest = await ctx.db
        .query("contests")
        .withIndex("by_key", (q) => q.eq("key", args.contestKey as string))
        .unique();
      if (!contest) return { ...base, found: false };

      // `ForceContestMixin.access_check`: an invisible or unstarted contest is a
      // 404 for anyone without `see_private_contest`.
      if (!coreHasPerm(viewer, "judge.see_private_contest")) {
        if (!contest.isVisible || contest.startTime > now) return { ...base, allowed: false };
      }

      let problemNumber: number | null = null;
      if (problem) {
        const contestProblem = (
          await ctx.db
            .query("contestProblems")
            .withIndex("by_contest_order", (q) => q.eq("contestId", contest._id))
            .collect()
        ).find((row) => row.problemId === problem?._id);
        problemNumber = contestProblem?.order ?? null;
        if (contestProblem === undefined) return { ...base, found: false };
      }

      let isParticipant = false;
      if (base.user) {
        const author = await ctx.db
          .query("profiles")
          .withIndex("by_username", (q) => q.eq("username", base.user?.username as string))
          .unique();
        if (author) {
          const participation = await ctx.db
            .query("contestParticipations")
            .withIndex("by_contest_profile", (q) =>
              q.eq("contestId", contest._id).eq("profileId", author._id),
            )
            .first();
          isParticipant = participation !== null;
        }
      }

      const full = contestCanSeeFullScoreboard(coreContest(contest), viewer, { now });
      base.contest = {
        key: contest.key,
        name: contest.name,
        problemNumber,
        canSeeFullScoreboard: full,
        isParticipant,
      };

      // `UserAllContestSubmissions.access_check`: the user has to have taken
      // part, and someone else's list needs the full scoreboard.
      if (!isParticipant) return { ...base, found: false };
      if (!base.user?.isSelf && !full) return { ...base, allowed: false };
    }

    return base;
  },
});

/* -------------------------------------------------------------------------- */
/* Status page                                                                */
/* -------------------------------------------------------------------------- */

export type SubmissionStatusExtras = {
  found: boolean;
  canSeeDetail: boolean;
  /** True when the problem's source visibility is "solvers only" and the viewer
   *  has not solved it — DMOJ's `SubmissionDetailBase.no_permission`. */
  solveToView: boolean;
  id: number | string;
  problem: { code: string; name: string; points: number };
  user: { username: string; rating: number | null; displayRank: string };
  language: { key: string; name: string; shortName: string; shikiLang: string; extension: string } | null;
  date: number;
  /** `Judge.name`, shown only to someone who can edit the problem. */
  judge: string | null;
  /** The problem's time limit with the language override applied. */
  timeLimit: number;
  /** `max_execution_time`: the slowest single case. */
  maxExecutionTime: number;
  isPretested: boolean;
  isLocked: boolean;
  /** `ContestProblem.output_prefix_override`; `null` means "no clipping". */
  outputPrefixOverride: number | null;
  contest: { key: string; name: string; points: number | null; total: number } | null;
  problemEditable: boolean;
  canAbort: boolean;
  canRejudge: boolean;
  canResubmit: boolean;
};

/**
 * The header and the footing of `submission/status.html`, plus the flags that
 * decide whether Abort, Rejudge and Resubmit are drawn. The cases themselves
 * come live from `submissions.detail`.
 */
export const statusExtras = query({
  args: { submissionId: v.union(v.string(), v.number()) },
  handler: async (ctx, args): Promise<SubmissionStatusExtras | null> => {
    const now = Date.now();
    const submission = await resolveSubmission(ctx, args.submissionId);
    if (!submission) return null;

    const viewerCtx = await viewerContext(ctx);
    const viewer = viewerCtx.viewer;

    const problem = await ctx.db.get(submission.problemId);
    const author = await ctx.db.get(submission.profileId);
    const language = await ctx.db.get(submission.languageId);
    if (!problem || !author) return null;

    const contest = submission.contestId ? await ctx.db.get(submission.contestId) : null;
    const solved = await hasSolvedProblem(ctx, viewer?.id as Id<"profiles"> | undefined, problem._id);
    const canSeeDetail = viewer
      ? canSeeSubmissionDetail({ profileId: submission.profileId }, viewer, {
          problem: coreProblem(problem),
          contest: contest ? coreContest(contest) : null,
          hasSolvedProblem: viewer.id === submission.profileId ? false : solved,
          globalSubmissionSourceVisibility: globalSourceVisibility(await siteSettings(ctx)),
        })
      : false;

    const problemEditable = problemIsEditableBy(coreProblem(problem), viewer);
    const locked = isLocked({ lockedAfter: submission.lockedAfter ?? null }, now);

    // `SubmissionStatus.get_context_data`: the language limit wins over the
    // problem's own.
    let timeLimit = problem.timeLimit;
    const limits = await ctx.db
      .query("languageLimits")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect();
    const limit = limits.find((row) => row.languageId === submission.languageId);
    if (limit) timeLimit = limit.timeLimit;

    const cases = await ctx.db
      .query("submissionTestCases")
      .withIndex("by_submission_case", (q) => q.eq("submissionId", submission._id))
      .collect();
    const maxExecutionTime = cases.reduce((slowest, row) => Math.max(slowest, row.time), 0);

    let contestProblem: Doc<"contestProblems"> | null = null;
    if (submission.contestProblemId) contestProblem = await ctx.db.get(submission.contestProblemId);

    const isOwn = viewerCtx.profile?._id === submission.profileId;

    return {
      found: true,
      canSeeDetail,
      solveToView:
        !canSeeDetail &&
        resolveSubmissionSourceVisibility(
          coreProblem(problem),
          globalSourceVisibility(await siteSettings(ctx)),
        ) === "S" &&
        problemIsAccessibleBy(coreProblem(problem), viewer),
      id: submission.legacyId ?? submission._id,
      problem: { code: problem.code, name: problem.name, points: problem.points },
      user: {
        username: author.username,
        rating: author.rating ?? null,
        displayRank: author.displayRank,
      },
      language: language
        ? {
            key: language.key,
            name: language.name,
            shortName: language.shortName || language.key,
            shikiLang: language.shikiLang,
            extension: language.extension,
          }
        : null,
      date: submission.date,
      judge:
        problemEditable && submission.judgedOnJudgeId
          ? ((await ctx.db.get(submission.judgedOnJudgeId))?.name ?? null)
          : null,
      timeLimit,
      maxExecutionTime,
      isPretested: submission.isPretested,
      isLocked: locked,
      outputPrefixOverride: contestProblem?.outputPrefixOverride ?? null,
      contest:
        contest && contestProblem
          ? {
              key: contest.key,
              name: contest.name,
              points: submission.contestPoints ?? null,
              total: contestProblem.points,
            }
          : null,
      problemEditable,
      // `abort_submission`: your own, not a rejudge, or the permission.
      canAbort:
        coreHasPerm(viewer, "judge.abort_any_submission") || (isOwn && submission.rejudgedDate === undefined),
      canRejudge: coreHasPerm(viewer, "judge.rejudge_submission") && (!locked || coreIsSuperuser(viewer)),
      canResubmit: isOwn || coreHasPerm(viewer, "judge.resubmit_other"),
    };
  },
});

/** `Problem.is_solved_by(user)`: an AC with full case points. */
async function hasSolvedProblem(
  ctx: QueryCtx,
  profileId: Id<"profiles"> | undefined,
  problemId: Id<"problems">,
): Promise<boolean> {
  if (!profileId) return false;
  const rows = await ctx.db
    .query("submissions")
    .withIndex("by_profile_problem", (q) => q.eq("profileId", profileId).eq("problemId", problemId))
    .collect();
  return rows.some((row) => row.result === "AC" && row.casePoints >= row.caseTotal && !row.isArchived);
}

/* -------------------------------------------------------------------------- */
/* Source page                                                                */
/* -------------------------------------------------------------------------- */

export type SubmissionSourceView = {
  canSeeSource: boolean;
  solveToView: boolean;
  id: number | string;
  source: string;
  problem: { code: string; name: string };
  user: { username: string; rating: number | null; displayRank: string };
  language: { key: string; name: string; shortName: string; shikiLang: string; extension: string } | null;
  date: number;
  judge: string | null;
  status: string;
  result: string | null;
  casePoints: number;
  caseTotal: number;
  points: number | null;
  problemPoints: number;
  isLocked: boolean;
  canRejudge: boolean;
  canResubmit: boolean;
};

/**
 * `/src/<id>` and `/src/<id>/raw`: the source with everything the header of
 * `submission/source.html` shows, in one read.
 */
export const sourceView = query({
  args: { submissionId: v.union(v.string(), v.number()) },
  handler: async (ctx, args): Promise<SubmissionSourceView | null> => {
    const now = Date.now();
    const submission = await resolveSubmission(ctx, args.submissionId);
    if (!submission) return null;

    const viewerCtx = await viewerContext(ctx);
    const viewer = viewerCtx.viewer;

    const problem = await ctx.db.get(submission.problemId);
    const author = await ctx.db.get(submission.profileId);
    const language = await ctx.db.get(submission.languageId);
    if (!problem || !author) return null;
    if (!problemIsVisibleTo(coreProblem(problem), viewer)) return null;

    const contest = submission.contestId ? await ctx.db.get(submission.contestId) : null;
    const solved = await hasSolvedProblem(ctx, viewer?.id as Id<"profiles"> | undefined, problem._id);
    const canSee = viewer
      ? canSeeSubmissionDetail({ profileId: submission.profileId }, viewer, {
          problem: coreProblem(problem),
          contest: contest ? coreContest(contest) : null,
          hasSolvedProblem: viewer.id === submission.profileId ? false : solved,
          globalSubmissionSourceVisibility: globalSourceVisibility(await siteSettings(ctx)),
        })
      : false;

    const problemEditable = problemIsEditableBy(coreProblem(problem), viewer);
    const locked = isLocked({ lockedAfter: submission.lockedAfter ?? null }, now);
    const isOwn = viewerCtx.profile?._id === submission.profileId;

    const stored = canSee
      ? await ctx.db
          .query("submissionSources")
          .withIndex("by_submission", (q) => q.eq("submissionId", submission._id))
          .unique()
      : null;

    return {
      canSeeSource: canSee,
      solveToView:
        !canSee &&
        resolveSubmissionSourceVisibility(
          coreProblem(problem),
          globalSourceVisibility(await siteSettings(ctx)),
        ) === "S" &&
        problemIsAccessibleBy(coreProblem(problem), viewer),
      id: submission.legacyId ?? submission._id,
      source: (stored?.source ?? "").replace(/\n+$/, ""),
      problem: { code: problem.code, name: problem.name },
      user: {
        username: author.username,
        rating: author.rating ?? null,
        displayRank: author.displayRank,
      },
      language: language
        ? {
            key: language.key,
            name: language.name,
            shortName: language.shortName || language.key,
            shikiLang: language.shikiLang,
            extension: language.extension,
          }
        : null,
      date: submission.date,
      judge:
        problemEditable && submission.judgedOnJudgeId
          ? ((await ctx.db.get(submission.judgedOnJudgeId))?.name ?? null)
          : null,
      status: submission.status,
      result: submission.result ?? null,
      casePoints: submission.casePoints,
      caseTotal: submission.caseTotal,
      points: submission.points ?? null,
      problemPoints: problem.points,
      isLocked: locked,
      canRejudge: coreHasPerm(viewer, "judge.rejudge_submission") && (!locked || coreIsSuperuser(viewer)),
      canResubmit: isOwn || coreHasPerm(viewer, "judge.resubmit_other"),
    };
  },
});
