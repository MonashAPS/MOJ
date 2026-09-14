// @vitest-environment edge-runtime
/**
 * Screen-share proctoring as account state.
 *
 * The cases that matter are the transitions: a session that lapses has to close
 * the questions again, and a second tab must not leave two sessions both
 * claiming to be watching.
 */

import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { PROCTOR_LIVE_WINDOW_MS } from "../lib/proctor";
import { insertContest, insertContestProblem, insertParticipation } from "./contests.fixtures";
import { makeLanguage, makeProblem, makeProfile, setupTest, type T } from "./fixtures.helpers";

async function fixture(options: { proctorRequired?: boolean } = {}) {
  const t: T = setupTest();
  const languageId = await makeLanguage(t, "PY3");
  const publicId = await makeProblem(t, { code: "aplusb", allowedLanguageIds: [languageId] });
  const hiddenId = await makeProblem(t, {
    code: "hidden",
    isPublic: false,
    allowedLanguageIds: [languageId],
  });
  const member = await makeProfile(t);

  const contestId = await t.run(async (ctx) =>
    insertContest(ctx.db, "mcpc", { proctorRequired: options.proctorRequired ?? true }),
  );
  await t.run(async (ctx) => insertContestProblem(ctx.db, contestId, publicId, 1));
  await t.run(async (ctx) => insertContestProblem(ctx.db, contestId, hiddenId, 2));

  const participationId = await t.run(async (ctx) =>
    insertParticipation(ctx.db, contestId, member.profileId),
  );
  await t.run(async (ctx) => ctx.db.patch(member.profileId, { currentParticipationId: participationId }));

  return { t, contestId, member };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function as(f: Fixture) {
  return f.t.withIdentity({ subject: f.member.userId });
}

function share(f: Fixture, displaySurface = "monitor") {
  return as(f).mutation(api.proctor.start, { displaySurface, userAgent: "Chrome/test" });
}

function read(f: Fixture, code: string) {
  return as(f).query(api.problems.get, { code });
}

describe("starting a session", () => {
  it("refuses anything but a whole screen", async () => {
    const f = await fixture();
    await expect(share(f, "browser")).rejects.toThrow(/entire screen/i);
    await expect(share(f, "window")).rejects.toThrow(/entire screen/i);
  });

  it("accepts a monitor", async () => {
    const f = await fixture();
    const { sessionId } = await share(f);
    expect(sessionId).toBeTruthy();
    expect(await as(f).query(api.proctor.state, {})).toMatchObject({ active: true });
  });

  it("retires the previous session, so two tabs cannot both claim to be watching", async () => {
    const f = await fixture();
    const first = await share(f);
    const second = await share(f);
    expect(second.sessionId).not.toBe(first.sessionId);

    // The older one is closed and its heartbeat no longer counts.
    expect(await as(f).mutation(api.proctor.heartbeat, { sessionId: first.sessionId })).toEqual({
      ok: false,
    });
    expect(await as(f).mutation(api.proctor.heartbeat, { sessionId: second.sessionId })).toEqual({
      ok: true,
    });
  });
});

describe("what a session opens", () => {
  it("keeps a contest-only problem shut until someone is sharing", async () => {
    const f = await fixture();
    expect(await read(f, "hidden")).toBeNull();
    await share(f);
    expect(await read(f, "hidden")).not.toBeNull();
  });

  it("leaves a public problem public either way", async () => {
    const f = await fixture();
    expect(await read(f, "aplusb")).not.toBeNull();
  });

  it("shuts again when the heartbeat stops", async () => {
    const f = await fixture();
    const { sessionId } = await share(f);
    expect(await read(f, "hidden")).not.toBeNull();

    await f.t.run(async (ctx) =>
      ctx.db.patch(sessionId, { lastSeenAt: Date.now() - PROCTOR_LIVE_WINDOW_MS - 1 }),
    );
    expect(await read(f, "hidden")).toBeNull();
  });

  it("shuts when the session is stopped outright", async () => {
    const f = await fixture();
    const { sessionId } = await share(f);
    await as(f).mutation(api.proctor.stop, { sessionId, reason: "closed the tab" });
    expect(await read(f, "hidden")).toBeNull();
  });

  it("does nothing at all to a contest that does not ask for proctoring", async () => {
    const f = await fixture({ proctorRequired: false });
    expect(await read(f, "hidden")).not.toBeNull();
  });
});

describe("submitting", () => {
  function submit(f: Fixture) {
    return as(f).mutation(api.submissions.submit, {
      problemCode: "aplusb",
      languageKey: "PY3",
      source: "print(1)",
    });
  }

  it("is refused while nobody is watching", async () => {
    const f = await fixture();
    await expect(submit(f)).rejects.toThrow(/proctored/i);
  });

  it("goes through once they are", async () => {
    const f = await fixture();
    await share(f);
    await expect(submit(f)).resolves.toMatchObject({ id: 1 });
  });
});

describe("the staff view", () => {
  it("is refused to someone who is not staff", async () => {
    const f = await fixture();
    await expect(as(f).query(api.proctor.sessions, {})).rejects.toThrow();
  });

  it("shows a live session, and stops calling it live once it lapses", async () => {
    const f = await fixture();
    const { sessionId } = await share(f);
    const staff = await makeProfile(f.t, { username: "staff", isStaff: true });
    const asStaff = f.t.withIdentity({ subject: staff.userId });

    let rows = await asStaff.query(api.proctor.sessions, {});
    expect(rows[0]).toMatchObject({ username: f.member.username, live: true, contestKey: "mcpc" });

    await f.t.run(async (ctx) =>
      ctx.db.patch(sessionId as Id<"proctorSessions">, {
        lastSeenAt: Date.now() - PROCTOR_LIVE_WINDOW_MS - 1,
      }),
    );
    rows = await asStaff.query(api.proctor.sessions, {});
    expect(rows[0]?.live).toBe(false);
  });
});
