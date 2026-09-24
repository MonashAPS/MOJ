// @vitest-environment edge-runtime
/**
 * The hall scoreboard's event feed (`convex/pages/scoreboard.ts`).
 *
 * The rule that matters is the freeze: an entry from inside the freeze reads as
 * pending and carries no verdict, for staff as much as for the hall, so the
 * sidebar cannot spoil the grid or the reveal.
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import {
  asUser,
  HOUR,
  identityOf,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertParticipation,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSubmission,
  MINUTE,
} from "../test.fixtures";
import { setupTest, type T } from "../test.setup";

/**
 * One event over two divisions, an hour of freeze on each. Ada solves before
 * the freeze, Bob inside it, Cid is still with the judge, and Dot was
 * disqualified after submitting.
 */
async function event(t: T, isPublic = true) {
  const now = Date.now();
  const start = now - 3 * HOUR;
  const end = now - HOUR;

  return await t.run(async (ctx) => {
    const groupId = await insertProblemGroup(ctx);
    const languageId = await insertLanguage(ctx);

    const superuserId = await insertProfile(ctx, {
      username: "root",
      isSuperuser: true,
      isStaff: true,
    });

    await insertProfile(ctx, { username: "watcher" });

    const adaId = await insertProfile(ctx, { username: "ada" });
    const bobId = await insertProfile(ctx, { username: "bob" });
    const cidId = await insertProfile(ctx, { username: "cid" });
    const dotId = await insertProfile(ctx, { username: "dot" });

    const problemA = await insertProblem(ctx, { code: "alpha", groupId });
    const problemB = await insertProblem(ctx, { code: "beta", groupId });

    const divA = await insertContest(ctx, {
      key: "diva",
      name: "Division A",
      startTime: start,
      endTime: end,
      problemListReleaseAt: "end",
      formatName: "icpc",
      formatConfig: { penalty: 20 },
    });

    const divB = await insertContest(ctx, {
      key: "divb",
      name: "Division B",
      startTime: start,
      endTime: end,
      problemListReleaseAt: "end",
      formatName: "icpc",
      formatConfig: { penalty: 20 },
    });

    const cpA = await insertContestProblem(ctx, {
      contestId: divA,
      problemId: problemA,
      order: 0,
      points: 1,
    });

    const cpB = await insertContestProblem(ctx, {
      contestId: divB,
      problemId: problemB,
      order: 0,
      points: 1,
    });

    const ada = await insertParticipation(ctx, {
      contestId: divA,
      profileId: adaId,
      realStart: start,
    });

    const bob = await insertParticipation(ctx, {
      contestId: divA,
      profileId: bobId,
      realStart: start,
    });

    const cid = await insertParticipation(ctx, {
      contestId: divB,
      profileId: cidId,
      realStart: start,
    });

    const dot = await insertParticipation(ctx, {
      contestId: divA,
      profileId: dotId,
      realStart: start,
      isDisqualified: true,
    });

    await insertSubmission(ctx, {
      profileId: adaId,
      problemId: problemA,
      languageId,
      contestId: divA,
      contestProblemId: cpA,
      participationId: ada,
      date: start + 30 * MINUTE,
      result: "AC",
      points: 100,
      casePoints: 1,
      contestPoints: 1,
      time: 0.1,
      memory: 1024,
    });
    await insertSubmission(ctx, {
      profileId: adaId,
      problemId: problemA,
      languageId,
      contestId: divA,
      contestProblemId: cpA,
      participationId: ada,
      date: start + 20 * MINUTE,
      result: "WA",
      points: 0,
      casePoints: 0,
      contestPoints: 0,
      time: 0.1,
      memory: 1024,
    });
    // Inside the freeze: an accept nobody may see yet.
    await insertSubmission(ctx, {
      profileId: bobId,
      problemId: problemA,
      languageId,
      contestId: divA,
      contestProblemId: cpA,
      participationId: bob,
      date: start + 90 * MINUTE,
      result: "AC",
      points: 100,
      casePoints: 1,
      contestPoints: 1,
      time: 0.1,
      memory: 1024,
    });
    // Before the freeze, still queued.
    await insertSubmission(ctx, {
      profileId: cidId,
      problemId: problemB,
      languageId,
      contestId: divB,
      contestProblemId: cpB,
      participationId: cid,
      date: start + 40 * MINUTE,
      status: "QU",
      result: undefined,
      points: 0,
      casePoints: 0,
      contestPoints: 0,
      time: 0.1,
      memory: 1024,
    });
    await insertSubmission(ctx, {
      profileId: dotId,
      problemId: problemA,
      languageId,
      contestId: divA,
      contestProblemId: cpA,
      participationId: dot,
      date: start + 35 * MINUTE,
      result: "AC",
      points: 100,
      casePoints: 1,
      contestPoints: 1,
      time: 0.1,
      memory: 1024,
    });

    await ctx.db.insert("scoreboardEvents", {
      key: "hall",
      name: "Hall",
      contestIds: [divA, divB],
      theme: "olympics",
      badgeOrganizationSlugs: [],
      freezeMinutes: 60,
      isPublic,
    });

    return { superuserId, start };
  });
}

