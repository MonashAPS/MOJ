// @vitest-environment edge-runtime
/**
 * Submitting, aborting and rejudging: DMOJ's rules from
 * `ProblemSubmit.form_valid`, `abort_submission` and `judgeapi.judge_submission`.
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { MAX_SOURCE_LENGTH } from "./submissions";
import {
  asUser,
  insertJudge,
  insertLanguage,
  insertProblem,
  insertProfile,
  insertSubmission,
  type Overrides,
} from "./test.fixtures";
import { setupTest } from "./test.setup";

async function fixture(problemOptions: Overrides<"problems"> = {}) {
  const t = setupTest();
  const languageId = await insertLanguage(t, { key: "PY3" });
  const otherLanguageId = await insertLanguage(t, { key: "CPP17" });

  const problemId = await insertProblem(t, {
    code: "aplusb",
    allowedLanguageIds: [languageId],
    ...problemOptions,
  });

  const authorId = await insertProfile(t, { username: "author" });

  return { t, languageId, otherLanguageId, problemId, authorId };
}

describe("submissions.submit", () => {
  it("queues a submission with its source", async () => {
    const { t } = await fixture();
    const as = asUser(t, "author");

    const { submissionId, id } = await as.mutation(api.submissions.submit, {
      problemCode: "aplusb",
      languageKey: "PY3",
      source: "print(1)",
    });

    expect(id).toBe(1);
    const submission = await t.run(async (ctx) => ctx.db.get(submissionId));
    expect(submission?.status).toBe("QU");
    expect(submission?.priority).toBe(1);
    expect(submission?.legacyId).toBe(1);

    const source = await t.run(async (ctx) =>
      ctx.db
        .query("submissionSources")
        .withIndex("by_submission", (q) => q.eq("submissionId", submissionId))
        .unique(),
    );

    expect(source?.source).toBe("print(1)");

    // The integer id continues from the highest one already stored.
    const second = await as.mutation(api.submissions.submit, {
      problemCode: "aplusb",
      languageKey: "PY3",
      source: "print(2)",
    });

    expect(second.id).toBe(2);
  });

  it("refuses a language the problem does not allow", async () => {
    const { t } = await fixture();
    const as = asUser(t, "author");
    await expect(
      as.mutation(api.submissions.submit, {
        problemCode: "aplusb",
        languageKey: "CPP17",
        source: "int main(){}",
      }),
    ).rejects.toThrow(/not allowed/);
  });

  it("refuses source over 65536 characters", async () => {
    const { t } = await fixture();
    const as = asUser(t, "author");
    await expect(
      as.mutation(api.submissions.submit, {
        problemCode: "aplusb",
        languageKey: "PY3",
        source: "x".repeat(MAX_SOURCE_LENGTH + 1),
      }),
    ).rejects.toThrow(/at most 65536/);
  });

  it("refuses a banned user", async () => {
    const t = setupTest();
    const languageId = await insertLanguage(t, { key: "PY3" });
    const authorId = await insertProfile(t, { username: "author" });
    await insertProblem(t, {
      code: "aplusb",
      allowedLanguageIds: [languageId],
      bannedProfileIds: [authorId],
    });
    await expect(
      asUser(t, "author").mutation(api.submissions.submit, {
        problemCode: "aplusb",
        languageKey: "PY3",
        source: "print(1)",
      }),
    ).rejects.toThrow(/persona non grata/);
  });

  it("refuses a problem the user cannot see", async () => {
    const { t } = await fixture({ isPublic: false });
    await expect(
      asUser(t, "author").mutation(api.submissions.submit, {
        problemCode: "aplusb",
        languageKey: "PY3",
        source: "print(1)",
      }),
    ).rejects.toThrow(/may not submit/);
  });

  it("stops at DMOJ_SUBMISSION_LIMIT submissions in flight", async () => {
    const { t, languageId, problemId, authorId } = await fixture();
    await insertSubmission(t, { profileId: authorId, problemId, languageId, status: "QU" });
    await insertSubmission(t, { profileId: authorId, problemId, languageId, status: "G" });

    await expect(
      asUser(t, "author").mutation(api.submissions.submit, {
        problemCode: "aplusb",
        languageKey: "PY3",
        source: "print(1)",
      }),
    ).rejects.toThrow(/too many submissions/);
  });

  it("does not count rejudged submissions towards the in-flight limit", async () => {
    const { t, languageId, problemId, authorId } = await fixture();
    await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      status: "QU",
      rejudgedDate: Date.now(),
    });
    await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      status: "QU",
      rejudgedDate: Date.now(),
    });

    const result = await asUser(t, "author").mutation(api.submissions.submit, {
      problemCode: "aplusb",
      languageKey: "PY3",
      source: "print(1)",
    });

    expect(result.submissionId).toBeTruthy();
  });

  it("lets judge.spam_submission past the limits", async () => {
    const t = setupTest();
    const languageId = await insertLanguage(t, { key: "PY3" });
    const problemId = await insertProblem(t, { code: "aplusb", allowedLanguageIds: [languageId] });

    const authorId = await insertProfile(t, {
      username: "author",
      permissions: ["judge.spam_submission"],
    });

    await insertSubmission(t, { profileId: authorId, problemId, languageId, status: "QU" });
    await insertSubmission(t, { profileId: authorId, problemId, languageId, status: "G" });

    const result = await asUser(t, "author").mutation(api.submissions.submit, {
      problemCode: "aplusb",
      languageKey: "PY3",
      source: "print(1)",
    });

    expect(result.submissionId).toBeTruthy();
  });

  it("runs out of burst tokens on a flood", async () => {
    const { t } = await fixture();
    const as = asUser(t, "author");
    let rejected = 0;

    for (let i = 0; i < 12; i++) {
      try {
        const { submissionId } = await as.mutation(api.submissions.submit, {
          problemCode: "aplusb",
          languageKey: "PY3",
          source: `print(${i})`,
        });

        // Take it out of flight so only the rate limiter can stop the next one.
        await t.run(async (ctx) => ctx.db.patch(submissionId, { status: "D", result: "AC" }));
      } catch {
        rejected += 1;
      }
    }

    expect(rejected).toBeGreaterThan(0);
  });

  it("refuses a judge pin from someone who cannot edit the problem", async () => {
    const { t } = await fixture();
    await insertJudge(t, { name: "local" });
    await expect(
      asUser(t, "author").mutation(api.submissions.submit, {
        problemCode: "aplusb",
        languageKey: "PY3",
        source: "print(1)",
        judgePin: "local",
      }),
    ).rejects.toThrow(/may not pin/);
  });

  it("pins to a judge for a problem editor", async () => {
    const t = setupTest();
    const languageId = await insertLanguage(t, { key: "PY3" });

    const editorId = await insertProfile(t, {
      username: "editor",
      permissions: ["judge.edit_own_problem", "judge.edit_all_problem"],
    });

    await insertProblem(t, {
      code: "aplusb",
      allowedLanguageIds: [languageId],
      authorProfileIds: [editorId],
    });
    const judgeId = await insertJudge(t, { name: "local" });

    const { submissionId } = await asUser(t, "editor").mutation(api.submissions.submit, {
      problemCode: "aplusb",
      languageKey: "PY3",
      source: "print(1)",
      judgePin: "local",
    });

    expect((await t.run(async (ctx) => ctx.db.get(submissionId)))?.judgePin).toBe(judgeId);
  });
});

describe("submissions.abort", () => {
  it("aborts a queued submission immediately", async () => {
    const { t, languageId, problemId, authorId } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      status: "QU",
    });

    const result = await asUser(t, "author").mutation(api.submissions.abort, { submissionId });
    expect(result).toEqual({ aborted: true, pending: false });

    const submission = await t.run(async (ctx) => ctx.db.get(submissionId));
    expect(submission?.status).toBe("AB");
    expect(submission?.result).toBe("AB");
    expect(submission?.points).toBe(0);
  });

  it("flags a submission the judge already holds", async () => {
    const { t, languageId, problemId, authorId } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      status: "G",
    });

    const result = await asUser(t, "author").mutation(api.submissions.abort, { submissionId });
    expect(result).toEqual({ aborted: false, pending: true });
    expect((await t.run(async (ctx) => ctx.db.get(submissionId)))?.abortRequested).toBe(true);
  });

  it("leaves a finished submission alone", async () => {
    const { t, languageId, problemId, authorId } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      status: "D",
      result: "AC",
    });

    await asUser(t, "author").mutation(api.submissions.abort, { submissionId });
    expect((await t.run(async (ctx) => ctx.db.get(submissionId)))?.status).toBe("D");
  });

  it("refuses someone else's submission without abort_any_submission", async () => {
    const { t, languageId, problemId, authorId } = await fixture();
    await insertProfile(t, { username: "stranger" });

    const submissionId = await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      status: "QU",
    });

    await expect(asUser(t, "stranger").mutation(api.submissions.abort, { submissionId })).rejects.toThrow(
      /may not abort/,
    );

    await insertProfile(t, { username: "staff", permissions: ["judge.abort_any_submission"] });
    await asUser(t, "staff").mutation(api.submissions.abort, { submissionId });
    expect((await t.run(async (ctx) => ctx.db.get(submissionId)))?.status).toBe("AB");
  });

  it("refuses a rejudged submission to its own author", async () => {
    const { t, languageId, problemId, authorId } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      status: "QU",
      rejudgedDate: Date.now(),
    });

    await expect(asUser(t, "author").mutation(api.submissions.abort, { submissionId })).rejects.toThrow(
      /may not abort/,
    );
  });
});

describe("submissions.rejudge", () => {
  it("resets everything judgeapi.judge_submission resets", async () => {
    const { t, languageId, problemId, authorId } = await fixture();
    await insertProfile(t, { username: "staff", permissions: ["judge.rejudge_submission"] });
    const judgeId = await insertJudge(t);

    const submissionId = await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      status: "D",
      result: "AC",
      points: 100,
      casePoints: 100,
      caseTotal: 100,
      currentTestcase: 4,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(submissionId, {
        time: 1.5,
        memory: 1000,
        error: "old",
        judgedOnJudgeId: judgeId,
        judgedDate: Date.now(),
        batch: true,
      });
      await ctx.db.insert("submissionTestCases", {
        submissionId,
        case: 1,
        status: "AC",
        time: 1,
        memory: 1,
        points: 1,
        total: 1,
        feedback: "",
        extendedFeedback: "",
        output: "",
      });
    });

    await asUser(t, "staff").mutation(api.submissions.rejudge, { submissionId });

    const submission = await t.run(async (ctx) => ctx.db.get(submissionId));
    expect(submission?.status).toBe("QU");
    expect(submission?.result).toBeUndefined();
    expect(submission?.points).toBeUndefined();
    expect(submission?.time).toBeUndefined();
    expect(submission?.memory).toBeUndefined();
    expect(submission?.error).toBeUndefined();
    expect(submission?.casePoints).toBe(0);
    expect(submission?.caseTotal).toBe(0);
    expect(submission?.currentTestcase).toBe(0);
    expect(submission?.batch).toBe(false);
    expect(submission?.judgedOnJudgeId).toBeUndefined();
    expect(submission?.priority).toBe(2);
    expect(submission?.rejudgedDate).toBeGreaterThan(0);

    const cases = await t.run(async (ctx) =>
      ctx.db
        .query("submissionTestCases")
        .withIndex("by_submission_case", (q) => q.eq("submissionId", submissionId))
        .collect(),
    );

    expect(cases).toHaveLength(0);
  });

  it("refuses a submission a judge is already grading", async () => {
    const { t, languageId, problemId, authorId } = await fixture();
    await insertProfile(t, { username: "staff", permissions: ["judge.rejudge_submission"] });

    const submissionId = await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      status: "G",
    });

    await expect(asUser(t, "staff").mutation(api.submissions.rejudge, { submissionId })).rejects.toThrow(
      /already being judged/,
    );
  });

  it("refuses without the permission, and refuses a locked submission", async () => {
    const { t, languageId, problemId, authorId } = await fixture();
    await insertProfile(t, { username: "staff", permissions: ["judge.rejudge_submission"] });

    const submissionId = await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      status: "D",
      lockedAfter: Date.now() - 1000,
    });

    await expect(asUser(t, "author").mutation(api.submissions.rejudge, { submissionId })).rejects.toThrow(
      /judge.rejudge_submission/,
    );
    await expect(asUser(t, "staff").mutation(api.submissions.rejudge, { submissionId })).rejects.toThrow(
      /locked/,
    );
  });
});
