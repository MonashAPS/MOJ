// @vitest-environment edge-runtime
/**
 * Problem scoring kinds end to end: a code golf problem graded through the
 * judge API, with the rescore a moved best schedules drained before checking.
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  asUser,
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

  it("scores a virtual entrant against the live best without moving it", async () => {
    const { t, languageId, problemId } = await golfSetup();
    const { contestId, contestProblemId } = await makeContest(t, problemId);
    const first = await insertProfile(t);
    const second = await insertProfile(t);
    const late = await insertProfile(t);
    const realStart = Date.now() - 600_000;
    const firstParticipation = await insertParticipation(t, { contestId, profileId: first, realStart });
    const secondParticipation = await insertParticipation(t, { contestId, profileId: second, realStart });

    const virtualParticipation = await insertParticipation(t, {
      contestId,
      profileId: late,
      realStart: Date.now(),
      virtual: 1,
    });

    const contest = { contestId, contestProblemId };
    let legacyId = 0;

    async function submit(
      profileId: Id<"profiles">,
      participationId: Id<"contestParticipations">,
      bytes: number,
    ) {
      legacyId += 1;

      const submissionId = await insertSubmission(t, {
        profileId,
        problemId,
        languageId,
        status: "QU",
        legacyId,
        date: legacyId,
        source: sourceOf(bytes),
        participationId,
        ...contest,
      });

      await grade(t);
      await t.finishAllScheduledFunctions(() => {});

      return submissionId;
    }

    const longer = await submit(first, firstParticipation, 100);
    const shorter = await submit(second, secondParticipation, 50);

    // Against the live best of 50: half of the contest problem's 50 points.
    const virtualLonger = await submit(late, virtualParticipation, 100);
    expect((await t.run(async (ctx) => ctx.db.get(virtualLonger)))?.contestPoints).toBe(25);

    const virtualShortest = await submit(late, virtualParticipation, 10);

    const [a, b, aEntry, bEntry, mine, mineEntry, best] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.get(longer),
        ctx.db.get(shorter),
        ctx.db.get(firstParticipation),
        ctx.db.get(secondParticipation),
        ctx.db.get(virtualShortest),
        ctx.db.get(virtualParticipation),
        ctx.db
          .query("scoringBests")
          .withIndex("by_problem_contestProblem", (q) =>
            q.eq("problemId", problemId).eq("contestProblemId", contestProblemId),
          )
          .unique(),
      ]),
    );

    expect(best?.best).toEqual({ kind: "golf", bytes: 50 });
    expect(a?.contestPoints).toBe(25);
    expect(b?.contestPoints).toBe(50);
    expect(aEntry?.score).toBe(25);
    expect(bEntry?.score).toBe(50);
    // Shorter than anything live is full marks, never more.
    expect(mine?.contestPoints).toBe(50);
    expect(mineEntry?.score).toBe(50);
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

  it("shows the problem page the kind and the shortest so far, and lists the byte count", async () => {
    const { t, languageId, problemId } = await golfSetup();
    const author = await insertProfile(t);

    expect((await t.query(api.problems.get, { code: "aplusb" }))?.scoring).toEqual({
      kind: "golf",
      best: null,
    });

    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 1,
      source: sourceOf(33),
    });
    await grade(t);

    expect((await t.query(api.problems.get, { code: "aplusb" }))?.scoring).toEqual({
      kind: "golf",
      best: { kind: "golf", bytes: 33 },
    });

    const rows = await t.query(api.submissions.list, { paginationOpts: { numItems: 10, cursor: null } });
    expect(rows.page[0]?.bytes).toBe(33);
  });

  it("lets the staff console set golf and switch back to standard, dropping the bests", async () => {
    const { t, languageId, problemId } = await golfSetup();
    const author = await insertProfile(t);

    await insertProfile(t, {
      username: "root",
      isStaff: true,
      isSuperuser: true,
      permissions: ["judge.edit_all_problem"],
    });

    await t.run(async (ctx) => ctx.db.patch(problemId, { scoring: undefined }));
    const staff = asUser(t, "root");

    const golf = await staff.mutation(api.admin.problems.update, {
      code: "aplusb",
      scoring: { kind: "golf" },
    });

    expect(golf.rescoreScheduled).toBe(false);
    expect((await t.run(async (ctx) => ctx.db.get(problemId)))?.scoring).toEqual({ kind: "golf" });

    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 1,
      source: sourceOf(12),
    });
    await grade(t);
    expect(await t.run(async (ctx) => ctx.db.query("scoringBests").collect())).toHaveLength(1);

    // Saving the form without touching the kind keeps the bests.
    await staff.mutation(api.admin.problems.update, { code: "aplusb", name: "Renamed" });
    expect(await t.run(async (ctx) => ctx.db.query("scoringBests").collect())).toHaveLength(1);

    await staff.mutation(api.admin.problems.update, { code: "aplusb", scoring: { kind: "standard" } });

    const [problem, bests] = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(problemId), ctx.db.query("scoringBests").collect()]),
    );

    expect(problem?.scoring).toBeUndefined();
    expect(bests).toEqual([]);
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
