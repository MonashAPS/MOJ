// @vitest-environment edge-runtime
/**
 * When a contest's problem list is allowed out.
 *
 * The page used to decide this on its own, which meant the answer travelled to
 * the browser before the browser was told not to draw it. These pin the rule
 * where it now lives: the query either sends the problems or it does not.
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
  type Overrides,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

type Window = { startTime: number; endTime: number };

const ended: Window = { startTime: Date.now() - 2 * HOUR, endTime: Date.now() - HOUR };

const running: Window = { startTime: Date.now() - HOUR, endTime: Date.now() + HOUR };

const upcoming: Window = { startTime: Date.now() + HOUR, endTime: Date.now() + 2 * HOUR };

async function contestWith(t: T, window: Window, overrides: Overrides<"contests"> = {}) {
  const languageId = await insertLanguage(t, { key: "PY3" });

  const problemId = await insertProblem(t, {
    code: "alpha",
    isPublic: true,
    allowedLanguageIds: [languageId],
  });

  const contestId = await insertContest(t, { key: "gated", ...window, ...overrides });
  await insertContestProblem(t, { contestId, problemId, order: 1, points: 1 });

  return contestId;
}

async function detailFor(t: T, username?: string) {
  const caller = username ? asUser(t, username) : t;

  return await caller.query(api.contests.get, { key: "gated" });
}

describe("an unset list release policy", () => {
  it.each([
    { window: upcoming, released: false },
    { window: running, released: true },
    { window: ended, released: true },
  ])("defaults to start for $window", async ({ window, released }) => {
    const t = setupTest();
    const contestId = await contestWith(t, window);
    await insertProfile(t, { username: "admin", isStaff: true, isSuperuser: true });

    const detail = await detailFor(t);
    expect(detail.problemsReleased).toBe(released);
    expect(detail.contest?.problemListReleaseAt).toBe("start");
    expect(detail.problems).toHaveLength(released ? 1 : 0);
    const admin = await asUser(t, "admin").query(api.pages.admin.contests.edit, { key: "gated" });
    expect(admin?.problemListReleaseAt).toBe("start");

    await t.run(async (ctx) => {
      const stored = await ctx.db.get(contestId);
      expect(stored?.problemListReleaseAt).toBeUndefined();
      expect(stored?.publishProblemsAt).toBeUndefined();
      expect(stored?.problemsPublishedAt).toBeUndefined();
    });
  });
});

describe("a contest that has finished", () => {
  it("does not release its problems merely because it ended", async () => {
    const t = setupTest();
    await contestWith(t, ended, { problemListReleaseAt: null });

    const detail = await detailFor(t);

    expect(detail.problemsReleased).toBe(false);
    expect(detail.problems).toEqual([]);
  });

  it("sends its problems to anyone once the selected boundary has passed", async () => {
    const t = setupTest();
    await contestWith(t, ended, { problemListReleaseAt: "end" });

    const detail = await detailFor(t);

    expect(detail.problemsReleased).toBe(true);
    expect(detail.problems.map((row) => row.code)).toEqual(["alpha"]);
  });

  it("reveals immediately after crossing the boundary without running a cron", async () => {
    const t = setupTest();
    const contestId = await contestWith(t, upcoming, { problemListReleaseAt: "start" });

    expect((await detailFor(t)).problemsReleased).toBe(false);

    await t.run(async (ctx) => {
      await ctx.db.patch(contestId, { startTime: Date.now() - 1 });
    });

    const detail = await detailFor(t);
    expect(detail.problemsReleased).toBe(true);
    expect(detail.problems.map((row) => row.code)).toEqual(["alpha"]);
  });

  it("can hide the list again when the boundary moves into the future", async () => {
    const t = setupTest();
    const contestId = await contestWith(t, ended, { problemListReleaseAt: "end" });

    expect((await detailFor(t)).problemsReleased).toBe(true);

    await t.run(async (ctx) => {
      await ctx.db.patch(contestId, { endTime: Date.now() + HOUR });
    });

    expect((await detailFor(t)).problemsReleased).toBe(false);
  });
});

describe("a contest that has not started", () => {
  it("withholds them from a signed-in stranger", async () => {
    const t = setupTest();
    await contestWith(t, upcoming);
    await insertProfile(t, { username: "stranger" });

    const detail = await detailFor(t, "stranger");

    expect(detail.problemsReleased).toBe(false);
    expect(detail.problems).toEqual([]);
  });

  it("withholds them from a spectator, who has nothing to spectate yet", async () => {
    const t = setupTest();
    const spectatorId = await insertProfile(t, { username: "spectator" });
    await contestWith(t, upcoming, { spectatorProfileIds: [spectatorId] });

    const detail = await detailFor(t, "spectator");

    expect(detail.problemsReleased).toBe(false);
    expect(detail.problems).toEqual([]);
  });

  it("still sends them to a tester, who is the reason they exist", async () => {
    const t = setupTest();
    const testerId = await insertProfile(t, { username: "tester" });
    await contestWith(t, upcoming, { testerProfileIds: [testerId] });

    const detail = await detailFor(t, "tester");

    expect(detail.problemsReleased).toBe(true);
    expect(detail.problems.map((row) => row.code)).toEqual(["alpha"]);
  });

  it("still sends them to a superuser", async () => {
    const t = setupTest();
    await contestWith(t, upcoming);
    await insertProfile(t, { username: "root", isSuperuser: true });

    const detail = await detailFor(t, "root");

    expect(detail.problemsReleased).toBe(true);
  });

  it("sends them to staff who may edit every contest without making them join", async () => {
    const t = setupTest();
    await contestWith(t, upcoming);
    await insertProfile(t, {
      username: "staff",
      isStaff: true,
      permissions: ["judge.edit_all_contest"],
    });

    const detail = await detailFor(t, "staff");

    expect(detail.problemsReleased).toBe(true);
    expect(detail.problems.map((row) => row.code)).toEqual(["alpha"]);
  });
});

describe("a contest in progress", () => {
  it("withholds them from somebody who joined but has since left contest mode", async () => {
    const t = setupTest();
    const contestId = await contestWith(t, running, { problemListReleaseAt: null });
    const playerId = await insertProfile(t, { username: "player" });
    await insertParticipation(t, { contestId, profileId: playerId });

    const detail = await detailFor(t, "player");

    expect(detail.problemsReleased).toBe(false);
  });

  it("withholds them from somebody watching from outside", async () => {
    const t = setupTest();
    await contestWith(t, running, { problemListReleaseAt: null });
    await insertProfile(t, { username: "onlooker" });

    const detail = await detailFor(t, "onlooker");

    expect(detail.problemsReleased).toBe(false);
    expect(detail.problems).toEqual([]);
  });

  it("sends them to somebody who is competing in it", async () => {
    const t = setupTest();
    const contestId = await contestWith(t, running, { problemListReleaseAt: null });
    const playerId = await insertProfile(t, { username: "player" });
    await t.run(async (ctx) => {
      const participationId = await insertParticipation(ctx, { contestId, profileId: playerId });
      await ctx.db.patch(playerId, { currentParticipationId: participationId });
    });

    const detail = await detailFor(t, "player");

    expect(detail.problemsReleased).toBe(true);
    expect(detail.problems.map((row) => row.code)).toEqual(["alpha"]);
  });

  it("sends them to a spectator now that there is something to watch", async () => {
    const t = setupTest();
    const spectatorId = await insertProfile(t, { username: "spectator" });
    await contestWith(t, running, { spectatorProfileIds: [spectatorId] });

    const detail = await detailFor(t, "spectator");

    expect(detail.problemsReleased).toBe(true);
  });
});
