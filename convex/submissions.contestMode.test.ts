// @vitest-environment edge-runtime
/**
 * Contest mode: the list narrows to the contest, and `blindDuringFreeze` turns
 * a contestant's own verdicts into "pending" between the freeze and the end.
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

async function join(t: T, contestId: Id<"contests">, profileId: Id<"profiles">) {
  const participationId = await insertParticipation(t, {
    contestId,
    profileId,
    realStart: Date.now() - 600_000,
  });
  await t.run(async (ctx) => ctx.db.patch(profileId, { currentParticipationId: participationId }));
  return participationId;
}

describe("contest mode", () => {
  it("narrows the list to the contest and to the viewer's own rows", async () => {
    const t = setupTest();
    const languageId = await insertLanguage(t);
    const problemId = await insertProblem(t, { allowedLanguageIds: [languageId] });
    const meId = await insertProfile(t, { username: "me" });
    const rivalId = await insertProfile(t, { username: "rival" });
    const now = Date.now();
    const contestId = await insertContest(t, {
      startTime: now - 3600_000,
      endTime: now + 3600_000,
      scoreboardVisibility: "H",
    });
    const contestProblemId = await insertContestProblem(t, {
      contestId,
      problemId,
      points: 100,
      partial: true,
      isPretested: false,
      order: 1,
    });

    const mine = await join(t, contestId, meId);
    const theirs = await join(t, contestId, rivalId);
    await insertSubmission(t, {
      profileId: meId,
      problemId,
      languageId,
      contestId,
      contestProblemId,
      participationId: mine,
      status: "D",
      result: "AC",
    });
    await insertSubmission(t, {
      profileId: rivalId,
      problemId,
      languageId,
      contestId,
      contestProblemId,
      participationId: theirs,
      status: "D",
      result: "AC",
    });
    // A submission outside the contest never shows in contest mode.
    await insertSubmission(t, { profileId: meId, problemId, languageId, status: "D", result: "WA" });

    const page = await asUser(t, "me").query(api.submissions.list, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]?.user?.username).toBe("me");
  });

  it("masks a contestant's own verdicts after the freeze", async () => {
    const t = setupTest();
    const languageId = await insertLanguage(t);
    const problemId = await insertProblem(t, { allowedLanguageIds: [languageId] });
    const meId = await insertProfile(t, { username: "me" });
    const now = Date.now();
    const contestId = await insertContest(t, {
      startTime: now - 7200_000,
      // The freeze started half an hour ago and the contest is still running.
      endTime: now + 1800_000,
      freezeMinutes: 60,
      blindDuringFreeze: true,
      scoreboardVisibility: "V",
    });
    const contestProblemId = await insertContestProblem(t, {
      contestId,
      problemId,
      points: 100,
      partial: true,
      isPretested: false,
      order: 1,
    });
    const participationId = await join(t, contestId, meId);

    const beforeFreeze = await insertSubmission(t, {
      profileId: meId,
      problemId,
      languageId,
      contestId,
      contestProblemId,
      participationId,
      date: now - 3600_000,
      status: "D",
      result: "AC",
      points: 100,
      casePoints: 100,
      caseTotal: 100,
    });
    const afterFreeze = await insertSubmission(t, {
      profileId: meId,
      problemId,
      languageId,
      contestId,
      contestProblemId,
      participationId,
      date: now - 60_000,
      status: "D",
      result: "WA",
      points: 0,
      casePoints: 0,
      caseTotal: 100,
    });

    const as = asUser(t, "me");
    const before = await as.query(api.submissions.detail, { submissionId: beforeFreeze });
    expect(before?.submission.masked).toBe(false);
    expect(before?.submission.result).toBe("AC");

    const after = await as.query(api.submissions.detail, { submissionId: afterFreeze });
    expect(after?.submission.masked).toBe(true);
    expect(after?.submission.status).toBe("QU");
    expect(after?.submission.result).toBeNull();
    expect(after?.submission.points).toBeNull();
    expect(after?.cases).toHaveLength(0);

    // Staff see straight through it.
    await insertProfile(t, { username: "staff", permissions: ["judge.see_private_contest"] });
    const staffView = await asUser(t, "staff").query(api.submissions.detail, {
      submissionId: afterFreeze,
    });
    expect(staffView?.submission.masked).toBe(false);
    expect(staffView?.submission.result).toBe("WA");
  });

  it("hides other people's contest submissions outside contest mode", async () => {
    const t = setupTest();
    const languageId = await insertLanguage(t);
    const problemId = await insertProblem(t, { allowedLanguageIds: [languageId] });
    const contestantId = await insertProfile(t, { username: "contestant" });
    await insertProfile(t, { username: "stranger" });
    const now = Date.now();
    const hidden = await insertContest(t, {
      key: "hidden",
      startTime: now - 3600_000,
      endTime: now + 3600_000,
      scoreboardVisibility: "H",
    });
    const open = await insertContest(t, {
      key: "open",
      startTime: now - 3600_000,
      endTime: now + 3600_000,
      scoreboardVisibility: "V",
    });

    for (const contestId of [hidden, open]) {
      await insertSubmission(t, {
        profileId: contestantId,
        problemId,
        languageId,
        contestId,
        status: "D",
        result: "AC",
      });
    }

    const page = await asUser(t, "stranger").query(api.submissions.list, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(page.page.map((row) => row.contest?.key)).toEqual(["open"]);

    // The author always sees their own.
    const own = await asUser(t, "contestant").query(api.submissions.list, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(own.page).toHaveLength(2);
  });
});
