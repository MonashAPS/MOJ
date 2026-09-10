// @vitest-environment edge-runtime
/**
 * What a finished submission changes: its own points, the user's points and
 * problem count, the problem's statistics and the contest participation.
 *
 * `on_grading_end` (judge/bridge/judge_handler.py:351).
 */

import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  type JudgeClient,
  judgeCase,
  judgeClient,
  makeJudge,
  makeLanguage,
  makeProblem,
  makeProfile,
  makeSubmission,
  setupTest,
  type T,
} from "./fixtures.helpers";

async function claim(client: JudgeClient): Promise<number> {
  const body = (await (await client.claim()).json()) as {
    submission: { submissionId: number } | null;
  };
  if (!body.submission) throw new Error("nothing to claim");
  return body.submission.submissionId;
}

async function gradeFully(client: JudgeClient, id: number, cases: Array<ReturnType<typeof judgeCase>>) {
  await client.event(id, { type: "grading-begin", pretested: false });
  await client.event(id, { type: "test-case-status", cases });
  await client.event(id, { type: "grading-end" });
}

async function makeContest(
  t: T,
  problemId: Id<"problems">,
  options: { formatName?: string; points?: number; partial?: boolean } = {},
) {
  const now = Date.now();
  const contestId = await t.run(async (ctx) =>
    ctx.db.insert("contests", {
      key: "test",
      name: "Test contest",
      authorProfileIds: [],
      curatorProfileIds: [],
      testerProfileIds: [],
      spectatorProfileIds: [],
      testerSeeScoreboard: false,
      testerSeeSubmissions: false,
      description: "",
      startTime: now - 3600_000,
      endTime: now + 3600_000,
      isVisible: true,
      isRated: false,
      viewContestScoreboardProfileIds: [],
      viewContestSubmissionsProfileIds: [],
      scoreboardVisibility: "V",
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
      formatName: options.formatName ?? "default",
      formatConfig: null,
      labelScheme: "letters",
      customLabels: [],
      pointsPrecision: 3,
      freezeMinutes: 0,
      blindDuringFreeze: false,
    }),
  );
  const contestProblemId = await t.run(async (ctx) =>
    ctx.db.insert("contestProblems", {
      contestId,
      problemId,
      points: options.points ?? 50,
      partial: options.partial ?? true,
      isPretested: false,
      order: 1,
    }),
  );
  return { contestId, contestProblemId };
}

