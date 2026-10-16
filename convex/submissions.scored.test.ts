// @vitest-environment edge-runtime
/**
 * What a submission to a scored problem is worth, on the lists and the status
 * page: its points in the scope it is listed in, not its case score, and only
 * where its points are not hidden.
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

const PAGE = { paginationOpts: { numItems: 20, cursor: null } };

async function golfSetup() {
  const t = setupTest();
  const languageId = await insertLanguage(t);
  const problemId = await insertProblem(t, { points: 100, scoring: { kind: "golf" } });
  const meId = await insertProfile(t, { username: "me" });

  return { t, languageId, problemId, meId };
}

async function insertBest(
  t: T,
  problemId: Id<"problems">,
  contestProblemId: Id<"contestProblems"> | undefined,
  bytes: number,
) {
  await t.run(async (ctx) =>
    ctx.db.insert("scoringBests", { problemId, contestProblemId, best: { kind: "golf", bytes } }),
  );
}

/** An accepted golf submission as grading leaves it: every case passed, its points scored. */
function accepted(bytes: number, points: number) {
  return {
    status: "D" as const,
    result: "AC" as const,
    casePoints: 120,
    caseTotal: 120,
    points,
    scoringMeasure: { kind: "golf" as const, bytes },
  };
}

describe("scored submissions", () => {
  it("shows a contest submission's contest points out of its contest problem's", async () => {
    const { t, languageId, problemId, meId } = await golfSetup();
    const now = Date.now();

    const contestId = await insertContest(t, {
      key: "golf",
      startTime: now - 3600_000,
      endTime: now + 3600_000,
    });

    const contestProblemId = await insertContestProblem(t, {
      contestId,
      problemId,
      points: 300,
      partial: false,
      isPretested: false,
      order: 1,
    });

    const participationId = await insertParticipation(t, {
      contestId,
      profileId: meId,
      realStart: now - 600_000,
    });

    await insertBest(t, problemId, undefined, 300);
    await insertBest(t, problemId, contestProblemId, 400);

    const submissionId = await insertSubmission(t, {
      profileId: meId,
      problemId,
      languageId,
      contestId,
      contestProblemId,
      participationId,
      ...accepted(512, 58.594),
      contestPoints: 234.375,
    });

    const as = asUser(t, "me");
    const rows = await as.query(api.submissions.list, PAGE);

    expect(rows.page[0]?.scored).toEqual({ kind: "golf", points: 234.375, outOf: 300 });

    const detail = await as.query(api.submissions.detail, { submissionId });

    expect(detail?.submission.scored).toEqual({ kind: "golf", points: 234.375, outOf: 300 });
    expect(detail?.scoring).toEqual({
      kind: "golf",
      scope: "contest",
      measure: { kind: "golf", bytes: 512 },
      best: { kind: "golf", bytes: 400 },
    });
  });

  it("shows a practice submission's points out of the problem's, against the problem's best", async () => {
    const { t, languageId, problemId, meId } = await golfSetup();
    await insertBest(t, problemId, undefined, 30);

    const submissionId = await insertSubmission(t, {
      profileId: meId,
      problemId,
      languageId,
      ...accepted(75, 40),
    });

    const as = asUser(t, "me");
    const rows = await as.query(api.submissions.list, PAGE);

    expect(rows.page[0]?.scored).toEqual({ kind: "golf", points: 40, outOf: 100 });

    const detail = await as.query(api.submissions.detail, { submissionId });

    expect(detail?.scoring).toEqual({
      kind: "golf",
      scope: "practice",
      measure: { kind: "golf", bytes: 75 },
      best: { kind: "golf", bytes: 30 },
    });

    // Someone who may not read the detail still sees the points, but not what
    // they rest on.
    const anonymous = await t.query(api.submissions.detail, { submissionId });

    expect(anonymous?.canSeeDetail).toBe(false);
    expect(anonymous?.submission.scored).toEqual({ kind: "golf", points: 40, outOf: 100 });
    expect(anonymous?.scoring).toBeNull();
  });

  it("hides a contestant's scored points with the rest of their verdict after a blind freeze", async () => {
    const { t, languageId, problemId, meId } = await golfSetup();
    const now = Date.now();

    const contestId = await insertContest(t, {
      startTime: now - 7200_000,
      endTime: now + 1800_000,
      freeze: { minutes: 60, blind: true },
      scoreboard: { audiences: ["everyone"], from: "start" },
    });

    const contestProblemId = await insertContestProblem(t, {
      contestId,
      problemId,
      points: 300,
      partial: false,
      isPretested: false,
      order: 1,
    });

    const participationId = await insertParticipation(t, {
      contestId,
      profileId: meId,
      realStart: now - 600_000,
    });

    await t.run(async (ctx) => ctx.db.patch(meId, { currentParticipationId: participationId }));
    await insertBest(t, problemId, contestProblemId, 50);

    const submissionId = await insertSubmission(t, {
      profileId: meId,
      problemId,
      languageId,
      contestId,
      contestProblemId,
      participationId,
      date: now - 60_000,
      ...accepted(100, 50),
      contestPoints: 150,
    });

    const as = asUser(t, "me");
    const rows = await as.query(api.submissions.list, PAGE);

    expect(rows.page[0]?.masked).toBe(true);
    expect(rows.page[0]?.scored).toBeNull();

    const detail = await as.query(api.submissions.detail, { submissionId });

    expect(detail?.submission.scored).toBeNull();
    expect(detail?.scoring).toBeNull();

    // Staff see straight through it.
    await insertProfile(t, { username: "staff", permissions: ["judge.see_private_contest"] });

    const staffView = await asUser(t, "staff").query(api.submissions.detail, { submissionId });

    expect(staffView?.submission.scored).toEqual({ kind: "golf", points: 150, outOf: 300 });
  });

  it("leaves a standard problem on its case score", async () => {
    const t = setupTest();
    const languageId = await insertLanguage(t);
    const problemId = await insertProblem(t, { points: 100 });
    const meId = await insertProfile(t, { username: "me" });

    const submissionId = await insertSubmission(t, {
      profileId: meId,
      problemId,
      languageId,
      status: "D",
      result: "AC",
      points: 100,
    });

    const as = asUser(t, "me");

    expect((await as.query(api.submissions.list, PAGE)).page[0]?.scored).toBeNull();
    expect((await as.query(api.submissions.detail, { submissionId }))?.scoring).toBeNull();
  });
});
