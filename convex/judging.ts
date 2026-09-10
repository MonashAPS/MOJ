/**
 * Grading bookkeeping: the judge API's internal mutations and everything a
 * submission's lifecycle touches.
 *
 * The endpoints here are what `convex/http/judge.ts` calls once it has hashed
 * the judge's key; the exported helpers are shared with rejudge, rescore and the
 * recovery cron. Everything is a single mutation, so a whole event is applied or
 * none of it is.
 *
 * Ported from judge/bridge/judge_handler.py (the `on_*` handlers),
 * judge/bridge/judge_list.py (claiming) and judge/judgeapi.py
 * (`judge_submission`).
 */

import {
  BATCH_REJUDGE_PRIORITY,
  type ClaimableSubmission,
  CONTEST_SUBMISSION_PRIORITY,
  calculateProfilePoints,
  computeContestSubmissionPoints,
  computeGradingEnd,
  computeProblemStats,
  DEFAULT_PRIORITY,
  decodeCaseStatus,
  type JudgeRow,
  REJUDGE_PRIORITY,
  type SubmissionResult,
  type SubmissionTestCaseRow,
  selectClaim,
  updateParticipation,
} from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  applyHandshake,
  applyHeartbeat,
  authenticateJudge,
  freeJudge,
  JUDGE_HEARTBEAT_TIMEOUT_MS,
} from "./judgeApi";
import { invalid } from "./lib/errors";

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

/** How far down the queue one claim looks before giving up. */
export const CLAIM_SCAN_LIMIT = 256;
/**
 * Convex reads at most 16384 documents in one transaction. The two recomputes
 * that follow a grading-end walk a user's and a problem's whole submission
 * history, so both are capped well under that; see docs/SPEC_CHANGES.md.
 */
export const RECOMPUTE_SCAN_LIMIT = 6000;
/** `SubmissionTestCase.feedback` is a CharField(max_length=50) in DMOJ. */
export const MAX_FEEDBACK_LENGTH = 50;
/** A claim that has produced nothing for this long is assumed dead. */
export const STALE_CLAIM_MS = 15 * 60_000;

/* -------------------------------------------------------------------------- */
/* Validators                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The wire format is validated by `@moj/protocol`'s zod schemas at the HTTP
 * boundary; this validator only has to be wide enough to carry what came out.
 */
export const judgeEventValidator = v.object({
  type: v.string(),
  pretested: v.optional(v.union(v.boolean(), v.null())),
  cases: v.optional(v.array(v.any())),
  log: v.optional(v.union(v.string(), v.null())),
  message: v.optional(v.union(v.string(), v.null())),
});

const judgeAuthArgs = {
  judgeName: v.string(),
  authKeyHash: v.string(),
} as const;

/* -------------------------------------------------------------------------- */
/* Submission id resolution                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The judge knows a submission by whatever the claim handed it. That is an
 * integer (`legacyId`) for anything the site created, because `dmoj/judge.py`
 * formats the id with `%d`; a Convex document id is accepted as well so tests
 * and tools can use one.
 */
export async function resolveSubmission(
  ctx: QueryCtx,
  wireId: number | string,
): Promise<Doc<"submissions"> | null> {
  if (typeof wireId === "number") {
    return await ctx.db
      .query("submissions")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", wireId))
      .unique();
  }
  const normalized = ctx.db.normalizeId("submissions", wireId);
  if (normalized) return await ctx.db.get(normalized);
  const asNumber = Number(wireId);
  if (!Number.isFinite(asNumber)) return null;
  return await ctx.db
    .query("submissions")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", asNumber))
    .unique();
}

/** The integer id the judge is given, and that `/submission/<id>` uses. */
export function wireSubmissionId(submission: Doc<"submissions">): number | string {
  return submission.legacyId ?? submission._id;
}

/**
 * `legacyId` doubles as DMOJ's integer submission id: imported rows keep the
 * number they had and new rows continue the sequence. Convex serialises
 * conflicting mutations, so reading the maximum and adding one is safe.
 */
export async function allocateSubmissionNumber(ctx: MutationCtx): Promise<number> {
  const highest = await ctx.db.query("submissions").withIndex("by_legacyId").order("desc").first();
  return (highest?.legacyId ?? 0) + 1;
}

/* -------------------------------------------------------------------------- */
/* Claiming                                                                   */
/* -------------------------------------------------------------------------- */

