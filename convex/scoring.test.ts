// @vitest-environment edge-runtime
/**
 * Problem scoring kinds end to end: a code golf problem graded through the
 * judge API, with the rescore a moved best schedules drained before checking.
 */

import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import {
  insertContest,
  insertContestProblem,
  insertJudge,
  insertLanguage,
  insertParticipation,
  insertProblem,
  insertProfile,
  insertSubmission,
} from "./test.fixtures";
import { claimResponse, judgeCase, judgeClient, setupTest, type T } from "./test.setup";

/** Claim the next submission on the one judge and grade it with a single case. */
async function grade(t: T, accepted = true): Promise<void> {
  const client = judgeClient(t, "local");
  const body = await claimResponse(await client.claim());

  if (!body.submission) throw new Error("nothing to claim");
  const id = Number(body.submission.submissionId);

  await client.event(id, { type: "grading-begin", pretested: false });
  await client.event(id, {
    type: "test-case-status",
    cases: [judgeCase(1, accepted ? 0 : 1, accepted ? 100 : 0, 100)],
  });
  await client.event(id, { type: "grading-end" });
}

async function golfSetup() {
  const t = setupTest();
  const languageId = await insertLanguage(t);
  const problemId = await insertProblem(t, { points: 100, partial: false, scoring: { kind: "golf" } });
  await insertJudge(t, { name: "local" });

  return { t, languageId, problemId };
}

async function makeContest(t: T, problemId: Id<"problems">) {
  const now = Date.now();

  const contestId = await insertContest(t, {
    key: "golf",
    name: "Golf contest",
    startTime: now - 3600_000,
    endTime: now + 3600_000,
    formatName: "default",
  });

  const contestProblemId = await insertContestProblem(t, {
    contestId,
    problemId,
    points: 50,
    partial: false,
    isPretested: false,
    order: 1,
  });

  return { contestId, contestProblemId };
}

/** A source of exactly `bytes` bytes once trailing whitespace is trimmed. */
function sourceOf(bytes: number): string {
  return `${"x".repeat(bytes)}\n`;
}

