// @vitest-environment edge-runtime
/**
 * Contest mode: the list narrows to the contest, and `blindDuringFreeze` turns
 * a contestant's own verdicts into "pending" between the freeze and the end.
 */

import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  makeLanguage,
  makeProblem,
  makeProfile,
  makeSubmission,
  setupTest,
  type T,
} from "./fixtures.helpers";

async function makeContest(
  t: T,
  options: {
    key?: string;
    startTime: number;
    endTime: number;
    freezeMinutes?: number;
    blindDuringFreeze?: boolean;
    scoreboardVisibility?: "V" | "C" | "P" | "H";
  },
): Promise<Id<"contests">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("contests", {
      key: options.key ?? "test",
      name: "Test contest",
      authorProfileIds: [],
      curatorProfileIds: [],
      testerProfileIds: [],
      spectatorProfileIds: [],
      testerSeeScoreboard: false,
      testerSeeSubmissions: false,
      description: "",
      startTime: options.startTime,
      endTime: options.endTime,
      isVisible: true,
      isRated: false,
      viewContestScoreboardProfileIds: [],
      viewContestSubmissionsProfileIds: [],
      scoreboardVisibility: options.scoreboardVisibility ?? "H",
      useClarifications: true,
      rateAll: false,
      rateExcludeProfileIds: [],
      isPrivate: false,
      privateContestantProfileIds: [],
      hideProblemTags: false,
      hideProblemAuthors: false,
      runPretestsOnly: false,
      showShortDisplay: false,
      isOrganizationPrivate: false,
      organizationIds: [],
      limitJoinOrganizations: false,
      joinOrganizationIds: [],
      classIds: [],
      tagIds: [],
      userCount: 0,
      bannedProfileIds: [],
      formatName: "default",
      formatConfig: null,
      labelScheme: "letters",
      customLabels: [],
      pointsPrecision: 3,
      freezeMinutes: options.freezeMinutes ?? 0,
      blindDuringFreeze: options.blindDuringFreeze ?? false,
    }),
  );
}

async function join(t: T, contestId: Id<"contests">, profileId: Id<"profiles">) {
  const participationId = await t.run(async (ctx) =>
    ctx.db.insert("contestParticipations", {
      contestId,
      profileId,
      realStart: Date.now() - 600_000,
      score: 0,
      cumtime: 0,
      isDisqualified: false,
      tiebreaker: 0,
      virtual: 0,
      formatData: {},
    }),
  );
  await t.run(async (ctx) => ctx.db.patch(profileId, { currentParticipationId: participationId }));
  return participationId;
}

describe("contest mode", () => {
  it("narrows the list to the contest and to the viewer's own rows", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const problemId = await makeProblem(t, { allowedLanguageIds: [languageId] });
    const me = await makeProfile(t);
    const rival = await makeProfile(t);
    const now = Date.now();
    const contestId = await makeContest(t, {
      startTime: now - 3600_000,
      endTime: now + 3600_000,
      scoreboardVisibility: "H",
    });
    const contestProblemId = await t.run(async (ctx) =>
      ctx.db.insert("contestProblems", {
        contestId,
        problemId,
        points: 100,
        partial: true,
        isPretested: false,
        order: 1,
      }),
    );

    const mine = await join(t, contestId, me.profileId);
    const theirs = await join(t, contestId, rival.profileId);
    await makeSubmission(t, {
      profileId: me.profileId,
      problemId,
      languageId,
      contestId,
      contestProblemId,
      participationId: mine,
      status: "D",
      result: "AC",
    });
    await makeSubmission(t, {
      profileId: rival.profileId,
      problemId,
      languageId,
      contestId,
      contestProblemId,
      participationId: theirs,
      status: "D",
      result: "AC",
    });
    // A submission outside the contest never shows in contest mode.
    await makeSubmission(t, { profileId: me.profileId, problemId, languageId, status: "D", result: "WA" });

    const page = await t
      .withIdentity({ subject: me.userId })
      .query(api.submissions.list, { paginationOpts: { numItems: 20, cursor: null } });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]?.user?.username).toBe(me.username);
  });

  it("masks a contestant's own verdicts after the freeze", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const problemId = await makeProblem(t, { allowedLanguageIds: [languageId] });
    const me = await makeProfile(t);
    const now = Date.now();
    const contestId = await makeContest(t, {
      startTime: now - 7200_000,
      // The freeze started half an hour ago and the contest is still running.
      endTime: now + 1800_000,
      freezeMinutes: 60,
      blindDuringFreeze: true,
      scoreboardVisibility: "V",
    });
    const contestProblemId = await t.run(async (ctx) =>
      ctx.db.insert("contestProblems", {
        contestId,
        problemId,
        points: 100,
        partial: true,
        isPretested: false,
        order: 1,
      }),
    );
    const participationId = await join(t, contestId, me.profileId);

    const beforeFreeze = await makeSubmission(t, {
      profileId: me.profileId,
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
    const afterFreeze = await makeSubmission(t, {
      profileId: me.profileId,
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

    const as = t.withIdentity({ subject: me.userId });
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
    const staff = await makeProfile(t, { permissions: ["judge.see_private_contest"] });
    const staffView = await t
      .withIdentity({ subject: staff.userId })
      .query(api.submissions.detail, { submissionId: afterFreeze });
    expect(staffView?.submission.masked).toBe(false);
    expect(staffView?.submission.result).toBe("WA");
  });

  it("hides other people's contest submissions outside contest mode", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const problemId = await makeProblem(t, { allowedLanguageIds: [languageId] });
    const contestant = await makeProfile(t);
    const stranger = await makeProfile(t);
    const now = Date.now();
    const hidden = await makeContest(t, {
      key: "hidden",
      startTime: now - 3600_000,
      endTime: now + 3600_000,
      scoreboardVisibility: "H",
    });
    const open = await makeContest(t, {
      key: "open",
      startTime: now - 3600_000,
      endTime: now + 3600_000,
      scoreboardVisibility: "V",
    });

    for (const contestId of [hidden, open]) {
      await makeSubmission(t, {
        profileId: contestant.profileId,
        problemId,
        languageId,
        contestId,
        status: "D",
        result: "AC",
      });
    }

    const page = await t
      .withIdentity({ subject: stranger.userId })
      .query(api.submissions.list, { paginationOpts: { numItems: 20, cursor: null } });
    expect(page.page.map((row) => row.contest?.key)).toEqual(["open"]);

    // The author always sees their own.
    const own = await t
      .withIdentity({ subject: contestant.userId })
      .query(api.submissions.list, { paginationOpts: { numItems: 20, cursor: null } });
    expect(own.page).toHaveLength(2);
  });
});