export interface ClaimedSubmissionPayload {
  submissionId: number | string;
  problemCode: string;
  languageKey: string;
  source: string;
  timeLimit: number;
  memoryLimit: number;
  shortCircuit: boolean;
  meta: {
    pretestsOnly: boolean;
    inContest: number | null;
    attemptNo: number;
    user: number | string;
    userNotes: string;
  };
}

function toJudgeRow(judge: Doc<"judges">, now: number): JudgeRow {
  const lastSeen = judge.lastSeen ?? judge.startTime ?? 0;
  return {
    id: judge._id,
    name: judge.name,
    tier: judge.tier,
    // A pull judge has no socket to drop, so silence is what marks it gone.
    online: judge.online && lastSeen >= now - JUDGE_HEARTBEAT_TIMEOUT_MS,
    isDisabled: judge.isDisabled,
    isBlocked: judge.isBlocked,
    problemCodes: judge.problemCodes,
    runtimeKeys: judge.runtimeKeys,
    currentSubmissionId: judge.currentSubmissionId ?? null,
  };
}

/**
 * `Submission.get_related_submission_data`'s `attempt_no`: how many times this
 * user has already reached the judge with this problem in this participation.
 */
async function attemptNumber(ctx: QueryCtx, submission: Doc<"submissions">): Promise<number> {
  const previous = await ctx.db
    .query("submissions")
    .withIndex("by_profile_problem", (q) =>
      q.eq("profileId", submission.profileId).eq("problemId", submission.problemId),
    )
    .collect();
  let count = 0;
  for (const row of previous) {
    if (row._id === submission._id) continue;
    if (row.date >= submission.date) continue;
    if ((row.participationId ?? null) !== (submission.participationId ?? null)) continue;
    if (row.status === "CE" || row.status === "IE") continue;
    count += 1;
  }
  return count + 1;
}

/** `LanguageLimit`: a per-language override of the problem's limits. */
async function resolveLimits(
  ctx: QueryCtx,
  problem: Doc<"problems">,
  languageId: Id<"languages">,
): Promise<{ timeLimit: number; memoryLimit: number }> {
  const limits = await ctx.db
    .query("languageLimits")
    .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
    .collect();
  const override = limits.find((row) => row.languageId === languageId);
  return {
    timeLimit: override?.timeLimit ?? problem.timeLimit,
    memoryLimit: override?.memoryLimit ?? problem.memoryLimit,
  };
}

/**
 * `JudgeList._handle_free_judge`: the next queued submission this judge may
 * take, claimed and handed over.
 *
 * The queue is read straight off `by_status_priority`, which is
 * `[status, priority, date]`, so the scan is already in DMOJ's order and the
 * reservation rule can stop at the first rejudge-priority entry.
 */
