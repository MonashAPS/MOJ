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