describe("code golf scoring", () => {
  it("lowers an earlier entrant's contest points and score when a shorter solution arrives", async () => {
    const { t, languageId, problemId } = await golfSetup();
    const { contestId, contestProblemId } = await makeContest(t, problemId);
    const first = await insertProfile(t);
    const second = await insertProfile(t);
    const realStart = Date.now() - 600_000;
    const firstParticipation = await insertParticipation(t, { contestId, profileId: first, realStart });
    const secondParticipation = await insertParticipation(t, { contestId, profileId: second, realStart });
    const contest = { contestId, contestProblemId };

    const longer = await insertSubmission(t, {
      profileId: first,
      problemId,
      languageId,
      status: "QU",
      legacyId: 1,
      date: 1,
      source: sourceOf(100),
      participationId: firstParticipation,
      ...contest,
    });

    await grade(t);
    await t.finishAllScheduledFunctions(() => {});

    expect((await t.run(async (ctx) => ctx.db.get(longer)))?.contestPoints).toBe(50);
    expect((await t.run(async (ctx) => ctx.db.get(firstParticipation)))?.score).toBe(50);

    const shorter = await insertSubmission(t, {
      profileId: second,
      problemId,
      languageId,
      status: "QU",
      legacyId: 2,
      date: 2,
      source: sourceOf(40),
      participationId: secondParticipation,
      ...contest,
    });

    await grade(t);
    await t.finishAllScheduledFunctions(() => {});

    const [a, b, aEntry, bEntry, best] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.get(longer),
        ctx.db.get(shorter),
        ctx.db.get(firstParticipation),
        ctx.db.get(secondParticipation),
        ctx.db
          .query("scoringBests")
          .withIndex("by_problem_contestProblem", (q) =>
            q.eq("problemId", problemId).eq("contestProblemId", contestProblemId),
          )
          .unique(),
      ]),
    );

    expect(best?.best).toEqual({ kind: "golf", bytes: 40 });
    expect(a?.scoringMeasure).toEqual({ kind: "golf", bytes: 100 });
    expect(b?.contestPoints).toBe(50);
    expect(a?.contestPoints).toBe(20);
    expect(bEntry?.score).toBe(50);
    expect(aEntry?.score).toBe(20);
    // Practice points are against the problem's own best, out of its points.
    expect(a?.points).toBe(40);
    expect(b?.points).toBe(100);
  });

  it("rescores practice submissions and their authors' profile points", async () => {
    const { t, languageId, problemId } = await golfSetup();
    const first = await insertProfile(t);
    const second = await insertProfile(t);

    const longer = await insertSubmission(t, {
      profileId: first,
      problemId,
      languageId,
      status: "QU",
      legacyId: 1,
      date: 1,
      source: sourceOf(80),
    });

    await grade(t);
    await t.finishAllScheduledFunctions(() => {});
    expect((await t.run(async (ctx) => ctx.db.get(first)))?.points).toBe(100);

    await insertSubmission(t, {
      profileId: second,
      problemId,
      languageId,
      status: "QU",
      legacyId: 2,
      date: 2,
      source: sourceOf(20),
    });

    await grade(t);
    await t.finishAllScheduledFunctions(() => {});

    const [submission, firstProfile, secondProfile] = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(longer), ctx.db.get(first), ctx.db.get(second)]),
    );

    expect(submission?.points).toBe(25);
    expect(firstProfile?.points).toBe(25);
    expect(secondProfile?.points).toBe(100);
  });

  it("scores a rejected submission zero and leaves the best where it was", async () => {
    const { t, languageId, problemId } = await golfSetup();
    const author = await insertProfile(t);

    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 1,
      date: 1,
      source: sourceOf(60),
    });

    await grade(t);

    const rejected = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 2,
      date: 2,
      source: sourceOf(5),
    });

    await grade(t, false);
    await t.finishAllScheduledFunctions(() => {});

    const [submission, best] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.get(rejected),
        ctx.db
          .query("scoringBests")
          .withIndex("by_problem_contestProblem", (q) =>
            q.eq("problemId", problemId).eq("contestProblemId", undefined),
          )
          .unique(),
      ]),
    );

    expect(submission?.points).toBe(0);
    expect(submission?.scoringMeasure).toBeUndefined();
    expect(best?.best).toEqual({ kind: "golf", bytes: 60 });
  });

  it("rebuilds the best when the submission holding it is rejudged", async () => {
    const { t, languageId, problemId } = await golfSetup();
    const first = await insertProfile(t);
    const second = await insertProfile(t);

    const longer = await insertSubmission(t, {
      profileId: first,
      problemId,
      languageId,
      status: "QU",
      legacyId: 1,
      date: 1,
      source: sourceOf(50),
    });

    await grade(t);

    const shorter = await insertSubmission(t, {
      profileId: second,
      problemId,
      languageId,
      status: "QU",
      legacyId: 2,
      date: 2,
      source: sourceOf(10),
    });

    await grade(t);
    await t.finishAllScheduledFunctions(() => {});
    expect((await t.run(async (ctx) => ctx.db.get(longer)))?.points).toBe(20);

    const { queueSubmission } = await import("./judging");
    await t.run(async (ctx) => queueSubmission(ctx, shorter, { rejudge: true }));
    await t.finishAllScheduledFunctions(() => {});

    expect((await t.run(async (ctx) => ctx.db.get(longer)))?.points).toBe(100);
    expect((await t.run(async (ctx) => ctx.db.get(first)))?.points).toBe(100);

    // The rejudge now fails, so the best stays with the longer solution.
    await grade(t, false);
    await t.finishAllScheduledFunctions(() => {});

    const [rejudged, kept] = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(shorter), ctx.db.get(longer)]),
    );

    expect(rejudged?.points).toBe(0);
    expect(kept?.points).toBe(100);
  });

  it("leaves a problem without a scoring kind on its case points", async () => {
    const t = setupTest();
    const languageId = await insertLanguage(t);
    const problemId = await insertProblem(t, { points: 100, partial: false });
    const author = await insertProfile(t);
    await insertJudge(t, { name: "local" });

    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 1,
      source: sourceOf(500),
    });

    await grade(t);

    const [submission, bests] = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(submissionId), ctx.db.query("scoringBests").collect()]),
    );

    expect(submission?.points).toBe(100);
    expect(submission?.scoringMeasure).toBeUndefined();
    expect(bests).toEqual([]);
  });
});
