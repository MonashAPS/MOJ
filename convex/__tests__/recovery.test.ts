// @vitest-environment edge-runtime
/**
 * The two crons that keep the queue honest, and the batch jobs that feed it.
 *
 * SPEC section 6: a submission whose judge stopped heartbeating goes back to
 * `QU` once, and is an internal error the second time.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { JUDGE_HEARTBEAT_TIMEOUT_MS } from "../judgeApi";
import {
  makeJudge,
  makeLanguage,
  makeProblem,
  makeProfile,
  makeSubmission,
  setupTest,
} from "./fixtures.helpers";

const LONG_AGO = Date.now() - JUDGE_HEARTBEAT_TIMEOUT_MS * 10;

afterEach(() => {
  vi.useRealTimers();
});

describe("judge recovery", () => {
  it("requeues a submission whose judge stopped heartbeating, then fails it", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const problemId = await makeProblem(t);
    const author = await makeProfile(t);
    const judge = await makeJudge(t, { lastSeen: LONG_AGO });
    const submissionId = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId,
      status: "G",
      claimedByJudgeId: judge.judgeId,
      claimedAt: Date.now(),
      currentTestcase: 3,
    });
    await t.run(async (ctx) => ctx.db.patch(judge.judgeId, { currentSubmissionId: submissionId }));

    let result = await t.mutation(internal.judging.recoverStuckSubmissions, {});
    expect(result).toEqual({ requeued: 1, failed: 0, aborted: 0 });

    let submission = await t.run(async (ctx) => ctx.db.get(submissionId));
    expect(submission?.status).toBe("QU");
    expect(submission?.retryCount).toBe(1);
    expect(submission?.claimedByJudgeId).toBeUndefined();
    expect((await t.run(async (ctx) => ctx.db.get(judge.judgeId)))?.currentSubmissionId).toBeUndefined();

    // It is claimed again, the judge dies again: this time it is an IE.
    await t.run(async (ctx) =>
      ctx.db.patch(submissionId, {
        status: "P",
        claimedByJudgeId: judge.judgeId,
        claimedAt: Date.now(),
      }),
    );
    result = await t.mutation(internal.judging.recoverStuckSubmissions, {});
    expect(result).toEqual({ requeued: 0, failed: 1, aborted: 0 });

    submission = await t.run(async (ctx) => ctx.db.get(submissionId));
    expect(submission?.status).toBe("IE");
    expect(submission?.result).toBe("IE");
    expect(submission?.error).toMatch(/went away/);
  });

  it("leaves a healthy judge's work alone", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const problemId = await makeProblem(t);
    const author = await makeProfile(t);
    const judge = await makeJudge(t, { lastSeen: Date.now() });
    const submissionId = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId,
      status: "G",
      claimedByJudgeId: judge.judgeId,
      claimedAt: Date.now(),
      currentTestcase: 2,
    });
    await t.run(async (ctx) => ctx.db.patch(judge.judgeId, { currentSubmissionId: submissionId }));

    expect(await t.mutation(internal.judging.recoverStuckSubmissions, {})).toEqual({
      requeued: 0,
      failed: 0,
      aborted: 0,
    });
    expect((await t.run(async (ctx) => ctx.db.get(submissionId)))?.status).toBe("G");
  });

  it("honours an abort that was requested before the judge went away", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const problemId = await makeProblem(t);
    const author = await makeProfile(t);
    const judge = await makeJudge(t, { lastSeen: LONG_AGO });
    const submissionId = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId,
      status: "G",
      claimedByJudgeId: judge.judgeId,
      claimedAt: Date.now(),
      currentTestcase: 2,
    });
    await t.run(async (ctx) => ctx.db.patch(submissionId, { abortRequested: true }));

    expect(await t.mutation(internal.judging.recoverStuckSubmissions, {})).toEqual({
      requeued: 0,
      failed: 0,
      aborted: 1,
    });
    const submission = await t.run(async (ctx) => ctx.db.get(submissionId));
    expect(submission?.status).toBe("AB");
    expect(submission?.result).toBe("AB");
    expect(submission?.abortRequested).toBeUndefined();
  });

  it("requeues a stale claim that never produced a case", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const problemId = await makeProblem(t);
    const author = await makeProfile(t);
    const judge = await makeJudge(t, { lastSeen: Date.now() });
    const submissionId = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId,
      status: "P",
      claimedByJudgeId: judge.judgeId,
      claimedAt: Date.now() - 20 * 60_000,
      currentTestcase: 0,
    });
    await t.run(async (ctx) => ctx.db.patch(judge.judgeId, { currentSubmissionId: submissionId }));

    expect(await t.mutation(internal.judging.recoverStuckSubmissions, {})).toEqual({
      requeued: 1,
      failed: 0,
      aborted: 0,
    });
    expect((await t.run(async (ctx) => ctx.db.get(submissionId)))?.status).toBe("QU");
  });
});

describe("judge offline marking", () => {
  it("marks a silent judge offline and drops its runtime versions", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const quiet = await makeJudge(t, { name: "quiet", lastSeen: LONG_AGO });
    const busy = await makeJudge(t, { name: "busy", lastSeen: Date.now() });
    await t.run(async (ctx) =>
      ctx.db.insert("runtimeVersions", {
        languageId,
        judgeId: quiet.judgeId,
        name: "python3",
        version: "3.9.10",
        priority: 0,
      }),
    );

    expect(await t.mutation(internal.judgeApi.markOfflineJudges, {})).toEqual({ marked: 1 });
    expect((await t.run(async (ctx) => ctx.db.get(quiet.judgeId)))?.online).toBe(false);
    expect((await t.run(async (ctx) => ctx.db.get(busy.judgeId)))?.online).toBe(true);

    const runtimes = await t.run(async (ctx) =>
      ctx.db
        .query("runtimeVersions")
        .withIndex("by_judge", (q) => q.eq("judgeId", quiet.judgeId))
        .collect(),
    );
    expect(runtimes).toHaveLength(0);
  });
});

describe("batch jobs", () => {
  it("rejudges everything matching the filter and archives the locked ones", async () => {
    vi.useFakeTimers();
    const t = setupTest();
    const py = await makeLanguage(t, "PY3");
    const cpp = await makeLanguage(t, "CPP17");
    const author = await makeProfile(t);
    const staff = await makeProfile(t, {
      isStaff: true,
      permissions: [
        "judge.rejudge_submission",
        "judge.rejudge_submission_lot",
        "judge.edit_own_problem",
        "judge.edit_all_problem",
      ],
    });
    const problemId = await makeProblem(t, { code: "aplusb", allowedLanguageIds: [py, cpp] });

    const wanted = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId: py,
      legacyId: 1,
      status: "D",
      result: "WA",
    });
    const wrongLanguage = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId: cpp,
      legacyId: 2,
      status: "D",
      result: "WA",
    });
    const grading = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId: py,
      legacyId: 3,
      status: "G",
    });
    const locked = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId: py,
      legacyId: 4,
      status: "D",
      result: "WA",
      lockedAfter: Date.now() - 1000,
    });

    const { jobId } = await t
      .withIdentity({ subject: staff.userId })
      .mutation(api.admin.submissions.batchRejudge, {
        problemCode: "aplusb",
        languageKeys: ["PY3"],
        results: ["WA"],
        archiveLocked: true,
      });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const job = await t.withIdentity({ subject: staff.userId }).query(api.jobs.status, { jobId });
    expect(job?.status).toBe("done");
    expect(job?.result).toEqual({ rejudged: 1, archived: 1 });

    expect((await t.run(async (ctx) => ctx.db.get(wanted)))?.status).toBe("QU");
    expect((await t.run(async (ctx) => ctx.db.get(wanted)))?.priority).toBe(3);
    expect((await t.run(async (ctx) => ctx.db.get(wrongLanguage)))?.status).toBe("D");
    expect((await t.run(async (ctx) => ctx.db.get(grading)))?.status).toBe("G");
    expect((await t.run(async (ctx) => ctx.db.get(locked)))?.isArchived).toBe(true);
    expect((await t.run(async (ctx) => ctx.db.get(locked)))?.status).toBe("D");
  });

  it("leaves locked submissions out entirely when archiveLocked is off", async () => {
    vi.useFakeTimers();
    const t = setupTest();
    const py = await makeLanguage(t, "PY3");
    const author = await makeProfile(t);
    const staff = await makeProfile(t, {
      isStaff: true,
      permissions: [
        "judge.rejudge_submission",
        "judge.rejudge_submission_lot",
        "judge.edit_own_problem",
        "judge.edit_all_problem",
      ],
    });
    const problemId = await makeProblem(t, { code: "aplusb", allowedLanguageIds: [py] });
    const locked = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId: py,
      legacyId: 1,
      status: "D",
      result: "WA",
      lockedAfter: Date.now() - 1000,
    });

    const { jobId } = await t
      .withIdentity({ subject: staff.userId })
      .mutation(api.admin.submissions.batchRejudge, { problemCode: "aplusb" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const job = await t.withIdentity({ subject: staff.userId }).query(api.jobs.status, { jobId });
    expect(job?.result).toEqual({ rejudged: 0, archived: 0 });
    expect((await t.run(async (ctx) => ctx.db.get(locked)))?.isArchived).toBe(false);
  });

  it("rescores a problem and the users who solved it", async () => {
    vi.useFakeTimers();
    const t = setupTest();
    const py = await makeLanguage(t, "PY3");
    const author = await makeProfile(t);
    const staff = await makeProfile(t, {
      isStaff: true,
      permissions: ["judge.rejudge_submission", "judge.edit_own_problem", "judge.edit_all_problem"],
    });
    const problemId = await makeProblem(t, {
      code: "aplusb",
      allowedLanguageIds: [py],
      points: 100,
      partial: true,
    });
    const submissionId = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId: py,
      status: "D",
      result: "AC",
      casePoints: 100,
      caseTotal: 100,
      points: 100,
    });

    // The problem is revalued; nothing needs regrading.
    await t.run(async (ctx) => ctx.db.patch(problemId, { points: 42 }));

    const { jobId } = await t
      .withIdentity({ subject: staff.userId })
      .mutation(api.admin.submissions.rescoreProblem, { problemCode: "aplusb" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const job = await t.withIdentity({ subject: staff.userId }).query(api.jobs.status, { jobId });
    expect(job?.status).toBe("done");
    expect((await t.run(async (ctx) => ctx.db.get(submissionId)))?.points).toBe(42);
    expect((await t.run(async (ctx) => ctx.db.get(author.profileId)))?.points).toBe(42);
  });

  it("keeps the job query to staff", async () => {
    vi.useFakeTimers();
    const t = setupTest();
    const py = await makeLanguage(t, "PY3");
    const stranger = await makeProfile(t);
    const staff = await makeProfile(t, {
      isStaff: true,
      permissions: ["judge.rejudge_submission", "judge.edit_own_problem", "judge.edit_all_problem"],
    });
    await makeProblem(t, { code: "aplusb", allowedLanguageIds: [py] });
    const { jobId } = await t
      .withIdentity({ subject: staff.userId })
      .mutation(api.admin.submissions.rescoreProblem, { problemCode: "aplusb" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await expect(
      t.withIdentity({ subject: stranger.userId }).query(api.jobs.status, { jobId }),
    ).rejects.toThrow(/Staff only/);
  });

  it("refuses a batch rejudge without the permissions", async () => {
    const t = setupTest();
    const py = await makeLanguage(t, "PY3");
    const halfway = await makeProfile(t, {
      isStaff: true,
      permissions: ["judge.rejudge_submission", "judge.edit_own_problem", "judge.edit_all_problem"],
    });
    await makeProblem(t, { code: "aplusb", allowedLanguageIds: [py] });

    await expect(
      t
        .withIdentity({ subject: halfway.userId })
        .mutation(api.admin.submissions.batchRejudge, { problemCode: "aplusb" }),
    ).rejects.toThrow(/rejudge_submission_lot/);
  });
});
