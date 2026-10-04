// @vitest-environment edge-runtime
/**
 * Being in one contest, and only one.
 *
 * Joining a second contest used to move the viewer without saying so, and
 * leaving one left the bar overhead still counting down on a contest they had
 * walked out of. Both came from the same place: treating "has a participation
 * row here" as "is competing here".
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  HOUR,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertParticipation,
  insertProblem,
  insertProfile,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

async function runningContest(t: T, key: string) {
  const languageId = await insertLanguage(t, { key: `PY3${key}` });

  const problemId = await insertProblem(t, {
    code: `${key}-alpha`,
    isPublic: true,
    allowedLanguageIds: [languageId],
  });

  const contestId = await insertContest(t, {
    key,
    startTime: Date.now() - HOUR,
    endTime: Date.now() + HOUR,
  });

  await insertContestProblem(t, { contestId, problemId, order: 1, points: 1 });

  return contestId;
}

describe("joining a second contest", () => {
  it("refuses with the reason and the name the dialog needs", async () => {
    const t = setupTest();
    await runningContest(t, "first");
    await runningContest(t, "second");
    await insertProfile(t, { username: "player" });
    await asUser(t, "player").mutation(api.contests.participation.join, { key: "first" });

    const attempt = asUser(t, "player").mutation(api.contests.participation.join, { key: "second" });

    await expect(attempt).rejects.toThrow(/"reason":"alreadyInContest"/);
    await expect(attempt).rejects.toThrow(/"contestName":"FIRST"/);
  });

  it("leaves the viewer where they were", async () => {
    const t = setupTest();
    await runningContest(t, "first");
    await runningContest(t, "second");
    await insertProfile(t, { username: "player" });
    await asUser(t, "player").mutation(api.contests.participation.join, { key: "first" });

    await expect(
      asUser(t, "player").mutation(api.contests.participation.join, { key: "second" }),
    ).rejects.toThrow();

    const bar = await asUser(t, "player").query(api.contests.navBar, {});
    expect(bar?.contest.key).toBe("first");
  });

  it("goes through once the viewer has answered", async () => {
    const t = setupTest();
    await runningContest(t, "first");
    await runningContest(t, "second");
    await insertProfile(t, { username: "player" });
    await asUser(t, "player").mutation(api.contests.participation.join, { key: "first" });

    await asUser(t, "player").mutation(api.contests.participation.join, {
      key: "second",
      confirmSwitch: true,
    });

    const bar = await asUser(t, "player").query(api.contests.navBar, {});
    expect(bar?.contest.key).toBe("second");
  });

  it("is not an ask when it is the contest they are already in", async () => {
    const t = setupTest();
    await runningContest(t, "first");
    await insertProfile(t, { username: "player" });
    await asUser(t, "player").mutation(api.contests.participation.join, { key: "first" });

    await asUser(t, "player").mutation(api.contests.participation.join, { key: "first" });

    const bar = await asUser(t, "player").query(api.contests.navBar, {});
    expect(bar?.contest.key).toBe("first");
  });
});

describe("the contest bar after leaving", () => {
  it("is gone from the contest's own page", async () => {
    const t = setupTest();
    await runningContest(t, "first");
    await insertProfile(t, { username: "player" });
    await asUser(t, "player").mutation(api.contests.participation.join, { key: "first" });
    await asUser(t, "player").mutation(api.contests.participation.leave, { key: "first" });

    const onTheContestPage = await asUser(t, "player").query(api.contests.navBar, { key: "first" });

    expect(onTheContestPage).toBeNull();
  });

  it("is still there while they are in it", async () => {
    const t = setupTest();
    await runningContest(t, "first");
    await insertProfile(t, { username: "player" });
    await asUser(t, "player").mutation(api.contests.participation.join, { key: "first" });

    const onTheContestPage = await asUser(t, "player").query(api.contests.navBar, { key: "first" });

    expect(onTheContestPage?.contest.key).toBe("first");
  });

  it("does not show one contest's clock on another contest's page", async () => {
    const t = setupTest();
    await runningContest(t, "first");
    await runningContest(t, "second");
    await insertProfile(t, { username: "player" });
    await asUser(t, "player").mutation(api.contests.participation.join, { key: "first" });

    const onTheOtherPage = await asUser(t, "player").query(api.contests.navBar, { key: "second" });

    expect(onTheOtherPage).toBeNull();
  });
});

describe("browsing a contest without joining", () => {
  it("hides My submissions until the viewer has participated in this contest", async () => {
    const t = setupTest();
    await runningContest(t, "first");
    await runningContest(t, "second");
    await insertProfile(t, { username: "player" });
    const player = asUser(t, "player");

    expect((await t.query(api.contests.navBar, { key: "first", browsing: true }))?.links.submissions).toBe(
      false,
    );
    expect(
      (await player.query(api.contests.navBar, { key: "first", browsing: true }))?.links.submissions,
    ).toBe(false);

    await player.mutation(api.contests.participation.join, { key: "first" });
    expect((await player.query(api.contests.navBar, {}))?.links.submissions).toBe(true);
    expect(
      (await player.query(api.contests.navBar, { key: "second", browsing: true }))?.links.submissions,
    ).toBe(false);

    await player.mutation(api.contests.participation.leave, { key: "first" });
    const bar = await player.query(api.contests.navBar, { key: "first", browsing: true });
    expect(bar?.links.submissions).toBe(true);
    expect(bar?.participationId).toBeNull();
    expect(bar?.contest.isLockedDown).toBe(false);
    expect(
      (await player.query(api.pages.submissions.listContext, { contestKey: "first", username: "player" }))
        .found,
    ).toBe(true);
  });

  it.each([-1, 1])("keeps My submissions available for historical participation mode %s", async (virtual) => {
    const t = setupTest();
    const contestId = await runningContest(t, "past");
    const profileId = await insertProfile(t, { username: "player" });
    await insertParticipation(t, { contestId, profileId, virtual });
    const player = asUser(t, "player");

    const bar = await player.query(api.contests.navBar, { key: "past", browsing: true });
    expect(bar?.links.submissions).toBe(true);
    expect(bar?.participationId).toBeNull();
    expect(bar?.isVirtual).toBe(false);
    expect(
      (await player.query(api.pages.submissions.listContext, { contestKey: "past", username: "player" }))
        .found,
    ).toBe(true);
  });

  it.each([
    ["anonymous", true],
    ["joinable", true],
    ["future", false],
    ["past", false],
    ["anonymous past", false],
    ["editor", false],
    ["tester", false],
    ["restricted", false],
    ["joined", false],
  ] as const)("matches the problem-list join warning for %s viewers", async (scenario, expected) => {
    const t = setupTest();
    const contestId = await runningContest(t, "warning");
    const profileId = await insertProfile(t, { username: "player" });
    await t.run(async (ctx) => {
      if (scenario === "future") {
        await ctx.db.patch(contestId, { startTime: Date.now() + HOUR, endTime: Date.now() + 2 * HOUR });
      } else if (scenario === "past" || scenario === "anonymous past") {
        await ctx.db.patch(contestId, { endTime: Date.now() - 1 });
      } else if (scenario === "editor") {
        await ctx.db.patch(contestId, { authorProfileIds: [profileId] });
      } else if (scenario === "tester") {
        await ctx.db.patch(contestId, { testerProfileIds: [profileId] });
      } else if (scenario === "restricted") {
        await ctx.db.patch(contestId, { joinLimit: { organizationIds: [] } });
      }
    });
    const viewer = scenario.startsWith("anonymous") ? t : asUser(t, "player");

    if (scenario === "joined") {
      await viewer.mutation(api.contests.participation.join, { key: "warning" });
    }

    const detail = await viewer.query(api.contests.get, { key: "warning" });
    const bar = await viewer.query(api.contests.navBar, { key: "warning", browsing: true });

    const warningShown =
      detail.timing.started &&
      !detail.timing.ended &&
      !detail.viewer.inContest &&
      (!detail.viewer.isAuthenticated || detail.viewer.canJoinLive);

    expect(warningShown).toBe(expected);
    expect(bar?.showJoinWarning).toBe(warningShown);
  });

  it("provides released problems for upsolving without participation or lockdown", async () => {
    const t = setupTest();
    const contestId = await runningContest(t, "past");
    await t.run(async (ctx) => {
      await ctx.db.patch(contestId, { startTime: Date.now() - 3 * HOUR, endTime: Date.now() - HOUR });
    });
    const bar = await t.query(api.contests.navBar, { key: "past", browsing: true });
    expect(bar?.contest.key).toBe("past");
    expect(bar?.contest.isLockedDown).toBe(false);
    expect(bar?.participationId).toBeNull();
    expect(bar?.problems.map((p) => p.code)).toEqual(["past-alpha"]);
    expect(bar?.timeRemaining).toBeNull();
    expect(await t.query(api.contests.navBar, {})).toBeNull();
  });

  it("keeps contest tester membership separate from problem access in browsing chips", async () => {
    const t = setupTest();
    const contestId = await runningContest(t, "testing");
    const testerId = await insertProfile(t, { username: "tester" });
    const secretId = await insertProblem(t, { code: "secret", isPublic: false });
    await insertContestProblem(t, { contestId, problemId: secretId, order: 2, points: 1 });
    await t.run((ctx) => ctx.db.patch(contestId, { testerProfileIds: [testerId] }));
    const tester = asUser(t, "tester");

    const bar = await tester.query(api.contests.navBar, { key: "testing", browsing: true });
    expect(bar?.problems.map((problem) => problem.code)).toEqual(["testing-alpha"]);
    expect(bar?.showJoinWarning).toBe(false);
    expect(bar?.participationId).toBeNull();
    expect(await tester.query(api.problems.get, { code: "secret" })).toBeNull();

    await t.run((ctx) => ctx.db.patch(secretId, { testerProfileIds: [testerId] }));
    const explicit = await tester.query(api.contests.navBar, { key: "testing", browsing: true });
    expect(explicit?.problems.map((problem) => problem.code)).toEqual(["testing-alpha", "secret"]);
    expect(await tester.query(api.problems.get, { code: "secret" })).not.toBeNull();
  });

  it("does not expose hidden contests or unreleased problem lists", async () => {
    const t = setupTest();
    const contestId = await runningContest(t, "future");
    await t.run(async (ctx) => {
      await ctx.db.patch(contestId, { startTime: Date.now() + HOUR, endTime: Date.now() + 2 * HOUR });
    });
    expect((await t.query(api.contests.navBar, { key: "future", browsing: true }))?.problems).toEqual([]);
    await t.run(async (ctx) => {
      await ctx.db.patch(contestId, { isVisible: false });
    });
    expect(await t.query(api.contests.navBar, { key: "future", browsing: true })).toBeNull();
  });
});
