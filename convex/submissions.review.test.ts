// @vitest-environment edge-runtime
/**
 * Staff-scored problems: a submission waits as `RV` instead of going to a
 * judge, and someone who may edit the problem or its contest scores it.
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  asUser,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertParticipation,
  insertProblem,
  insertProfile,
  insertSubmission,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

async function fixture() {
  const t = setupTest();
  const languageId = await insertLanguage(t, { key: "TEXT" });

  const problemId = await insertProblem(t, {
    code: "essay",
    points: 50,
    allowedLanguageIds: [languageId],
    manualGrading: true,
  });

  const authorId = await insertProfile(t, { username: "author" });

  await insertProfile(t, {
    username: "setter",
    isStaff: true,
    permissions: ["judge.edit_own_problem", "judge.edit_all_problem", "judge.see_private_contest"],
  });

  return { t, languageId, problemId, authorId };
}

async function contestFixture() {
  const base = await fixture();
  const { t, problemId, authorId, languageId } = base;
  const now = Date.now();

  const organiserId = await insertProfile(t, {
    username: "organiser",
    permissions: ["judge.edit_own_contest"],
  });

  const contestId = await insertContest(t, {
    key: "cup",
    startTime: now - 3600_000,
    endTime: now + 3600_000,
    curatorProfileIds: [organiserId],
  });

  const contestProblemId = await insertContestProblem(t, { contestId, problemId, points: 200, order: 1 });

  const participationId = await insertParticipation(t, {
    contestId,
    profileId: authorId,
    realStart: now - 600_000,
  });

  const submissionId = await insertSubmission(t, {
    profileId: authorId,
    problemId,
    languageId,
    contestId,
    contestProblemId,
    participationId,
    status: "RV",
    casePoints: 0,
    caseTotal: 0,
    contestPoints: 0,
    source: "My essay.",
  });

  return { ...base, contestId, contestProblemId, participationId, submissionId };
}

async function get(t: T, id: Id<"submissions">) {
  return await t.run(async (ctx) => ctx.db.get(id));
}

describe("submitting to a staff-scored problem", () => {
  it("waits for a score instead of going to a judge, and never counts as in flight", async () => {
    const { t } = await fixture();
    const as = asUser(t, "author");

    // Three in a row: the in-flight limit of two would refuse the third if
    // waiting for a score counted as being judged.
    for (const source of ["one", "two", "three"]) {
      const { submissionId } = await as.mutation(api.submissions.submit, {
        problemCode: "essay",
        languageKey: "TEXT",
        source,
      });

      expect((await get(t, submissionId))?.status).toBe("RV");
    }
  });

  it("offers every allowed language whether or not a judge runs it", async () => {
    const { t } = await fixture();
    const usable = await asUser(t, "author").query(api.languages.usableForProblem, { code: "essay" });

    expect(usable?.manualGrading).toBe(true);
    expect(usable?.onlineJudges).toBe(0);
    expect(usable?.languages.map((row) => row.key)).toEqual(["TEXT"]);
  });

  it("can be withdrawn by its author while it waits", async () => {
    const { t } = await fixture();
    const as = asUser(t, "author");

    const { submissionId } = await as.mutation(api.submissions.submit, {
      problemCode: "essay",
      languageKey: "TEXT",
      source: "draft",
    });

    expect(await as.mutation(api.submissions.abort, { submissionId })).toEqual({
      aborted: true,
      pending: false,
    });
    expect((await get(t, submissionId))?.status).toBe("AB");
  });
});

describe("submissions.review", () => {
  it("scores a contest submission out of its contest problem's points and moves the standings", async () => {
    const { t, submissionId, participationId } = await contestFixture();

    await asUser(t, "setter").mutation(api.submissions.review, {
      submissionId,
      score: 150,
      feedback: "  Good argument, missed one case.  ",
    });

    const scored = await get(t, submissionId);

    expect(scored).toMatchObject({
      status: "D",
      result: "AC",
      casePoints: 150,
      caseTotal: 200,
      points: 37.5,
      contestPoints: 150,
      reviewFeedback: "Good argument, missed one case.",
    });

    const participation = await t.run(async (ctx) => ctx.db.get(participationId));

    expect(participation?.score).toBe(150);

    // The author sees the score and the note, and who left it.
    const detail = await asUser(t, "author").query(api.submissions.detail, { submissionId });

    expect(detail?.manualGrading).toBe(true);
    expect(detail?.review).toMatchObject({ feedback: "Good argument, missed one case.", reviewer: "setter" });
    expect(detail?.submission.result).toBe("AC");
    expect(detail?.submission.casePoints).toBe(150);
  });

  it("lets the contest's organiser score it, and scoring again replaces the score", async () => {
    const { t, submissionId, participationId } = await contestFixture();
    const as = asUser(t, "organiser");

    await as.mutation(api.submissions.review, { submissionId, score: 200 });
    expect((await get(t, submissionId))?.result).toBe("AC");

    await as.mutation(api.submissions.review, { submissionId, score: 0 });

    const rescored = await get(t, submissionId);

    expect(rescored).toMatchObject({ result: "WA", casePoints: 0, points: 0, contestPoints: 0 });
    expect(rescored?.reviewFeedback).toBeUndefined();
    expect((await t.run(async (ctx) => ctx.db.get(participationId)))?.score).toBe(0);
  });

  it("takes part marks on a problem that does not otherwise allow them", async () => {
    const { t, problemId, authorId, languageId } = await fixture();
    await t.run(async (ctx) => ctx.db.patch(problemId, { partial: false }));

    const submissionId = await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      status: "RV",
      casePoints: 0,
      caseTotal: 0,
    });

    await asUser(t, "setter").mutation(api.submissions.review, { submissionId, score: 10 });

    expect(await get(t, submissionId)).toMatchObject({ casePoints: 10, caseTotal: 50, points: 10 });
  });

  it("refuses anyone who may not edit the problem or the contest", async () => {
    const { t, submissionId } = await contestFixture();

    await expect(
      asUser(t, "author").mutation(api.submissions.review, { submissionId, score: 1 }),
    ).rejects.toThrow(/may not score/);
  });

  it("refuses a score out of range, a judged problem, and a submission that was withdrawn", async () => {
    const { t, submissionId, problemId, authorId, languageId } = await contestFixture();
    const as = asUser(t, "setter");

    await expect(as.mutation(api.submissions.review, { submissionId, score: 201 })).rejects.toThrow(
      /between 0 and 200/,
    );
    await expect(as.mutation(api.submissions.review, { submissionId, score: -1 })).rejects.toThrow(/between/);

    const judgedProblemId = await insertProblem(t, { code: "judged" });

    const judged = await insertSubmission(t, {
      profileId: authorId,
      problemId: judgedProblemId,
      languageId,
      status: "D",
      result: "WA",
    });

    await expect(as.mutation(api.submissions.review, { submissionId: judged, score: 1 })).rejects.toThrow(
      /judge/,
    );

    const aborted = await insertSubmission(t, { profileId: authorId, problemId, languageId, status: "AB" });

    await expect(as.mutation(api.submissions.review, { submissionId: aborted, score: 1 })).rejects.toThrow(
      /waiting for its score/,
    );
  });

  it("sends a scored submission back to wait when it is rejudged, and takes its points away", async () => {
    const { t, submissionId, participationId } = await contestFixture();
    await insertProfile(t, { username: "rejudger", permissions: ["judge.rejudge_submission"] });

    await asUser(t, "setter").mutation(api.submissions.review, { submissionId, score: 120, feedback: "ok" });
    await asUser(t, "rejudger").mutation(api.submissions.rejudge, { submissionId });

    const waiting = await get(t, submissionId);

    expect(waiting).toMatchObject({ status: "RV", casePoints: 0, caseTotal: 0, contestPoints: 0 });
    expect(waiting?.result).toBeUndefined();
    expect(waiting?.reviewFeedback).toBeUndefined();
    expect(waiting?.reviewedAt).toBeUndefined();
    expect((await t.run(async (ctx) => ctx.db.get(participationId)))?.score).toBe(0);
  });

  it("tells the status page who may score and out of what", async () => {
    const { t, submissionId } = await contestFixture();

    const setter = await asUser(t, "setter").query(api.pages.submissions.statusExtras, { submissionId });

    expect(setter).toMatchObject({ canReview: true, reviewOutOf: 200 });

    const author = await asUser(t, "author").query(api.pages.submissions.statusExtras, { submissionId });

    expect(author).toMatchObject({ canReview: false, reviewOutOf: null });
  });

  it("hides the note with the score during a blind freeze", async () => {
    const { t, problemId, authorId, languageId } = await fixture();
    const now = Date.now();

    const contestId = await insertContest(t, {
      startTime: now - 7200_000,
      endTime: now + 1800_000,
      freeze: { minutes: 60, blind: true },
      scoreboard: { audiences: ["everyone"], from: "start" },
    });

    const contestProblemId = await insertContestProblem(t, { contestId, problemId, points: 100, order: 1 });

    const participationId = await insertParticipation(t, {
      contestId,
      profileId: authorId,
      realStart: now - 600_000,
    });

    await t.run(async (ctx) => ctx.db.patch(authorId, { currentParticipationId: participationId }));

    const submissionId = await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      contestId,
      contestProblemId,
      participationId,
      date: now - 60_000,
      status: "RV",
      casePoints: 0,
      caseTotal: 0,
    });

    await asUser(t, "setter").mutation(api.submissions.review, {
      submissionId,
      score: 40,
      feedback: "Close.",
    });

    const detail = await asUser(t, "author").query(api.submissions.detail, { submissionId });

    expect(detail?.submission.masked).toBe(true);
    expect(detail?.review).toBeNull();
  });
});

describe("the review queue", () => {
  it("lists what is waiting, oldest first, to staff only, with its filters", async () => {
    const { t, submissionId, problemId, authorId, languageId } = await contestFixture();
    const now = Date.now();

    const older = await insertSubmission(t, {
      profileId: authorId,
      problemId,
      languageId,
      date: now - 86_400_000,
      status: "RV",
      casePoints: 0,
      caseTotal: 0,
    });

    await insertSubmission(t, { profileId: authorId, problemId, languageId, status: "D", result: "AC" });

    const queue = await asUser(t, "setter").query(api.pages.admin.review.queue, {});

    expect(queue?.rows.map((row) => row.id)).toEqual([older, submissionId]);
    expect(queue?.rows.map((row) => row.outOf)).toEqual([50, 200]);
    expect(queue?.problems).toEqual([{ code: "essay", name: "ESSAY", count: 2 }]);
    expect(queue?.contests).toEqual([{ key: "cup", name: expect.any(String), count: 1 }]);

    const inContest = await asUser(t, "setter").query(api.pages.admin.review.queue, { contestKey: "cup" });

    expect(inContest?.rows.map((row) => row.id)).toEqual([submissionId]);
    expect(await asUser(t, "author").query(api.pages.admin.review.queue, {})).toBeNull();
  });
});

describe("turning staff scoring off", () => {
  it("hands whatever was waiting to the judges", async () => {
    const { t, submissionId } = await contestFixture();

    await asUser(t, "setter").mutation(api.admin.problems.update, { code: "essay", manualGrading: false });

    expect((await get(t, submissionId))?.status).toBe("QU");
  });
});
