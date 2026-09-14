// @vitest-environment edge-runtime
/**
 * When a contest's problem list is allowed out.
 *
 * The page used to decide this on its own, which meant the answer travelled to
 * the browser before the browser was told not to draw it. These pin the rule
 * where it now lives: the query either sends the problems or it does not.
 */

import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { insertContest, insertContestProblem, insertParticipation } from "./contests.fixtures";
import { makeLanguage, makeProblem, makeProfile, setupTest, type T } from "./fixtures.helpers";

const HOUR = 3_600_000;

type Window = { startTime: number; endTime: number };

const ended: Window = { startTime: Date.now() - 2 * HOUR, endTime: Date.now() - HOUR };
const running: Window = { startTime: Date.now() - HOUR, endTime: Date.now() + HOUR };
const upcoming: Window = { startTime: Date.now() + HOUR, endTime: Date.now() + 2 * HOUR };

async function contestWith(t: T, window: Window, overrides: Record<string, unknown> = {}) {
  const languageId = await makeLanguage(t, "PY3");
  const problemId = await makeProblem(t, {
    code: "alpha",
    isPublic: true,
    allowedLanguageIds: [languageId],
  });
  const contestId = await t.run(async (ctx) => insertContest(ctx.db, "gated", { ...window, ...overrides }));
  await t.run(async (ctx) => insertContestProblem(ctx.db, contestId, problemId, 1));
  return contestId;
}

async function detailFor(t: T, userId?: string) {
  const caller = userId ? t.withIdentity({ subject: userId }) : t;
  return await caller.query(api.contests.get, { key: "gated" });
}

describe("a contest that has finished", () => {
  it("sends its problems to anyone", async () => {
    const t = setupTest();
    await contestWith(t, ended);

    const detail = await detailFor(t);

    expect(detail.problemsReleased).toBe(true);
    expect(detail.problems.map((row) => row.code)).toEqual(["alpha"]);
  });
});

describe("a contest that has not started", () => {
  it("withholds them from a signed-in stranger", async () => {
    const t = setupTest();
    await contestWith(t, upcoming);
    const stranger = await makeProfile(t);

    const detail = await detailFor(t, stranger.userId);

    expect(detail.problemsReleased).toBe(false);
    expect(detail.problems).toEqual([]);
  });

  it("withholds them from a spectator, who has nothing to spectate yet", async () => {
    const t = setupTest();
    const spectator = await makeProfile(t);
    await contestWith(t, upcoming, { spectatorProfileIds: [spectator.profileId] });

    const detail = await detailFor(t, spectator.userId);

    expect(detail.problemsReleased).toBe(false);
    expect(detail.problems).toEqual([]);
  });

  it("still sends them to a tester, who is the reason they exist", async () => {
    const t = setupTest();
    const tester = await makeProfile(t);
    await contestWith(t, upcoming, { testerProfileIds: [tester.profileId] });

    const detail = await detailFor(t, tester.userId);

    expect(detail.problemsReleased).toBe(true);
    expect(detail.problems.map((row) => row.code)).toEqual(["alpha"]);
  });

  it("still sends them to a superuser", async () => {
    const t = setupTest();
    await contestWith(t, upcoming);
    const root = await makeProfile(t, { isSuperuser: true });

    const detail = await detailFor(t, root.userId);

    expect(detail.problemsReleased).toBe(true);
  });
});

describe("a contest in progress", () => {
  it("withholds them from somebody who joined but has since left contest mode", async () => {
    const t = setupTest();
    const contestId = await contestWith(t, running);
    const player = await makeProfile(t);
    await t.run(async (ctx) => insertParticipation(ctx.db, contestId, player.profileId));

    const detail = await detailFor(t, player.userId);

    expect(detail.problemsReleased).toBe(false);
  });

  it("withholds them from somebody watching from outside", async () => {
    const t = setupTest();
    await contestWith(t, running);
    const onlooker = await makeProfile(t);

    const detail = await detailFor(t, onlooker.userId);

    expect(detail.problemsReleased).toBe(false);
    expect(detail.problems).toEqual([]);
  });

  it("sends them to somebody who is competing in it", async () => {
    const t = setupTest();
    const contestId = await contestWith(t, running);
    const player = await makeProfile(t);
    await t.run(async (ctx) => {
      const participationId = await insertParticipation(ctx.db, contestId, player.profileId);
      await ctx.db.patch(player.profileId, { currentParticipationId: participationId });
    });

    const detail = await detailFor(t, player.userId);

    expect(detail.problemsReleased).toBe(true);
    expect(detail.problems.map((row) => row.code)).toEqual(["alpha"]);
  });

  it("sends them to a spectator now that there is something to watch", async () => {
    const t = setupTest();
    const spectator = await makeProfile(t);
    await contestWith(t, running, { spectatorProfileIds: [spectator.profileId] });

    const detail = await detailFor(t, spectator.userId);

    expect(detail.problemsReleased).toBe(true);
  });
});
