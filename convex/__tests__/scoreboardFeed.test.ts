// @vitest-environment edge-runtime
/**
 * The hall scoreboard's event feed (`convex/pages/scoreboard.ts`).
 *
 * The rule that matters is the freeze: an entry from inside the freeze reads as
 * pending and carries no verdict, for staff as much as for the hall, so the
 * sidebar cannot spoil the grid or the reveal.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  HOUR,
  identityOf,
  insertContest,
  insertContestProblem,
  insertGroup,
  insertLanguage,
  insertParticipation,
  insertProblem,
  insertProfile,
  insertSubmission,
  MINUTE,
} from "./contests.fixtures";

const modules = import.meta.glob("../**/*.ts");

function harness() {
  return convexTest(schema, modules);
}

/**
 * One event over two divisions, an hour of freeze on each. Ada solves before
 * the freeze, Bob inside it, Cid is still with the judge, and Dot was
 * disqualified after submitting.
 */
async function event(t: ReturnType<typeof harness>, isPublic = true) {
  const now = Date.now();
  const start = now - 3 * HOUR;
  const end = now - HOUR;

  return await t.run(async (ctx) => {
    const groupId = await insertGroup(ctx.db);
    const languageId = await insertLanguage(ctx.db);
    const superuserId = await insertProfile(ctx.db, "root", { isSuperuser: true, isStaff: true });
    await insertProfile(ctx.db, "watcher");

    const adaId = await insertProfile(ctx.db, "ada");
    const bobId = await insertProfile(ctx.db, "bob");
    const cidId = await insertProfile(ctx.db, "cid");
    const dotId = await insertProfile(ctx.db, "dot");

    const problemA = await insertProblem(ctx.db, "alpha", groupId);
    const problemB = await insertProblem(ctx.db, "beta", groupId);

    const divA = await insertContest(ctx.db, "diva", {
      name: "Division A",
      startTime: start,
      endTime: end,
      formatName: "icpc",
      formatConfig: { penalty: 20 },
      labelScheme: "letters",
    });
    const divB = await insertContest(ctx.db, "divb", {
      name: "Division B",
      startTime: start,
      endTime: end,
      formatName: "icpc",
      formatConfig: { penalty: 20 },
      labelScheme: "letters",
    });

    const cpA = await insertContestProblem(ctx.db, divA, problemA, 0);
    const cpB = await insertContestProblem(ctx.db, divB, problemB, 0);

    const ada = await insertParticipation(ctx.db, divA, adaId, { realStart: start });
    const bob = await insertParticipation(ctx.db, divA, bobId, { realStart: start });
    const cid = await insertParticipation(ctx.db, divB, cidId, { realStart: start });
    const dot = await insertParticipation(ctx.db, divA, dotId, {
      realStart: start,
      isDisqualified: true,
    });

    await insertSubmission(ctx.db, {
      profileId: adaId,
      problemId: problemA,
      languageId,
      contestId: divA,
      contestProblemId: cpA,
      participationId: ada,
      date: start + 30 * MINUTE,
      result: "AC",
    });
    await insertSubmission(ctx.db, {
      profileId: adaId,
      problemId: problemA,
      languageId,
      contestId: divA,
      contestProblemId: cpA,
      participationId: ada,
      date: start + 20 * MINUTE,
      result: "WA",
    });
    // Inside the freeze: an accept nobody may see yet.
    await insertSubmission(ctx.db, {
      profileId: bobId,
      problemId: problemA,
      languageId,
      contestId: divA,
      contestProblemId: cpA,
      participationId: bob,
      date: start + 90 * MINUTE,
      result: "AC",
    });
    // Before the freeze, still queued.
    await insertSubmission(ctx.db, {
      profileId: cidId,
      problemId: problemB,
      languageId,
      contestId: divB,
      contestProblemId: cpB,
      participationId: cid,
      date: start + 40 * MINUTE,
      status: "QU",
      result: undefined,
    });
    await insertSubmission(ctx.db, {
      profileId: dotId,
      problemId: problemA,
      languageId,
      contestId: divA,
      contestProblemId: cpA,
      participationId: dot,
      date: start + 35 * MINUTE,
      result: "AC",
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
    const t = harness();
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
    const t = harness();
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
    const t = harness();
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
    const t = harness();
    await event(t);

    const items = await t.query(api.pages.scoreboard.feed, { key: "hall" });
    expect(items.some((item) => item.username === "dot")).toBe(false);
    expect(await t.query(api.pages.scoreboard.feed, { key: "nope" })).toEqual([]);
  });

  test("a private event is staff only", async () => {
    const t = harness();
    await event(t, false);

    expect(await t.query(api.pages.scoreboard.feed, { key: "hall" })).toEqual([]);
    expect(
      (await t.withIdentity(identityOf("root")).query(api.pages.scoreboard.feed, { key: "hall" })).length,
    ).toBeGreaterThan(0);
  });

  test("honours the limit", async () => {
    const t = harness();
    await event(t);

    expect((await t.query(api.pages.scoreboard.feed, { key: "hall", limit: 2 })).length).toBe(2);
  });
});
