// @vitest-environment edge-runtime
/**
 * The grading event sequence, driven over HTTP exactly as
 * `apps/judge/judge-server/dmoj/moj_packet.py` sends it.
 *
 * The four submissions here are the ones `apps/judge/tests/e2e.py` feeds a real
 * judge: accepted, wrong with a short circuit, timed out, and aborted from the
 * site part way through.
 */

import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import {
  asUser,
  insertJudge,
  insertLanguage,
  insertProblem,
  insertProfile,
  insertSubmission,
  type Overrides,
} from "./test.fixtures";
import { type JudgeClient, judgeCase, judgeClient, setupTest, type T } from "./test.setup";

async function fixture(problemOptions: Overrides<"problems"> = {}) {
  const t = setupTest();
  const languageId = await insertLanguage(t, { key: "PY3" });

  const problemId = await insertProblem(t, {
    code: "aplusb",
    allowedLanguageIds: [languageId],
    points: 100,
    partial: true,
    ...problemOptions,
  });

  const author = await insertProfile(t, { username: "author" });
  const judgeId = await insertJudge(t, { name: "local" });
  const client = judgeClient(t, "local");

  return { t, languageId, problemId, author, judgeId, client };
}

async function claim(client: JudgeClient): Promise<number> {
  const body = (await (await client.claim()).json()) as {
    submission: { submissionId: number } | null;
  };

  if (!body.submission) throw new Error("nothing to claim");

  return body.submission.submissionId;
}

async function send(client: JudgeClient, id: number | string, event: Record<string, unknown>) {
  const response = await client.event(id, event);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
}

async function readSubmission(t: T, submissionId: Id<"submissions">) {
  return await t.run(async (ctx) => ctx.db.get(submissionId));
}

async function readCases(t: T, submissionId: Id<"submissions">) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("submissionTestCases")
      .withIndex("by_submission_case", (q) => q.eq("submissionId", submissionId))
      .collect(),
  );

  return rows.sort((a, b) => a.case - b.case);
}

describe("the grading sequence", () => {
  it("grades an accepted submission across two batches", async () => {
    const { t, languageId, problemId, author, client } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 1,
    });

    const id = await claim(client);
    expect(id).toBe(1);

    // Every compiled executor reports its (usually empty) compiler output.
    await send(client, id, { type: "compile-message", log: "" });
    expect((await readSubmission(t, submissionId))?.error).toBeUndefined();

    await send(client, id, { type: "grading-begin", pretested: false });
    expect((await readSubmission(t, submissionId))?.status).toBe("G");

    await send(client, id, { type: "batch-begin" });
    await send(client, id, {
      type: "test-case-status",
      cases: [judgeCase(1, 0, 0, 0), judgeCase(2, 0, 0, 0)],
    });
    await send(client, id, { type: "batch-end" });

    await send(client, id, { type: "batch-begin" });
    await send(client, id, {
      type: "test-case-status",
      cases: [judgeCase(3, 0, 100, 100), judgeCase(4, 0, 100, 100)],
    });
    await send(client, id, { type: "batch-end" });
    await send(client, id, { type: "grading-end" });

    const submission = await readSubmission(t, submissionId);
    expect(submission?.status).toBe("D");
    expect(submission?.result).toBe("AC");
    expect(submission?.points).toBe(100);
    expect(submission?.casePoints).toBe(100);
    expect(submission?.caseTotal).toBe(100);
    expect(submission?.batch).toBe(true);
    expect(submission?.memory).toBe(9644);
    expect(submission?.claimedByJudgeId).toBeUndefined();

    const cases = await readCases(t, submissionId);
    expect(cases.map((row) => [row.case, row.status, row.batch])).toEqual([
      [1, "AC", 1],
      [2, "AC", 1],
      [3, "AC", 2],
      [4, "AC", 2],
    ]);

    const judgeRow = await t.run(async (ctx) => ctx.db.query("judges").first());
    expect(judgeRow?.currentSubmissionId).toBeUndefined();
  });

  it("collapses a short-circuited batch to its minimum points", async () => {
    const { t, languageId, problemId, author, client } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 2,
    });

    const id = await claim(client);

    await send(client, id, { type: "grading-begin", pretested: false });
    await send(client, id, { type: "batch-begin" });
    await send(client, id, { type: "test-case-status", cases: [judgeCase(1, 0, 0, 0)] });
    await send(client, id, { type: "batch-end" });
    await send(client, id, { type: "batch-begin" });
    await send(client, id, {
      type: "test-case-status",
      // A wrong case, then the rest of the batch short-circuited (status 32).
      cases: [judgeCase(2, 1, 0, 100), judgeCase(3, 32, 0, 100)],
    });
    await send(client, id, { type: "batch-end" });
    await send(client, id, { type: "grading-end" });

    const submission = await readSubmission(t, submissionId);
    expect(submission?.result).toBe("WA");
    expect(submission?.casePoints).toBe(0);
    expect(submission?.caseTotal).toBe(100);
    expect(submission?.points).toBe(0);

    const cases = await readCases(t, submissionId);
    expect(cases.map((row) => row.status)).toEqual(["AC", "WA", "SC"]);
  });

  it("decodes a timed-out case that also carries the RTE and WA bits", async () => {
    const { t, languageId, problemId, author, client } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 3,
    });

    const id = await claim(client);

    await send(client, id, { type: "grading-begin", pretested: false });
    await send(client, id, { type: "batch-begin" });
    // 7 is TLE | RTE | WA; the first bit that matches decides, so it is TLE.
    await send(client, id, {
      type: "test-case-status",
      cases: [judgeCase(1, 7, 0, 100, { time: 1.0 })],
    });
    await send(client, id, { type: "batch-end" });
    await send(client, id, { type: "grading-end" });

    const submission = await readSubmission(t, submissionId);
    expect(submission?.result).toBe("TLE");
    expect(submission?.points).toBe(0);
    expect((await readCases(t, submissionId))[0]?.status).toBe("TLE");
  });

  it("aborts a submission the judge already holds", async () => {
    const { t, languageId, problemId, author, client } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 4,
    });

    const id = await claim(client);
    await send(client, id, { type: "grading-begin", pretested: false });

    expect(await (await client.abortFlag(id)).json()).toEqual({ abort: false });

    await asUser(t, "author").mutation(
      // The submission's own author may abort it.
      (await import("./_generated/api")).api.submissions.abort,
      { submissionId: id },
    );
    expect(await (await client.abortFlag(id)).json()).toEqual({ abort: true });
    expect((await readSubmission(t, submissionId))?.status).toBe("G");

    await send(client, id, { type: "submission-terminated" });
    const submission = await readSubmission(t, submissionId);
    expect(submission?.status).toBe("AB");
    expect(submission?.result).toBe("AB");
    expect(submission?.points).toBe(0);
    expect(submission?.abortRequested).toBeUndefined();
  });

  it("records a compile error and frees the judge", async () => {
    const { t, languageId, problemId, author, judgeId, client } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 5,
    });

    const id = await claim(client);
    await send(client, id, { type: "compile-error", log: "SyntaxError: bad" });

    const submission = await readSubmission(t, submissionId);
    expect(submission?.status).toBe("CE");
    expect(submission?.result).toBe("CE");
    expect(submission?.error).toBe("SyntaxError: bad");
    expect((await t.run(async (ctx) => ctx.db.get(judgeId)))?.currentSubmissionId).toBeUndefined();
  });

  it("records an internal error", async () => {
    const { t, languageId, problemId, author, client } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 6,
    });

    const id = await claim(client);
    await send(client, id, { type: "internal-error", message: "Traceback..." });

    const submission = await readSubmission(t, submissionId);
    expect(submission?.status).toBe("IE");
    expect(submission?.result).toBe("IE");
    expect(submission?.error).toContain("Traceback");
  });

  it("keeps a non-empty compile message as the submission's error", async () => {
    const { t, languageId, problemId, author, client } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 7,
    });

    const id = await claim(client);
    await send(client, id, { type: "compile-message", log: "warning: unused variable" });
    expect((await readSubmission(t, submissionId))?.error).toBe("warning: unused variable");
  });

  it("zeroes a non-partial problem that did not score full marks", async () => {
    const { t, languageId, problemId, author, client } = await fixture({ partial: false });

    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 8,
    });

    const id = await claim(client);
    await send(client, id, { type: "grading-begin", pretested: false });
    await send(client, id, {
      type: "test-case-status",
      cases: [judgeCase(1, 0, 50, 50), judgeCase(2, 1, 0, 50)],
    });
    await send(client, id, { type: "grading-end" });

    const submission = await readSubmission(t, submissionId);
    expect(submission?.casePoints).toBe(50);
    expect(submission?.caseTotal).toBe(100);
    expect(submission?.points).toBe(0);
    expect(submission?.result).toBe("WA");
  });
});

