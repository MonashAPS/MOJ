// @vitest-environment edge-runtime
/**
 * What the contest list tells you about your way through a contest.
 *
 * The interesting rule is what it withholds: which problems a contest holds
 * back is itself information, so somebody who never took part must not be able
 * to count them — not from the squares, and not from the total beside them.
 */

import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { insertContest, insertContestProblem, insertParticipation } from "./contests.fixtures";
import {
  makeLanguage,
  makeProblem,
  makeProfile,
  makeSubmission,
  setupTest,
  type T,
} from "./fixtures.helpers";

async function fixture() {
  const t: T = setupTest();
  const languageId = await makeLanguage(t, "PY3");
  const open1 = await makeProblem(t, { code: "open1", isPublic: true, allowedLanguageIds: [languageId] });
  const open2 = await makeProblem(t, { code: "open2", isPublic: true, allowedLanguageIds: [languageId] });
  const secret = await makeProblem(t, { code: "secret", isPublic: false, allowedLanguageIds: [languageId] });
  const member = await makeProfile(t);

  const now = Date.now();
  const contestId = await t.run(async (ctx) =>
    insertContest(ctx.db, "past", { startTime: now - 7_200_000, endTime: now - 3_600_000 }),
  );
  await t.run(async (ctx) => insertContestProblem(ctx.db, contestId, open1, 1));
  await t.run(async (ctx) => insertContestProblem(ctx.db, contestId, open2, 2));
  await t.run(async (ctx) => insertContestProblem(ctx.db, contestId, secret, 3));

  return { t, contestId, member, languageId, open1 };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function progressFor(f: Fixture) {
  const payload = await f.t
    .withIdentity({ subject: f.member.userId })
    .query(api.contests.list, { paginationOpts: { numItems: 20, cursor: null } });
  return payload.past.page[0]?.progress ?? null;
}

describe("a contest the viewer never joined", () => {
  it("shows only the public problems and does not say how many are hidden", async () => {
    const f = await fixture();
    const progress = await progressFor(f);

    expect(progress?.problems.map((row) => row.code)).toEqual(["open1", "open2"]);
    expect(progress?.hasHidden).toBe(true);
    // The total counts what is shown, not what exists: a total of three here
    // would give the hidden problem away just as surely as a third square.
    expect(progress?.total).toBe(2);
    expect(JSON.stringify(progress)).not.toContain("secret");
  });

  it("marks a problem solved once they have solved it", async () => {
    const f = await fixture();
    expect((await progressFor(f))?.solved).toBe(0);

    await makeSubmission(f.t, {
      profileId: f.member.profileId,
      problemId: f.open1,
      languageId: f.languageId,
      status: "D",
      result: "AC",
    });

    const progress = await progressFor(f);
    expect(progress?.solved).toBe(1);
    expect(progress?.problems.find((row) => row.code === "open1")?.solved).toBe(true);
  });
});

describe("a contest the viewer took part in", () => {
  it("shows everything, including what is not public", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => insertParticipation(ctx.db, f.contestId, f.member.profileId));

    const progress = await progressFor(f);
    expect(progress?.problems.map((row) => row.code)).toEqual(["open1", "open2", "secret"]);
    expect(progress?.hasHidden).toBe(false);
    expect(progress?.total).toBe(3);
  });
});

describe("signed out", () => {
  it("gets no progress at all rather than an empty one", async () => {
    const f = await fixture();
    const payload = await f.t.query(api.contests.list, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(payload.past.page[0]?.progress).toBeNull();
  });
});
