// @vitest-environment edge-runtime
/**
 * What "Active contests" on the contest list means.
 *
 * It used to mean every contest where the viewer held a live participation row,
 * which is not the same as a contest they are in. An open-ended contest never
 * ends one, so joining the tutorial once left it listed for good behind a Leave
 * button that answered `You are not in contest "sample"`.
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { asUser, HOUR, insertContest, insertParticipation, insertProfile } from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

async function listFor(t: T, username: string) {
  return await asUser(t, username).query(api.contests.list, {
    paginationOpts: { numItems: 20, cursor: null },
  });
}

describe("a contest the viewer once joined but is not in", () => {
  it("is not listed as active, however open-ended it is", async () => {
    const t = setupTest();

    const openEnded = await insertContest(t, {
      key: "sample",
      startTime: Date.now() - 10 * HOUR,
      endTime: Date.now() + 1_000 * HOUR,
    });

    const playerId = await insertProfile(t, { username: "player" });
    await t.run(async (ctx) => insertParticipation(ctx, { contestId: openEnded, profileId: playerId }));

    const payload = await listFor(t, "player");

    expect(payload.activeParticipations).toEqual([]);
  });

  it("is still offered among the ongoing ones", async () => {
    const t = setupTest();

    const openEnded = await insertContest(t, {
      key: "sample",
      startTime: Date.now() - 10 * HOUR,
      endTime: Date.now() + 1_000 * HOUR,
    });

    const playerId = await insertProfile(t, { username: "player" });
    await t.run(async (ctx) => insertParticipation(ctx, { contestId: openEnded, profileId: playerId }));

    const payload = await listFor(t, "player");

    expect(payload.current.map((row) => row.key)).toContain("sample");
  });
});

describe("the contest the viewer is in", () => {
  it("is the one listed as active", async () => {
    const t = setupTest();

    const openEnded = await insertContest(t, {
      key: "sample",
      startTime: Date.now() - 10 * HOUR,
      endTime: Date.now() + 1_000 * HOUR,
    });

    const running = await insertContest(t, {
      key: "live",
      startTime: Date.now() - HOUR,
      endTime: Date.now() + HOUR,
    });

    const playerId = await insertProfile(t, { username: "player" });
    await t.run(async (ctx) => {
      await insertParticipation(ctx, { contestId: openEnded, profileId: playerId });
      const inLive = await insertParticipation(ctx, { contestId: running, profileId: playerId });
      await ctx.db.patch(playerId, { currentParticipationId: inLive });
    });

    const payload = await listFor(t, "player");

    expect(payload.activeParticipations.map((row) => row.contest.key)).toEqual(["live"]);
  });

  it("is not also offered as one to join", async () => {
    const t = setupTest();

    const running = await insertContest(t, {
      key: "live",
      startTime: Date.now() - HOUR,
      endTime: Date.now() + HOUR,
    });

    const playerId = await insertProfile(t, { username: "player" });
    await t.run(async (ctx) => {
      const inLive = await insertParticipation(ctx, { contestId: running, profileId: playerId });
      await ctx.db.patch(playerId, { currentParticipationId: inLive });
    });

    const payload = await listFor(t, "player");

    expect(payload.current.map((row) => row.key)).not.toContain("live");
  });

  it("is listed as active even on a contest that has finished, which a virtual run is", async () => {
    const t = setupTest();

    const finished = await insertContest(t, {
      key: "over",
      startTime: Date.now() - 4 * HOUR,
      endTime: Date.now() - 2 * HOUR,
    });

    const playerId = await insertProfile(t, { username: "player" });
    await t.run(async (ctx) => {
      const virtualRun = await insertParticipation(ctx, {
        contestId: finished,
        profileId: playerId,
        virtual: 1,
        realStart: Date.now(),
      });

      await ctx.db.patch(playerId, { currentParticipationId: virtualRun });
    });

    const payload = await listFor(t, "player");

    expect(payload.activeParticipations.map((row) => row.contest.key)).toEqual(["over"]);
  });
});
