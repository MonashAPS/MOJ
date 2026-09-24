// @vitest-environment edge-runtime
/**
 * Whether the contest page offers a link to a problem it lists.
 *
 * The row used to ask only whether the problem was public, which is not the
 * question. A problem that is not public is still the competitor's to open while
 * they are inside the contest, and `/problem/<code>` has always served it — only
 * the contest page refused to link it.
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

/** A running contest holding one public problem and one private one. */
async function contestWithPrivateProblem(t: T) {
  const languageId = await insertLanguage(t, { key: "PY3" });

  const open = await insertProblem(t, {
    code: "alpha",
    isPublic: true,
    allowedLanguageIds: [languageId],
  });

  const secret = await insertProblem(t, {
    code: "beta",
    isPublic: false,
    allowedLanguageIds: [languageId],
  });

  const contestId = await insertContest(t, {
    key: "gated",
    startTime: Date.now() - HOUR,
    endTime: Date.now() + HOUR,
  });

  await insertContestProblem(t, { contestId, problemId: open, order: 1, points: 1 });
  await insertContestProblem(t, { contestId, problemId: secret, order: 2, points: 1 });

  return contestId;
}

async function accessByCode(t: T, username: string): Promise<Map<string, boolean>> {
  const detail = await asUser(t, username).query(api.contests.get, { key: "gated" });

  return new Map(
    detail.problems.filter((row) => row.kind === "problem").map((row) => [row.code, row.isAccessible]),
  );
}

describe("a private problem in a contest the viewer is competing in", () => {
  it("is offered as a link, the same as the public one beside it", async () => {
    const t = setupTest();
    const contestId = await contestWithPrivateProblem(t);
    const playerId = await insertProfile(t, { username: "player" });
    await t.run(async (ctx) => {
      const participationId = await insertParticipation(ctx, { contestId, profileId: playerId });
      await ctx.db.patch(playerId, { currentParticipationId: participationId });
    });

    const access = await accessByCode(t, "player");

    expect(access.get("alpha")).toBe(true);
    expect(access.get("beta")).toBe(true);
  });

  it("is offered to a superuser, who could always read it", async () => {
    const t = setupTest();
    await contestWithPrivateProblem(t);
    await insertProfile(t, { username: "root", isSuperuser: true });

    const access = await accessByCode(t, "root");

    expect(access.get("alpha")).toBe(true);
    expect(access.get("beta")).toBe(true);
  });
});

describe("a spectator watching a running contest", () => {
  it("sees only accessible identities until entering spectate mode", async () => {
    const t = setupTest();
    const contestId = await contestWithPrivateProblem(t);
    const spectatorId = await insertProfile(t, { username: "spectator" });
    await t.run(async (ctx) => ctx.db.patch(contestId, { spectatorProfileIds: [spectatorId] }));

    const spectator = asUser(t, "spectator");
    const before = await spectator.query(api.contests.get, { key: "gated" });

    expect(before.problemsReleased).toBe(true);
    expect(before.problems[0]).toMatchObject({ kind: "problem", code: "alpha" });
    expect(before.problems[1]).toMatchObject({ kind: "restricted", label: "B" });
    expect(before.problems[1]).not.toHaveProperty("code");
    expect(await spectator.query(api.problems.get, { code: "beta" })).toBeNull();

    await t.run(async (ctx) => {
      const participationId = await insertParticipation(ctx, {
        contestId,
        profileId: spectatorId,
        virtual: -1,
      });

      await ctx.db.patch(spectatorId, { currentParticipationId: participationId });
    });

    const after = await spectator.query(api.contests.get, { key: "gated" });

    expect(after.problems[1]).toMatchObject({ kind: "problem", code: "beta", isAccessible: true });
    expect(await spectator.query(api.problems.get, { code: "beta" })).not.toBeNull();
  });
});

describe("a private problem in a contest that has ended", () => {
  it("is listed but not linked, because nobody is inside the contest any more", async () => {
    const t = setupTest();
    const languageId = await insertLanguage(t, { key: "PY3" });

    const open = await insertProblem(t, {
      code: "alpha",
      isPublic: true,
      allowedLanguageIds: [languageId],
    });

    const secret = await insertProblem(t, {
      code: "beta",
      isPublic: false,
      allowedLanguageIds: [languageId],
    });

    const contestId = await insertContest(t, {
      key: "gated",
      startTime: Date.now() - 2 * HOUR,
      endTime: Date.now() - HOUR,
      problemListReleaseAt: "end",
    });

    await insertContestProblem(t, { contestId, problemId: open, order: 1, points: 1 });
    await insertContestProblem(t, { contestId, problemId: secret, order: 2, points: 1 });
    await insertProfile(t, { username: "reader" });

    const detail = await asUser(t, "reader").query(api.contests.get, { key: "gated" });

    expect(detail.problems[0]).toMatchObject({ kind: "problem", code: "alpha", isAccessible: true });
    expect(detail.problems[1]).toEqual(
      expect.objectContaining({ kind: "restricted", label: "B", points: 1 }),
    );
    expect(detail.problems[1]).not.toHaveProperty("code");
    expect(detail.problems[1]).not.toHaveProperty("name");
    expect(detail.problems[1]).not.toHaveProperty("problemId");
  });
});
