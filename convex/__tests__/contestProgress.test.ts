// @vitest-environment edge-runtime
/**
 * What the contest list tells you about your way through a contest.
 *
 * Every problem counts, public or not: the contest's own page already names
 * them all, so holding them back here would hide nothing and make the total a
 * lie.
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
  it("counts every problem, including the ones that are not public", async () => {
    const f = await fixture();
    const progress = await progressFor(f);

    expect(progress?.problems.map((row) => row.code)).toEqual(["open1", "open2", "secret"]);
    expect(progress?.total).toBe(3);
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
  it("looks the same, because nothing was being withheld", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => insertParticipation(ctx.db, f.contestId, f.member.profileId));

    const progress = await progressFor(f);
    expect(progress?.problems.map((row) => row.code)).toEqual(["open1", "open2", "secret"]);
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
      ctx.db.patch(f.contestId, { startTime: now - 60_000, endTime: now + 3_600_000 }),
    );
    return f;
  }

  it("tells an ordinary viewer nothing, because the names would come with it", async () => {
    const f = await ongoing();
    const payload = await f.t
      .withIdentity({ subject: f.member.userId })
      .query(api.contests.list, { paginationOpts: { numItems: 20, cursor: null } });

    const row = payload.current[0] ?? payload.past.page[0];
    expect(row?.progress).toBeNull();
    // Not merely absent from the squares: nowhere in what was sent.
    expect(JSON.stringify(payload.current)).not.toContain("secret");
  });

  it("shows it to somebody running the contest", async () => {
    const f = await ongoing();
    const author = await makeProfile(f.t, { username: "author" });
    await f.t.run(async (ctx) => ctx.db.patch(f.contestId, { authorProfileIds: [author.profileId] }));

    const payload = await f.t
      .withIdentity({ subject: author.userId })
      .query(api.contests.list, { paginationOpts: { numItems: 20, cursor: null } });
    expect(payload.current[0]?.progress?.total).toBe(3);
  });
});