describe("the hall event feed", () => {
  test("merges the divisions newest first and names the problem by its label", async () => {
    const t = setupTest();
    await event(t);

    const items = await t.query(api.pages.scoreboard.feed, { key: "hall" });
    expect(items.map((item) => item.username)).toEqual(["bob", "cid", "ada", "ada"]);
    expect(items.map((item) => item.divisionName)).toEqual([
      "Division A",
      "Division B",
      "Division A",
      "Division A",
    ]);
    expect(items.map((item) => item.problem)).toEqual(["A", "A", "A", "A"]);
    expect(items.map((item) => item.minute)).toEqual([90, 40, 30, 20]);
  });

  test("classifies solved, wrong and queued entries", async () => {
    const t = setupTest();
    await event(t);

    const items = await t.query(api.pages.scoreboard.feed, { key: "hall" });

    const byUserAndMinute = Object.fromEntries(
      items.map((item) => [`${item.username}:${item.minute}`, item]),
    );

    expect(byUserAndMinute["ada:30"]?.state).toBe("correct");
    expect(byUserAndMinute["ada:30"]?.verdict).toBe("AC");
    expect(byUserAndMinute["ada:20"]?.state).toBe("incorrect");
    expect(byUserAndMinute["cid:40"]?.state).toBe("pending");
    expect(byUserAndMinute["cid:40"]?.masked).toBe(false);
  });

  test("masks anything inside the freeze, for staff too", async () => {
    const t = setupTest();
    await event(t);

    for (const identity of [null, identityOf("root")]) {
      const client = identity ? t.withIdentity(identity) : t;
      const items = await client.query(api.pages.scoreboard.feed, { key: "hall" });
      const frozen = items.find((item) => item.username === "bob");
      expect(frozen?.state).toBe("pending");
      expect(frozen?.masked).toBe(true);
      expect(frozen?.verdict).toBeNull();
    }
  });

  test("drops disqualified competitors and unknown events", async () => {
    const t = setupTest();
    await event(t);

    const items = await t.query(api.pages.scoreboard.feed, { key: "hall" });
    expect(items.some((item) => item.username === "dot")).toBe(false);
    expect(await t.query(api.pages.scoreboard.feed, { key: "nope" })).toEqual([]);
  });

  test("a private event is staff only", async () => {
    const t = setupTest();
    await event(t, false);

    expect(await t.query(api.pages.scoreboard.feed, { key: "hall" })).toEqual([]);
    expect(
      (await asUser(t, "root").query(api.pages.scoreboard.feed, { key: "hall" })).length,
    ).toBeGreaterThan(0);
  });

  test("honours the limit", async () => {
    const t = setupTest();
    await event(t);

    expect((await t.query(api.pages.scoreboard.feed, { key: "hall", limit: 2 })).length).toBe(2);
  });
});