describe("repeated events", () => {
  it("is idempotent when the judge retries a packet", async () => {
    const { t, languageId, problemId, author, client } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 9,
    });

    const id = await claim(client);

    await send(client, id, { type: "grading-begin", pretested: false });
    await send(client, id, { type: "batch-begin" });
    await send(client, id, { type: "test-case-status", cases: [judgeCase(1, 0, 100, 100)] });
    // Every one of these arrives twice.
    await send(client, id, { type: "grading-begin", pretested: false });
    await send(client, id, { type: "batch-begin" });
    await send(client, id, { type: "test-case-status", cases: [judgeCase(1, 0, 100, 100)] });
    await send(client, id, { type: "batch-end" });
    await send(client, id, { type: "batch-end" });

    const cases = await readCases(t, submissionId);
    expect(cases).toHaveLength(1);
    expect(cases[0]?.batch).toBe(1);
    expect((await readSubmission(t, submissionId))?.status).toBe("G");

    await send(client, id, { type: "grading-end" });
    const first = await readSubmission(t, submissionId);
    await send(client, id, { type: "grading-end" });
    const second = await readSubmission(t, submissionId);
    expect(second?.points).toBe(first?.points);
    expect(second?.result).toBe("AC");
  });

  it("answers an event for a submission that no longer exists", async () => {
    const { t, languageId, problemId, author, client } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 10,
    });

    await claim(client);
    await t.run(async (ctx) => ctx.db.delete(submissionId));

    const response = await client.event(10, { type: "grading-end" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false, error: "unknown submission" });
  });

  it("accepts a Convex document id as the submission id", async () => {
    const { t, languageId, problemId, author, client } = await fixture();

    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 11,
    });

    await claim(client);
    await send(client, submissionId, { type: "grading-begin", pretested: true });
    const submission = await readSubmission(t, submissionId);
    expect(submission?.status).toBe("G");
    expect(submission?.isPretested).toBe(true);
  });

  it("rejects an unknown event type", async () => {
    const { t, languageId, problemId, author, client } = await fixture();
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 12,
    });
    const id = await claim(client);
    const response = await client.event(id, { type: "nonsense" });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(false);
  });
});