export async function claimNext(
  ctx: MutationCtx,
  judgeId: Id<"judges">,
): Promise<ClaimedSubmissionPayload | null> {
  const judge = await ctx.db.get(judgeId);
  if (!judge) return null;
  // One judge grades one submission at a time.
  if (judge.currentSubmissionId) return null;

  const now = Date.now();
  const judgeDocs = await ctx.db.query("judges").collect();
  const judgeRows = judgeDocs.map((row) => toJudgeRow(row, now));
  const thisJudge = judgeRows.find((row) => row.id === judgeId);
  if (!thisJudge) return null;

  const queued = await ctx.db
    .query("submissions")
    .withIndex("by_status_priority", (q) => q.eq("status", "QU"))
    .order("asc")
    .take(CLAIM_SCAN_LIMIT);
  if (queued.length === 0) return null;

  const problems = new Map<Id<"problems">, Doc<"problems"> | null>();
  const languages = new Map<Id<"languages">, Doc<"languages"> | null>();
  const judgeNames = new Map<Id<"judges">, string>(judgeDocs.map((row) => [row._id, row.name]));

  const candidates: ClaimableSubmission[] = [];
  const byId = new Map<string, Doc<"submissions">>();
  for (const submission of queued) {
    if (!problems.has(submission.problemId)) {
      problems.set(submission.problemId, await ctx.db.get(submission.problemId));
    }
    if (!languages.has(submission.languageId)) {
      languages.set(submission.languageId, await ctx.db.get(submission.languageId));
    }
    const problem = problems.get(submission.problemId);
    const language = languages.get(submission.languageId);
    if (!problem || !language) continue;

    byId.set(submission._id, submission);
    candidates.push({
      id: submission._id,
      problemCode: problem.code,
      languageKey: language.key,
      priority: submission.priority,
      date: submission.date,
      status: submission.status,
      judgePin: submission.judgePin ? (judgeNames.get(submission.judgePin) ?? "\u0000") : null,
    });
  }

  const chosen = selectClaim(thisJudge, candidates, judgeRows);
  if (!chosen) return null;

  const submission = byId.get(chosen.id as string);
  if (!submission) return null;
  const problem = problems.get(submission.problemId);
  if (!problem) return null;

  const source = await ctx.db
    .query("submissionSources")
    .withIndex("by_submission", (q) => q.eq("submissionId", submission._id))
    .unique();
  const profile = await ctx.db.get(submission.profileId);
  const limits = await resolveLimits(ctx, problem, submission.languageId);
  const attemptNo = await attemptNumber(ctx, submission);

  let inContest: number | null = null;
  if (submission.participationId) {
    const participation = await ctx.db.get(submission.participationId);
    inContest = participation?.virtual ?? null;
  }

  // `on_submission_processing`: status P and the judge owns it from here.
  await ctx.db.patch(submission._id, {
    status: "P",
    claimedByJudgeId: judgeId,
    claimedAt: now,
    judgedOnJudgeId: judgeId,
    abortRequested: undefined,
    currentBatch: 0,
    inBatch: false,
  });
  await ctx.db.patch(judgeId, { currentSubmissionId: submission._id, lastSeen: now });

  return {
    submissionId: wireSubmissionId(submission),
    problemCode: chosen.problemCode,
    languageKey: chosen.languageKey,
    source: source?.source ?? "",
    timeLimit: limits.timeLimit,
    memoryLimit: limits.memoryLimit,
    shortCircuit: problem.shortCircuit,
    meta: {
      pretestsOnly: submission.isPretested,
      inContest,
      attemptNo,
      // DMOJ sends the integer user id; problem `init.yml` files may read it.
      user: profile?.legacyUserId ?? profile?.username ?? "",
      userNotes: profile?.notes ?? "",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Recomputes that follow a finished submission                               */
/* -------------------------------------------------------------------------- */

/**
 * `Profile.calculate_points()`: the user's points, performance points and
 * problem count, over public non-organization-private problems only.
 */
export async function recomputeProfilePoints(ctx: MutationCtx, profileId: Id<"profiles">): Promise<void> {
  const profile = await ctx.db.get(profileId);
  if (!profile) return;

  const submissions = await ctx.db
    .query("submissions")
    .withIndex("by_profile_date", (q) => q.eq("profileId", profileId))
    .order("desc")
    .take(RECOMPUTE_SCAN_LIMIT);

  const problems = new Map<Id<"problems">, Doc<"problems"> | null>();
  const rows = [];
  for (const submission of submissions) {
    if (!problems.has(submission.problemId)) {
      problems.set(submission.problemId, await ctx.db.get(submission.problemId));
    }
    const problem = problems.get(submission.problemId);
    if (!problem) continue;
    rows.push({
      problemId: submission.problemId as string,
      points: submission.points ?? null,
      result: (submission.result ?? null) as SubmissionResult | null,
      casePoints: submission.casePoints,
      caseTotal: submission.caseTotal,
      isArchived: submission.isArchived,
      isPublicProblem: problem.isPublic && !problem.isOrganizationPrivate,
    });
  }

  const computed = calculateProfilePoints(rows);
  await ctx.db.patch(profileId, {
    points: computed.points,
    performancePoints: computed.performancePoints,
    problemCount: computed.problemCount,
  });
}

/** `Problem.update_stats()`: solver count and AC rate, unlisted users excluded. */
export async function recomputeProblemStats(ctx: MutationCtx, problemId: Id<"problems">): Promise<void> {
  const problem = await ctx.db.get(problemId);
  if (!problem) return;

  const submissions = await ctx.db
    .query("submissions")
    .withIndex("by_problem_date", (q) => q.eq("problemId", problemId))
    .order("desc")
    .take(RECOMPUTE_SCAN_LIMIT);

  const profiles = new Map<Id<"profiles">, Doc<"profiles"> | null>();
  const rows = [];
  for (const submission of submissions) {
    if (!profiles.has(submission.profileId)) {
      profiles.set(submission.profileId, await ctx.db.get(submission.profileId));
    }
    rows.push({
      profileId: submission.profileId as string,
      result: (submission.result ?? null) as SubmissionResult | null,
      casePoints: submission.casePoints,
      caseTotal: submission.caseTotal,
      isArchived: submission.isArchived,
      isUserUnlisted: profiles.get(submission.profileId)?.isUnlisted ?? false,
    });
  }

  const stats = computeProblemStats(rows);
  await ctx.db.patch(problemId, { userCount: stats.userCount, acRate: stats.acRate });
}

/**
 * `Submission.update_contest()`: the submission's contest points, then
 * `ContestParticipation.recompute_results()` through the contest's format.
 */
export async function recomputeParticipation(
  ctx: MutationCtx,
  participationId: Id<"contestParticipations">,
): Promise<void> {
  const participation = await ctx.db.get(participationId);
  if (!participation) return;
  const contest = await ctx.db.get(participation.contestId);
  if (!contest) return;

  const contestProblems = await ctx.db
    .query("contestProblems")
    .withIndex("by_contest_order", (q) => q.eq("contestId", contest._id))
    .collect();
  const contestProblemById = new Map(contestProblems.map((row) => [row._id, row]));

  const submissions = await ctx.db
    .query("submissions")
    .withIndex("by_participation", (q) => q.eq("participationId", participationId))
    .collect();

  const rows = [];
  for (const submission of submissions) {
    if (!submission.contestProblemId) continue;
    const contestProblem = contestProblemById.get(submission.contestProblemId);
    if (!contestProblem) continue;

    // `Submission.update_contest()` recomputes the stored contest points.
    const points = computeContestSubmissionPoints(submission, contestProblem);
    if (submission.contestPoints !== points) {
      await ctx.db.patch(submission._id, { contestPoints: points });
    }

    const testCases =
      contest.formatName === "ioi16"
        ? (
            await ctx.db
              .query("submissionTestCases")
              .withIndex("by_submission_case", (q) => q.eq("submissionId", submission._id))
              .collect()
          ).map(toCoreTestCase)
        : undefined;

    rows.push({
      id: submission._id as string,
      contestProblemId: submission.contestProblemId as string,
      participationId: participationId as string,
      contestPoints: points,
      casePoints: submission.casePoints,
      caseTotal: submission.caseTotal,
      result: (submission.result ?? null) as SubmissionResult | null,
      status: submission.status,
      date: submission.date,
      isPretest: submission.isContestPretest ?? false,
      testCases,
    });
  }

  const update = updateParticipation({
    participation: {
      id: participation._id,
      contestId: participation.contestId,
      profileId: participation.profileId,
      realStart: participation.realStart,
      score: participation.score,
      cumtime: participation.cumtime,
      tiebreaker: participation.tiebreaker,
      isDisqualified: participation.isDisqualified,
      virtual: participation.virtual,
      formatData: participation.formatData ?? null,
    },
    submissions: rows,
    contestProblems: contestProblems.map((row) => ({
      id: row._id,
      contestId: row.contestId,
      problemId: row.problemId,
      points: row.points,
      partial: row.partial,
      isPretested: row.isPretested,
      order: row.order,
      maxSubmissions: row.maxSubmissions ?? null,
    })),
    contest: {
      id: contest._id,
      key: contest.key,
      name: contest.name,
      startTime: contest.startTime,
      endTime: contest.endTime,
      timeLimit: contest.timeLimit ?? null,
      isVisible: contest.isVisible,
      isPrivate: contest.isPrivate,
      isOrganizationPrivate: contest.isOrganizationPrivate,
      scoreboardVisibility: contest.scoreboardVisibility,
      formatName: contest.formatName,
      formatConfig: contest.formatConfig,
      pointsPrecision: contest.pointsPrecision,
      freezeMinutes: contest.freezeMinutes,
      blindDuringFreeze: contest.blindDuringFreeze,
      lockedAfter: contest.lockedAfter ?? null,
    },
  });

  await ctx.db.patch(participationId, {
    score: update.score,
    cumtime: update.cumtime,
    tiebreaker: update.tiebreaker,
    formatData: update.formatData,
  });
}

function toCoreTestCase(row: Doc<"submissionTestCases">): SubmissionTestCaseRow {
  return {
    case: row.case,
    status: row.status as SubmissionResult,
    time: row.time,
    memory: row.memory,
    points: row.points,
    total: row.total,
    batch: row.batch ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Event handling                                                             */
/* -------------------------------------------------------------------------- */

async function deleteTestCases(ctx: MutationCtx, submissionId: Id<"submissions">): Promise<void> {
  const rows = await ctx.db
    .query("submissionTestCases")
    .withIndex("by_submission_case", (q) => q.eq("submissionId", submissionId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

/** Everything a submission stops holding once it is no longer being graded. */
async function releaseSubmission(ctx: MutationCtx, submission: Doc<"submissions">): Promise<void> {
  await freeJudge(ctx, submission.claimedByJudgeId, submission._id);
  await ctx.db.patch(submission._id, {
    claimedByJudgeId: undefined,
    claimedAt: undefined,
    abortRequested: undefined,
    inBatch: false,
  });
}

/** `on_grading_begin`. Applying it twice would throw away real cases, so it only runs once. */
async function onGradingBegin(
  ctx: MutationCtx,
  submission: Doc<"submissions">,
  pretested: boolean,
): Promise<void> {
  if (submission.status === "G") return;
  await deleteTestCases(ctx, submission._id);
  await ctx.db.patch(submission._id, {
    status: "G",
    isPretested: pretested,
    currentTestcase: 1,
    batch: false,
    judgedDate: Date.now(),
    currentBatch: 0,
    inBatch: false,
  });
}

/** `on_batch_begin`: the first batch also marks the submission batched. */
async function onBatchBegin(ctx: MutationCtx, submission: Doc<"submissions">): Promise<void> {
  if (submission.inBatch) return; // a retried packet; batches never nest
  const batch = (submission.currentBatch ?? 0) + 1;
  await ctx.db.patch(submission._id, { inBatch: true, currentBatch: batch, batch: true });
}

/** `on_batch_end`. */
async function onBatchEnd(ctx: MutationCtx, submission: Doc<"submissions">): Promise<void> {
  if (!submission.inBatch) return;
  await ctx.db.patch(submission._id, { inBatch: false });
}

interface WireCase {
  position?: number;
  status?: number;
  time?: number | null;
  memory?: number | null;
  points?: number | null;
  totalPoints?: number | null;
  output?: string | null;
  feedback?: string | null;
  extendedFeedback?: string | null;
}

/**
 * `on_test_case`: one row per case, `current_testcase` moved past the last of
 * them. A case that already has a row is overwritten rather than duplicated, so
 * a retried packet is harmless.
 */
async function onTestCaseStatus(
  ctx: MutationCtx,
  submission: Doc<"submissions">,
  cases: WireCase[],
): Promise<void> {
  if (cases.length === 0) return;

  const batch = submission.inBatch ? (submission.currentBatch ?? null) : null;
  let maxPosition = 0;

  for (const wire of cases) {
    const position = wire.position ?? 0;
    maxPosition = Math.max(maxPosition, position);
    const row = {
      submissionId: submission._id,
      case: position,
      status: decodeCaseStatus(wire.status ?? 0) as string,
      time: wire.time ?? 0,
      memory: wire.memory ?? 0,
      points: wire.points ?? 0,
      total: wire.totalPoints ?? 0,
      ...(batch === null ? {} : { batch }),
      feedback: (wire.feedback ?? "").slice(0, MAX_FEEDBACK_LENGTH),
      extendedFeedback: wire.extendedFeedback ?? "",
      output: wire.output ?? "",
    };

    const existing = await ctx.db
      .query("submissionTestCases")
      .withIndex("by_submission_case", (q) => q.eq("submissionId", submission._id).eq("case", position))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, row);
    } else {
      await ctx.db.insert("submissionTestCases", row);
    }
  }

  await ctx.db.patch(submission._id, {
    currentTestcase: Math.max(submission.currentTestcase, maxPosition + 1),
  });
}

/**
 * `on_grading_end`: fold the case rows into the submission, then recompute the
 * three things a finished submission changes.
 */
export async function finishGrading(ctx: MutationCtx, submissionId: Id<"submissions">): Promise<void> {
  const submission = await ctx.db.get(submissionId);
  if (!submission) return;
  // A retried grading-end must not rescore an already-final submission.
  if (submission.status === "D") return;

  const problem = await ctx.db.get(submission.problemId);
  if (!problem) throw invalid("Submission has no problem.");

  const testCases = await ctx.db
    .query("submissionTestCases")
    .withIndex("by_submission_case", (q) => q.eq("submissionId", submissionId))
    .collect();
  testCases.sort((a, b) => a.case - b.case);

  const graded = computeGradingEnd(testCases.map(toCoreTestCase), {
    points: problem.points,
    partial: problem.partial,
  });

  await ctx.db.patch(submissionId, {
    status: graded.status,
    result: graded.result,
    time: graded.time,
    memory: graded.memory,
    points: graded.points,
    casePoints: graded.casePoints,
    caseTotal: graded.caseTotal,
    currentBatch: undefined,
    inBatch: false,
  });
  await releaseSubmission(ctx, submission);

  if (problem.isPublic && !problem.isOrganizationPrivate) {
    await recomputeProfilePoints(ctx, submission.profileId);
  }
  await recomputeProblemStats(ctx, submission.problemId);
  if (submission.participationId) {
    await recomputeParticipation(ctx, submission.participationId);
  }
}

/** `on_compile_error`, `on_internal_error` and `on_submission_terminated`. */
async function finishWithStatus(
  ctx: MutationCtx,
  submission: Doc<"submissions">,
  status: "CE" | "IE" | "AB",
  error: string | undefined,
): Promise<void> {
  await ctx.db.patch(submission._id, {
    status,
    result: status,
    ...(error === undefined ? {} : { error }),
    ...(status === "AB" ? { points: 0 } : {}),
    currentBatch: undefined,
    inBatch: false,
  });
  await releaseSubmission(ctx, submission);
  if (submission.participationId) {
    await recomputeParticipation(ctx, submission.participationId);
  }
}

export interface JudgeEventPayload {
  type: string;
  pretested?: boolean | null;
  cases?: WireCase[];
  log?: string | null;
  message?: string | null;
}

/** Apply one judge event. The caller has already authenticated the judge. */
export async function applyJudgeEvent(
  ctx: MutationCtx,
  submission: Doc<"submissions">,
  event: JudgeEventPayload,
): Promise<{ ok: boolean; error?: string }> {
  switch (event.type) {
    case "grading-begin":
      await onGradingBegin(ctx, submission, event.pretested === true);
      return { ok: true };

    case "batch-begin":
      await onBatchBegin(ctx, submission);
      return { ok: true };

    case "batch-end":
      await onBatchEnd(ctx, submission);
      return { ok: true };

    case "test-case-status":
      await onTestCaseStatus(ctx, submission, event.cases ?? []);
      return { ok: true };

    case "grading-end":
      await finishGrading(ctx, submission._id);
      return { ok: true };

    case "compile-error":
      if (submission.status === "CE") return { ok: true };
      await finishWithStatus(ctx, submission, "CE", event.log ?? "");
      return { ok: true };

    case "compile-message": {
      // Every compiled executor reports its output, empty or not. An empty log
      // is not a compiler warning and must never be shown as one.
      const log = (event.log ?? "").trim();
      if (log.length === 0) return { ok: true };
      await ctx.db.patch(submission._id, { error: event.log ?? "" });
      return { ok: true };
    }

    case "internal-error":
      if (submission.status === "IE") return { ok: true };
      await finishWithStatus(ctx, submission, "IE", event.message ?? "");
      return { ok: true };

    case "submission-terminated":
      if (submission.status === "AB") return { ok: true };
      await finishWithStatus(ctx, submission, "AB", undefined);
      return { ok: true };

    default:
      return { ok: false, error: `unknown event type ${JSON.stringify(event.type)}` };
  }
}

/* -------------------------------------------------------------------------- */
/* Queue entry: rejudge, resubmit and the first submit all go through here     */
/* -------------------------------------------------------------------------- */

export interface QueueOptions {
  rejudge?: boolean;
  batchRejudge?: boolean;
  judgePin?: Id<"judges"> | null;
}

/**
 * `judgeapi.judge_submission`: reset the submission to `QU` and give it a queue
 * priority. Refuses a submission that a judge already holds (`P`/`G`), which is
 * what makes a repeated rejudge idempotent.
 */
export async function queueSubmission(
  ctx: MutationCtx,
  submissionId: Id<"submissions">,
  options: QueueOptions = {},
): Promise<boolean> {
  const submission = await ctx.db.get(submissionId);
  if (!submission) return false;
  if (submission.status === "P" || submission.status === "G") return false;

  const rejudged = options.rejudge === true || options.batchRejudge === true;

  let isPretested = submission.isPretested;
  let priority = DEFAULT_PRIORITY;
  if (submission.participationId && submission.contestProblemId) {
    priority = CONTEST_SUBMISSION_PRIORITY;
    const participation = await ctx.db.get(submission.participationId);
    const contest = participation ? await ctx.db.get(participation.contestId) : null;
    const contestProblem = await ctx.db.get(submission.contestProblemId);
    isPretested = (contest?.runPretestsOnly ?? false) && (contestProblem?.isPretested ?? false);
  }
  if (options.batchRejudge) priority = BATCH_REJUDGE_PRIORITY;
  else if (options.rejudge) priority = REJUDGE_PRIORITY;

  await freeJudge(ctx, submission.claimedByJudgeId, submission._id);
  await ctx.db.patch(submissionId, {
    status: "QU",
    result: undefined,
    time: undefined,
    memory: undefined,
    points: undefined,
    error: undefined,
    casePoints: 0,
    caseTotal: 0,
    currentTestcase: 0,
    batch: false,
    isPretested,
    priority,
    retryCount: 0,
    rejudgedDate: rejudged ? Date.now() : undefined,
    judgedDate: undefined,
    judgedOnJudgeId: undefined,
    claimedByJudgeId: undefined,
    claimedAt: undefined,
    abortRequested: undefined,
    currentBatch: undefined,
    inBatch: false,
    ...(options.judgePin === undefined ? {} : { judgePin: options.judgePin ?? undefined }),
  });
  await deleteTestCases(ctx, submissionId);
  return true;
}

/* -------------------------------------------------------------------------- */
/* The judge API endpoints                                                    */
/* -------------------------------------------------------------------------- */

export const handshake = internalMutation({
  args: {
    ...judgeAuthArgs,
    problems: v.array(v.array(v.any())),
    executors: v.record(v.string(), v.array(v.array(v.any()))),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const judge = await authenticateJudge(ctx, args.judgeName, args.authKeyHash);
    await applyHandshake(ctx, judge, {
      problems: args.problems as Array<[string, ...unknown[]]>,
      executors: args.executors as Record<string, Array<[string, ...unknown[]]>>,
      ip: args.ip,
    });
    return { ok: true as const, judgeId: judge._id as string };
  },
});

export const heartbeat = internalMutation({
  args: {
    ...judgeAuthArgs,
    load: v.optional(v.union(v.number(), v.null())),
    problems: v.optional(v.array(v.array(v.any()))),
    executors: v.optional(v.record(v.string(), v.array(v.array(v.any())))),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const judge = await authenticateJudge(ctx, args.judgeName, args.authKeyHash);
    await applyHeartbeat(ctx, judge, {
      load: args.load,
      problems: args.problems as Array<[string, ...unknown[]]> | undefined,
      executors: args.executors as Record<string, Array<[string, ...unknown[]]>> | undefined,
      ip: args.ip,
    });
    return { ok: true as const, serverTime: Date.now() };
  },
});

export const claim = internalMutation({
  args: judgeAuthArgs,
  handler: async (ctx, args): Promise<{ submission: ClaimedSubmissionPayload | null }> => {
    const judge = await authenticateJudge(ctx, args.judgeName, args.authKeyHash);
    // Claiming is also a sign of life; a judge that is claiming is not dead.
    await ctx.db.patch(judge._id, { online: true, lastSeen: Date.now() });
    if (judge.isDisabled) return { submission: null };
    return { submission: await claimNext(ctx, judge._id) };
  },
});

export const event = internalMutation({
  args: {
    ...judgeAuthArgs,
    submissionId: v.union(v.number(), v.string()),
    event: judgeEventValidator,
  },
  handler: async (ctx, args) => {
    await authenticateJudge(ctx, args.judgeName, args.authKeyHash);
    const submission = await resolveSubmission(ctx, args.submissionId);
    if (!submission) {
      // DMOJ logs "Unknown submission" and carries on; a 200 stops the judge
      // retrying an event for something that no longer exists.
      return { ok: false, error: "unknown submission" };
    }
    return await applyJudgeEvent(ctx, submission, args.event as JudgeEventPayload);
  },
});

export const abortFlag = internalQuery({
  args: { ...judgeAuthArgs, submissionId: v.union(v.number(), v.string()) },
  handler: async (ctx, args) => {
    await authenticateJudge(ctx, args.judgeName, args.authKeyHash);
    const submission = await resolveSubmission(ctx, args.submissionId);
    return { abort: submission?.abortRequested === true };
  },
});

export const disconnect = internalMutation({
  args: judgeAuthArgs,
  handler: async (ctx, args) => {
    const judge = await authenticateJudge(ctx, args.judgeName, args.authKeyHash);
    // A clean shutdown leaves whatever it was grading for the recovery cron.
    await ctx.db.patch(judge._id, { online: false, currentSubmissionId: undefined });
    return { ok: true as const };
  },
});

/* -------------------------------------------------------------------------- */
/* Recovery                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Cron, every minute: put back what a dead judge was holding.
 *
 * A submission in `P` or `G` is stuck when the judge that claimed it stopped
 * heartbeating, when nothing holds it any more, or when the claim is older than
 * fifteen minutes and no case has landed. It goes back to `QU` once; a second
 * failure is an internal error rather than an infinite loop.
 */
export const recoverStuckSubmissions = internalMutation({
  args: { heartbeatTimeoutMs: v.optional(v.number()), staleClaimMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const heartbeatTimeout = args.heartbeatTimeoutMs ?? JUDGE_HEARTBEAT_TIMEOUT_MS;
    const staleClaim = args.staleClaimMs ?? STALE_CLAIM_MS;

    const judges = new Map<Id<"judges">, Doc<"judges"> | null>();
    const inFlight: Doc<"submissions">[] = [];
    for (const status of ["P", "G"] as const) {
      inFlight.push(
        ...(await ctx.db
          .query("submissions")
          .withIndex("by_status_priority", (q) => q.eq("status", status))
          .take(CLAIM_SCAN_LIMIT)),
      );
    }

    let requeued = 0;
    let failed = 0;
    let aborted = 0;
    for (const submission of inFlight) {
      const judgeId = submission.claimedByJudgeId;
      if (judgeId && !judges.has(judgeId)) judges.set(judgeId, await ctx.db.get(judgeId));
      const judge = judgeId ? judges.get(judgeId) : null;

      const lastSeen = judge ? (judge.lastSeen ?? judge.startTime ?? 0) : 0;
      const judgeGone = !judge?.online || lastSeen < now - heartbeatTimeout;
      const claimedAt = submission.claimedAt ?? submission.date;
      const noProgress = submission.currentTestcase <= 1 && claimedAt < now - staleClaim;

      if (!judgeGone && !noProgress) continue;

      if (judge && judge.currentSubmissionId === submission._id) {
        await ctx.db.patch(judge._id, { currentSubmissionId: undefined });
        judges.set(judge._id, { ...judge, currentSubmissionId: undefined });
      }

      // Somebody asked for this to stop while the judge was already gone; the
      // request stands rather than being lost on the requeue.
      if (submission.abortRequested) {
        await ctx.db.patch(submission._id, {
          status: "AB",
          result: "AB",
          points: 0,
          abortRequested: undefined,
          claimedByJudgeId: undefined,
          claimedAt: undefined,
          currentBatch: undefined,
          inBatch: false,
        });
        aborted += 1;
        continue;
      }

      if (submission.retryCount < 1) {
        await ctx.db.patch(submission._id, {
          status: "QU",
          result: undefined,
          retryCount: submission.retryCount + 1,
          claimedByJudgeId: undefined,
          claimedAt: undefined,
          judgedOnJudgeId: undefined,
          currentTestcase: 0,
          batch: false,
          currentBatch: undefined,
          inBatch: false,
        });
        await deleteTestCases(ctx, submission._id);
        requeued += 1;
      } else {
        await ctx.db.patch(submission._id, {
          status: "IE",
          result: "IE",
          error: "The judge grading this submission went away.",
          claimedByJudgeId: undefined,
          claimedAt: undefined,
          currentBatch: undefined,
          inBatch: false,
        });
        failed += 1;
      }
    }

    return { requeued, failed, aborted };
  },
});
