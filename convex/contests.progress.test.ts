// @vitest-environment edge-runtime
/**
 * What the contest list tells you about your way through a contest.
 *
 * Every problem counts, public or not: the contest's own page already names
 * them all, so holding them back here would hide nothing and make the total a
 * lie.
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertParticipation,
  insertProblem,
  insertProfile,
  insertSubmission,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

async function fixture() {
  const t: T = setupTest();
  const languageId = await insertLanguage(t, { key: "PY3" });
  const open1 = await insertProblem(t, { code: "open1", isPublic: true, allowedLanguageIds: [languageId] });
  const open2 = await insertProblem(t, { code: "open2", isPublic: true, allowedLanguageIds: [languageId] });

  const secret = await insertProblem(t, {
    code: "secret",
    isPublic: false,
    allowedLanguageIds: [languageId],
  });

  const memberId = await insertProfile(t, { username: "member" });

  const now = Date.now();

  const contestId = await insertContest(t, {
    key: "past",
    startTime: now - 7_200_000,
    endTime: now - 3_600_000,
    problemListReleaseAt: "end",
  });

  await insertContestProblem(t, { contestId, problemId: open1, order: 1, points: 1 });
  await insertContestProblem(t, { contestId, problemId: open2, order: 2, points: 1 });
  await insertContestProblem(t, { contestId, problemId: secret, order: 3, points: 1 });

  return { t, contestId, memberId, languageId, open1 };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function progressFor(f: Fixture) {
  const payload = await asUser(f.t, "member").query(api.contests.list, {
    paginationOpts: { numItems: 20, cursor: null },
  });

  return payload.past.page[0]?.progress ?? null;
}

describe("a contest the viewer never joined", () => {
  it("counts every problem, including the ones that are not public", async () => {
    const f = await fixture();
    const progress = await progressFor(f);

    expect(progress?.problems.map((row) => row.code)).toEqual(["open1", "open2"]);
    expect(progress?.total).toBe(3);
  });

  it("marks a problem solved once they have solved it", async () => {
    const f = await fixture();
    expect((await progressFor(f))?.solved).toBe(0);

    await insertSubmission(f.t, {
      profileId: f.memberId,
      problemId: f.open1,
      languageId: f.languageId,
      status: "D",
      result: "AC",
      points: 100,
      casePoints: 1,
    });

    const progress = await progressFor(f);
    expect(progress?.solved).toBe(1);
    expect(progress?.problems.find((row) => row.code === "open1")?.solved).toBe(true);
  });
});

describe("a contest the viewer took part in", () => {
  it("looks the same, because nothing was being withheld", async () => {
    const f = await fixture();
    await insertParticipation(f.t, { contestId: f.contestId, profileId: f.memberId });

    const progress = await progressFor(f);
    expect(progress?.problems.map((row) => row.code)).toEqual(["open1", "open2"]);
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

describe("a contest that has not finished", () => {
  /** The same fixture, but running rather than over. */
  async function ongoing() {
    const f = await fixture();
    const now = Date.now();
    await f.t.run(async (ctx) =>
      ctx.db.patch(f.contestId, {
        startTime: now - 60_000,
        endTime: now + 3_600_000,
        problemListReleaseAt: "end",
      }),
    );

    return f;
  }

  it("tells an ordinary viewer nothing, because the names would come with it", async () => {
    const f = await ongoing();

    const payload = await asUser(f.t, "member").query(api.contests.list, {
      paginationOpts: { numItems: 20, cursor: null },
    });

    const row = payload.current[0] ?? payload.past.page[0];
    expect(row?.progress).toBeNull();
    // Not merely absent from the squares: nowhere in what was sent.
    expect(JSON.stringify(payload.current)).not.toContain("secret");
  });

  it("shows it to somebody running the contest", async () => {
    const f = await ongoing();
    const authorId = await insertProfile(f.t, { username: "author" });
    await f.t.run(async (ctx) => ctx.db.patch(f.contestId, { authorProfileIds: [authorId] }));

    const payload = await asUser(f.t, "author").query(api.contests.list, {
      paginationOpts: { numItems: 20, cursor: null },
    });

    expect(payload.current[0]?.progress?.total).toBe(3);
  });
});
