// @vitest-environment edge-runtime
/**
 * `convex/pages/submissions.ts`: the filter options, the access checks each
 * submission list runs, and the extras the status and source pages read.
 */

import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  asUser,
  insertContest,
  insertJudge,
  insertLanguage,
  insertParticipation,
  insertProblem,
  insertProfile,
  insertSubmission,
} from "../test.fixtures";
import { setupTest, type T } from "../test.setup";

async function fixture() {
  const t = setupTest();
  const languageId = await insertLanguage(t, { key: "PY3" });
  const author = await insertProfile(t, { username: "author" });
  const problemId = await insertProblem(t, { code: "aplusb", allowedLanguageIds: [languageId] });

  return { t, languageId, author, problemId };
}

async function makeContest(
  t: T,
  options: {
    key?: string;
    isVisible?: boolean;
    startTime?: number;
    endTime?: number;
    scoreboardVisibility?: "V" | "C" | "P" | "H";
  } = {},
): Promise<Id<"contests">> {
  return await insertContest(t, {
    key: options.key ?? "week1",
    name: "Week 1",
    startTime: options.startTime ?? Date.now() - 7_200_000,
    endTime: options.endTime ?? Date.now() - 3_600_000,
    isVisible: options.isVisible ?? true,
    scoreboardVisibility: options.scoreboardVisibility ?? "V",
    useClarifications: false,
    formatConfig: {},
  });
}

describe("listContext filter options", () => {
  it("never offers SC, and offers IE only to staff", async () => {
    const { t } = await fixture();
    await insertProfile(t, { username: "member" });
    await insertProfile(t, { username: "staff", isStaff: true });

    const asMember = await asUser(t, "member").query(api.pages.submissions.listContext, {});
    const asStaff = await asUser(t, "staff").query(api.pages.submissions.listContext, {});

    const memberCodes = asMember.statuses.map((status) => status.code);
    const staffCodes = asStaff.statuses.map((status) => status.code);

    expect(memberCodes).not.toContain("SC");
    expect(memberCodes).not.toContain("IE");
    expect(memberCodes).toContain("WA");
    expect(staffCodes).toContain("IE");
    expect(staffCodes).not.toContain("SC");
  });

  it("lists every language for the filter panel, by name", async () => {
    const { t } = await fixture();
    await insertLanguage(t, { key: "CPP17" });
    const context = await t.query(api.pages.submissions.listContext, {});
    expect(context.languages.map((language) => language.key).sort()).toEqual(["CPP17", "PY3"]);
  });

  it("reports the viewer's rejudge and abort permissions", async () => {
    const { t } = await fixture();
    await insertProfile(t, {
      username: "op",
      isStaff: true,
      permissions: ["judge.rejudge_submission", "judge.abort_any_submission"],
    });

    const anonymous = await t.query(api.pages.submissions.listContext, {});
    expect(anonymous.viewer).toBeNull();

    const context = await asUser(t, "op").query(api.pages.submissions.listContext, {});
    expect(context.viewer?.canRejudge).toBe(true);
    expect(context.viewer?.canAbortAny).toBe(true);
    expect(context.viewer?.isStaff).toBe(true);
  });
});

describe("listContext subjects", () => {
  it("reports a missing user or problem as not found", async () => {
    const { t } = await fixture();
    expect((await t.query(api.pages.submissions.listContext, { username: "nobody" })).found).toBe(false);
    expect((await t.query(api.pages.submissions.listContext, { problemCode: "nope" })).found).toBe(false);
    expect((await t.query(api.pages.submissions.listContext, { contestKey: "nope" })).found).toBe(false);
  });

  it("marks the viewer's own list as theirs", async () => {
    const { t } = await fixture();
    await insertProfile(t, { username: "me" });

    const own = await asUser(t, "me").query(api.pages.submissions.listContext, { username: "me" });
    expect(own.user?.isSelf).toBe(true);

    const other = await asUser(t, "me").query(api.pages.submissions.listContext, {
      username: "author",
    });

    expect(other.user?.isSelf).toBe(false);
  });

  it("refuses a problem the viewer cannot access", async () => {
    const { t } = await fixture();
    await insertProblem(t, { code: "secret", isPublic: false });
    const context = await t.query(api.pages.submissions.listContext, { problemCode: "secret" });
    expect(context.allowed).toBe(false);
  });
});

describe("listContext contest arm", () => {
  it("hides an invisible contest and one that has not started", async () => {
    const { t } = await fixture();
    await makeContest(t, { key: "hidden", isVisible: false });
    await makeContest(t, {
      key: "later",
      startTime: Date.now() + 3_600_000,
      endTime: Date.now() + 7_200_000,
    });

    expect((await t.query(api.pages.submissions.listContext, { contestKey: "hidden" })).allowed).toBe(false);
    expect((await t.query(api.pages.submissions.listContext, { contestKey: "later" })).allowed).toBe(false);
  });

  it("needs the named user to have taken part", async () => {
    const { t } = await fixture();
    const contestId = await makeContest(t, { key: "week1" });
    const member = await insertProfile(t, { username: "member" });

    const missing = await t.query(api.pages.submissions.listContext, {
      contestKey: "week1",
      username: "member",
    });

    expect(missing.found).toBe(false);

    await insertParticipation(t, {
      contestId,
      profileId: member,
      realStart: Date.now() - 7_000_000,
    });

    const found = await t.query(api.pages.submissions.listContext, {
      contestKey: "week1",
      username: "member",
    });

    expect(found.found).toBe(true);
    expect(found.contest?.isParticipant).toBe(true);
    // The contest has ended and its scoreboard is visible, so anyone may read it.
    expect(found.allowed).toBe(true);
  });
});

