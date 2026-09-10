// @vitest-environment edge-runtime
/**
 * Who may see a submission's cases and source (`Submission.can_see_detail`),
 * what the lists show, and the blind-during-freeze masking a contestant gets.
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

async function canSeeDetail(t: T, userId: string | null, submissionId: Id<"submissions">) {
  const client = userId ? t.withIdentity({ subject: userId }) : t;
  const detail = await client.query(api.submissions.detail, { submissionId });
  return detail?.canSeeDetail ?? false;
}

describe("submission detail visibility", () => {
  it("follows DMOJ's seven paths", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const owner = await makeProfile(t, { username: "owner" });
    const stranger = await makeProfile(t, { username: "stranger" });
    const tester = await makeProfile(t, { username: "tester" });
    const editor = await makeProfile(t, {
      username: "editor",
      permissions: ["judge.edit_own_problem", "judge.edit_all_problem"],
    });
    const viewer = await makeProfile(t, {
      username: "viewall",
      permissions: ["judge.view_all_submission"],
    });

    const problemId = await makeProblem(t, {
      code: "aplusb",
      allowedLanguageIds: [languageId],
      testerProfileIds: [tester.profileId],
      submissionSourceVisibility: "O",
    });
    const submissionId = await makeSubmission(t, {
      profileId: owner.profileId,
      problemId,
      languageId,
      status: "D",
      result: "AC",
    });

    expect(await canSeeDetail(t, null, submissionId)).toBe(false);
    expect(await canSeeDetail(t, owner.userId, submissionId)).toBe(true);
    expect(await canSeeDetail(t, stranger.userId, submissionId)).toBe(false);
    // Source visibility O: testers only.
    expect(await canSeeDetail(t, tester.userId, submissionId)).toBe(true);
    expect(await canSeeDetail(t, editor.userId, submissionId)).toBe(true);
    expect(await canSeeDetail(t, viewer.userId, submissionId)).toBe(true);
  });

  it("opens the detail to everyone under source visibility A", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const owner = await makeProfile(t);
    const stranger = await makeProfile(t);
    const problemId = await makeProblem(t, {
      allowedLanguageIds: [languageId],
      submissionSourceVisibility: "A",
    });
    const submissionId = await makeSubmission(t, {
      profileId: owner.profileId,
      problemId,
      languageId,
      status: "D",
      result: "AC",
    });
    expect(await canSeeDetail(t, stranger.userId, submissionId)).toBe(true);
    // Still not to a logged-out visitor: `can_see_detail` needs a user.
    expect(await canSeeDetail(t, null, submissionId)).toBe(false);
  });

  it("needs the viewer to have solved the problem under source visibility S", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const owner = await makeProfile(t);
    const stranger = await makeProfile(t);
    const problemId = await makeProblem(t, {
      allowedLanguageIds: [languageId],
      submissionSourceVisibility: "S",
    });
    const submissionId = await makeSubmission(t, {
      profileId: owner.profileId,
      problemId,
      languageId,
      status: "D",
      result: "AC",
      casePoints: 100,
      caseTotal: 100,
    });

    expect(await canSeeDetail(t, stranger.userId, submissionId)).toBe(false);

    await makeSubmission(t, {
      profileId: stranger.profileId,
      problemId,
      languageId,
      status: "D",
      result: "AC",
      casePoints: 100,
      caseTotal: 100,
    });
    expect(await canSeeDetail(t, stranger.userId, submissionId)).toBe(true);
  });

  it("hands back the cases and the source only when the detail is visible", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const owner = await makeProfile(t);
    const stranger = await makeProfile(t);
    const problemId = await makeProblem(t, { allowedLanguageIds: [languageId] });
    const submissionId = await makeSubmission(t, {
      profileId: owner.profileId,
      problemId,
      languageId,
      status: "D",
      result: "AC",
      source: "print(1 + 1)",
    });
    await t.run(async (ctx) =>
      ctx.db.insert("submissionTestCases", {
        submissionId,
        case: 1,
        status: "AC",
        time: 0.1,
        memory: 100,
        points: 1,
        total: 1,
        feedback: "",
        extendedFeedback: "",
        output: "2\n",
      }),
    );

    const mine = await t
      .withIdentity({ subject: owner.userId })
      .query(api.submissions.detail, { submissionId });
    expect(mine?.cases).toHaveLength(1);
    const mySource = await t
      .withIdentity({ subject: owner.userId })
      .query(api.submissions.source, { submissionId });
    expect(mySource?.source).toBe("print(1 + 1)");

    const theirs = await t
      .withIdentity({ subject: stranger.userId })
      .query(api.submissions.detail, { submissionId });
    expect(theirs?.canSeeDetail).toBe(false);
    expect(theirs?.cases).toHaveLength(0);
    const theirSource = await t
      .withIdentity({ subject: stranger.userId })
      .query(api.submissions.source, { submissionId });
    expect(theirSource?.canSeeSource).toBe(false);
    expect(theirSource?.source).toBeNull();
  });

  it("finds a submission by its integer id", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const owner = await makeProfile(t);
    const problemId = await makeProblem(t, { allowedLanguageIds: [languageId] });
    await makeSubmission(t, {
      profileId: owner.profileId,
      problemId,
      languageId,
      legacyId: 4321,
      status: "D",
      result: "AC",
    });
    const detail = await t
      .withIdentity({ subject: owner.userId })
      .query(api.submissions.detail, { submissionId: 4321 });
    expect(detail?.submission.id).toBe(4321);
  });
});

describe("submission lists", () => {
  it("hides submissions to problems the viewer cannot see", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const owner = await makeProfile(t);
    const stranger = await makeProfile(t);
    const publicProblem = await makeProblem(t, { code: "open", allowedLanguageIds: [languageId] });
    const secret = await makeProblem(t, {
      code: "secret",
      isPublic: false,
      allowedLanguageIds: [languageId],
    });
    await makeSubmission(t, { profileId: owner.profileId, problemId: publicProblem, languageId });
    await makeSubmission(t, { profileId: owner.profileId, problemId: secret, languageId });

    const page = await t
      .withIdentity({ subject: stranger.userId })
      .query(api.submissions.list, { paginationOpts: { numItems: 20, cursor: null } });
    expect(page.page.map((row) => row.problem?.code)).toEqual(["open"]);
  });

  it("filters by user, problem, language and result", async () => {
    const t = setupTest();
    const py = await makeLanguage(t, "PY3");
    const cpp = await makeLanguage(t, "CPP17");
    const alice = await makeProfile(t, { username: "alice" });
    const bob = await makeProfile(t, { username: "bob" });
    const a = await makeProblem(t, { code: "a", allowedLanguageIds: [py, cpp] });
    const b = await makeProblem(t, { code: "b", allowedLanguageIds: [py, cpp] });

    await makeSubmission(t, {
      profileId: alice.profileId,
      problemId: a,
      languageId: py,
      status: "D",
      result: "AC",
      date: 1,
    });
    await makeSubmission(t, {
      profileId: alice.profileId,
      problemId: b,
      languageId: cpp,
      status: "D",
      result: "WA",
      date: 2,
    });
    await makeSubmission(t, {
      profileId: bob.profileId,
      problemId: a,
      languageId: py,
      status: "D",
      result: "TLE",
      date: 3,
    });

    const opts = { numItems: 20, cursor: null };
    const byUser = await t.query(api.submissions.list, { paginationOpts: opts, username: "alice" });
    expect(byUser.page).toHaveLength(2);
    // Newest first.
    expect(byUser.page[0]?.problem?.code).toBe("b");

    const byProblem = await t.query(api.submissions.list, { paginationOpts: opts, problemCode: "a" });
    expect(byProblem.page).toHaveLength(2);

    const both = await t.query(api.submissions.list, {
      paginationOpts: opts,
      problemCode: "a",
      username: "bob",
    });
    expect(both.page).toHaveLength(1);
    expect(both.page[0]?.result).toBe("TLE");

    const byLanguage = await t.query(api.submissions.list, {
      paginationOpts: opts,
      languageKeys: ["CPP17"],
    });
    expect(byLanguage.page).toHaveLength(1);

    const byResult = await t.query(api.submissions.list, {
      paginationOpts: opts,
      results: ["AC", "TLE"],
    });
    expect(byResult.page).toHaveLength(2);
  });

  it("counts results for the stats chart", async () => {
    const t = setupTest();
    const languageId = await makeLanguage(t);
    const author = await makeProfile(t);
    const problemId = await makeProblem(t, { allowedLanguageIds: [languageId] });
    for (const result of ["AC", "AC", "WA", "TLE", "MLE", "CE"] as const) {
      await makeSubmission(t, {
        profileId: author.profileId,
        problemId,
        languageId,
        status: "D",
        result,
      });
    }

    const data = await t.query(api.submissions.resultsForProblem, { problemCode: "aplusb" });
    expect(data.total).toBe(6);
    expect(data.categories).toEqual([
      { code: "AC", name: "Accepted", count: 2 },
      { code: "WA", name: "Wrong", count: 1 },
      { code: "CE", name: "Compile Error", count: 1 },
      { code: "TLE", name: "Timeout", count: 1 },
      { code: "ERR", name: "Error", count: 1 },
    ]);
  });
});