describe("grading-end bookkeeping", () => {
  it("sums time, takes the peak memory and picks the worst verdict", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const problemId = await makeProblem(t, { points: 100, partial: true });
    const author = await makeProfile(t);
    const judge = await makeJudge(t);
    const client = judgeClient(t, judge);
    const submissionId = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId,
      legacyId: 1,
    });

    const id = await claim(client);
    await gradeFully(client, id, [
      judgeCase(1, 0, 30, 30, { time: 0.1, memory: 1000 }),
      judgeCase(2, 8, 0, 70, { time: 0.25, memory: 5000 }),
    ]);

    const submission = await t.run(async (ctx) => ctx.db.get(submissionId));
    expect(submission?.time).toBeCloseTo(0.35, 6);
    expect(submission?.memory).toBe(5000);
    expect(submission?.result).toBe("MLE");
    expect(submission?.casePoints).toBe(30);
    expect(submission?.caseTotal).toBe(100);
    expect(submission?.points).toBe(30);
  });

  it("recomputes the user's points, problem count and performance points", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const easy = await makeProblem(t, { code: "easy", points: 10, partial: true });
    const hard = await makeProblem(t, { code: "hard", points: 40, partial: true });
    const author = await makeProfile(t);
    const judge = await makeJudge(t, { problemCodes: ["easy", "hard"] });
    const client = judgeClient(t, judge);

    await makeSubmission(t, {
      profileId: author.profileId,
      problemId: easy,
      languageId,
      legacyId: 1,
      date: 1,
    });
    let id = await claim(client);
    await gradeFully(client, id, [judgeCase(1, 0, 100, 100)]);

    let profile = await t.run(async (ctx) => ctx.db.get(author.profileId));
    expect(profile?.points).toBe(10);
    expect(profile?.problemCount).toBe(1);

    await makeSubmission(t, {
      profileId: author.profileId,
      problemId: hard,
      languageId,
      legacyId: 2,
      date: 2,
    });
    id = await claim(client);
    // Half marks: scored but not solved.
    await gradeFully(client, id, [judgeCase(1, 0, 50, 100)]);

    profile = await t.run(async (ctx) => ctx.db.get(author.profileId));
    expect(profile?.points).toBe(30);
    expect(profile?.problemCount).toBe(1);
    // 40 * 1 + 10 * 0.95 + the solved bonus for one problem.
    expect(profile?.performancePoints).toBeCloseTo(20 + 10 * 0.95 + 300 * (1 - 0.997 ** 1), 6);
  });

  it("leaves points alone for a private problem", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const problemId = await makeProblem(t, { code: "secret", isPublic: false, points: 25 });
    const author = await makeProfile(t);
    const judge = await makeJudge(t, { problemCodes: ["secret"] });
    const client = judgeClient(t, judge);
    await makeSubmission(t, { profileId: author.profileId, problemId, languageId, legacyId: 1 });

    const id = await claim(client);
    await gradeFully(client, id, [judgeCase(1, 0, 100, 100)]);

    const profile = await t.run(async (ctx) => ctx.db.get(author.profileId));
    expect(profile?.points).toBe(0);
    expect(profile?.problemCount).toBe(0);
  });

  it("recomputes the problem's solver count and AC rate, skipping unlisted users", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const problemId = await makeProblem(t, { points: 100 });
    const solver = await makeProfile(t);
    const failer = await makeProfile(t);
    const ghost = await makeProfile(t, { isUnlisted: true });
    const judge = await makeJudge(t);
    const client = judgeClient(t, judge);

    for (const [index, profile] of [solver, failer, ghost].entries()) {
      await makeSubmission(t, {
        profileId: profile.profileId,
        problemId,
        languageId,
        legacyId: index + 1,
        date: index + 1,
      });
      const id = await claim(client);
      await gradeFully(client, id, [judgeCase(1, index === 1 ? 1 : 0, index === 1 ? 0 : 100, 100)]);
      await t.run(async (ctx) => ctx.db.patch(judge.judgeId, { currentSubmissionId: undefined }));
    }

    const problem = await t.run(async (ctx) => ctx.db.get(problemId));
    expect(problem?.userCount).toBe(1);
    expect(problem?.acRate).toBeCloseTo(50, 6);
  });

  it("recomputes a contest participation through the contest format", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const problemId = await makeProblem(t, { points: 100, partial: true });
    const author = await makeProfile(t);
    const judge = await makeJudge(t);
    const client = judgeClient(t, judge);
    const { contestId, contestProblemId } = await makeContest(t, problemId, { points: 50 });

    const participationId = await t.run(async (ctx) =>
      ctx.db.insert("contestParticipations", {
        contestId,
        profileId: author.profileId,
        realStart: Date.now() - 600_000,
        score: 0,
        cumtime: 0,
        isDisqualified: false,
        tiebreaker: 0,
        virtual: 0,
        formatData: {},
      }),
    );
    const submissionId = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId,
      legacyId: 1,
      contestId,
      contestProblemId,
      participationId,
    });

    const id = await claim(client);
    await gradeFully(client, id, [judgeCase(1, 0, 100, 100)]);

    const submission = await t.run(async (ctx) => ctx.db.get(submissionId));
    expect(submission?.contestPoints).toBe(50);

    const participation = await t.run(async (ctx) => ctx.db.get(participationId));
    expect(participation?.score).toBe(50);
    expect(participation?.formatData).toBeTruthy();
  });

  it("sends contest submissions out at priority 0", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const problemId = await makeProblem(t);
    const author = await makeProfile(t);
    const { contestId, contestProblemId } = await makeContest(t, problemId);
    const participationId = await t.run(async (ctx) =>
      ctx.db.insert("contestParticipations", {
        contestId,
        profileId: author.profileId,
        realStart: Date.now(),
        score: 0,
        cumtime: 0,
        isDisqualified: false,
        tiebreaker: 0,
        virtual: 0,
        formatData: {},
      }),
    );
    const submissionId = await makeSubmission(t, {
      profileId: author.profileId,
      problemId,
      languageId,
      legacyId: 1,
      contestId,
      contestProblemId,
      participationId,
      status: "D",
      result: "WA",
    });

    const { queueSubmission } = await import("../judging");
    await t.run(async (ctx) => {
      await queueSubmission(ctx, submissionId);
    });
    expect((await t.run(async (ctx) => ctx.db.get(submissionId)))?.priority).toBe(0);
  });
});