describe("statusExtras", () => {
  it("answers null for a submission that does not exist", async () => {
    const { t } = await fixture();
    expect(await t.query(api.pages.submissions.statusExtras, { submissionId: 999 })).toBeNull();
  });

  it("names the judge only for someone who can edit the problem", async () => {
    const { t, languageId, problemId } = await fixture();
    const owner = await insertProfile(t, { username: "owner" });
    const judgeId = await insertJudge(t, { name: "judge-a" });

    const submissionId = await insertSubmission(t, {
      profileId: owner,
      problemId,
      languageId,
      status: "D",
      result: "AC",
      legacyId: 7,
    });

    await t.run(async (ctx) => ctx.db.patch(submissionId, { judgedOnJudgeId: judgeId }));

    const asOwner = await asUser(t, "owner").query(api.pages.submissions.statusExtras, {
      submissionId: 7,
    });

    expect(asOwner?.judge).toBeNull();

    await insertProfile(t, {
      username: "editor",
      permissions: ["judge.edit_own_problem", "judge.edit_all_problem"],
    });

    const asEditor = await asUser(t, "editor").query(api.pages.submissions.statusExtras, {
      submissionId: 7,
    });

    expect(asEditor?.judge).toBe("judge-a");
    expect(asEditor?.problemEditable).toBe(true);
  });

  it("prefers the language's time limit and reports the slowest case", async () => {
    const { t, languageId, problemId } = await fixture();
    const owner = await insertProfile(t, { username: "owner" });
    await t.run(async (ctx) =>
      ctx.db.insert("languageLimits", { problemId, languageId, timeLimit: 5, memoryLimit: 65536 }),
    );

    const submissionId = await insertSubmission(t, {
      profileId: owner,
      problemId,
      languageId,
      status: "D",
      result: "AC",
      legacyId: 11,
    });

    await t.run(async (ctx) => {
      for (const [index, time] of [0.01, 0.42, 0.2].entries()) {
        await ctx.db.insert("submissionTestCases", {
          submissionId,
          case: index + 1,
          status: "AC",
          time,
          memory: 1024,
          points: 10,
          total: 10,
          feedback: "",
          extendedFeedback: "",
          output: "",
        });
      }
    });

    const extras = await asUser(t, "owner").query(api.pages.submissions.statusExtras, {
      submissionId: 11,
    });

    expect(extras?.timeLimit).toBe(5);
    expect(extras?.maxExecutionTime).toBeCloseTo(0.42, 5);
  });

  it("lets the author abort their own submission but not a rejudge", async () => {
    const { t, languageId, problemId } = await fixture();
    const owner = await insertProfile(t, { username: "owner" });

    const mine = await insertSubmission(t, {
      profileId: owner,
      problemId,
      languageId,
      status: "G",
      legacyId: 21,
    });

    expect(mine).toBeTruthy();

    const own = await asUser(t, "owner").query(api.pages.submissions.statusExtras, {
      submissionId: 21,
    });

    expect(own?.canAbort).toBe(true);
    expect(own?.canRejudge).toBe(false);

    await insertSubmission(t, {
      profileId: owner,
      problemId,
      languageId,
      status: "G",
      legacyId: 22,
      rejudgedDate: Date.now(),
    });

    const rejudged = await asUser(t, "owner").query(api.pages.submissions.statusExtras, {
      submissionId: 22,
    });

    expect(rejudged?.canAbort).toBe(false);

    await insertProfile(t, { username: "stranger" });

    const asStranger = await asUser(t, "stranger").query(api.pages.submissions.statusExtras, {
      submissionId: 21,
    });

    expect(asStranger?.canAbort).toBe(false);
  });
});

describe("sourceView", () => {
  it("withholds the source from someone who may not read it", async () => {
    const { t, languageId } = await fixture();

    const problemId = await insertProblem(t, {
      code: "private",
      allowedLanguageIds: [languageId],
      submissionSourceVisibility: "O",
    });

    const owner = await insertProfile(t, { username: "owner" });
    await insertSubmission(t, {
      profileId: owner,
      problemId,
      languageId,
      status: "D",
      result: "AC",
      legacyId: 31,
      source: "print(1)\n\n",
    });

    const asOwner = await asUser(t, "owner").query(api.pages.submissions.sourceView, {
      submissionId: 31,
    });

    expect(asOwner?.canSeeSource).toBe(true);
    // DMOJ strips the trailing newlines before highlighting.
    expect(asOwner?.source).toBe("print(1)");
    expect(asOwner?.language?.key).toBe("PY3");

    await insertProfile(t, { username: "stranger" });

    const asStranger = await asUser(t, "stranger").query(api.pages.submissions.sourceView, {
      submissionId: 31,
    });

    expect(asStranger?.canSeeSource).toBe(false);
    expect(asStranger?.source).toBe("");
  });
});
