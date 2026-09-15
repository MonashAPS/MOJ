// @vitest-environment edge-runtime
/**
 * Screen-share proctoring as account state.
 *
 * The cases that matter are the transitions: a session that lapses has to close
 * the questions again, and a second tab must not leave two sessions both
 * claiming to be watching.
 */

import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { PROCTOR_LIVE_WINDOW_MS } from "./lib/proctor";
import {
  asUser,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertParticipation,
  insertProblem,
  insertProfile,
  siteSettingsRow,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

const MEMBER = "member";

async function fixture(options: { proctorRequired?: boolean } = {}) {
  const t: T = setupTest();
  const languageId = await insertLanguage(t, { key: "PY3" });
  const publicId = await insertProblem(t, { code: "aplusb", allowedLanguageIds: [languageId] });

  const hiddenId = await insertProblem(t, {
    code: "hidden",
    isPublic: false,
    allowedLanguageIds: [languageId],
  });

  const memberId = await insertProfile(t, { username: MEMBER });

  const contestId = await insertContest(t, {
    key: "mcpc",
    proctorRequired: options.proctorRequired ?? true,
  });

  await insertContestProblem(t, { contestId, problemId: publicId, order: 1, points: 1 });
  await insertContestProblem(t, { contestId, problemId: hiddenId, order: 2, points: 1 });

  const participationId = await insertParticipation(t, { contestId, profileId: memberId });
  await t.run(async (ctx) => ctx.db.patch(memberId, { currentParticipationId: participationId }));

  return { t, contestId, memberId };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function as(f: Fixture) {
  return asUser(f.t, MEMBER);
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
  it("shows nothing to someone who is not staff, rather than throwing", async () => {
    // A reactive query that throws takes the page down, and the viewer is
    // briefly absent on every token refresh, so this has to answer emptily.
    const f = await fixture();
    expect(await as(f).query(api.proctor.sessions, {})).toEqual([]);
    expect(await f.t.query(api.proctor.sessions, {})).toEqual([]);
    expect(await f.t.query(api.proctor.timeline, {})).toMatchObject({ rows: [], contests: [] });
  });

  it("shows a live session, and stops calling it live once it lapses", async () => {
    const f = await fixture();
    const { sessionId } = await share(f);
    await insertProfile(f.t, { username: "staff", isStaff: true });
    const asStaff = asUser(f.t, "staff");

    let rows = await asStaff.query(api.proctor.sessions, {});
    expect(rows[0]).toMatchObject({ username: MEMBER, live: true, contestKey: "mcpc" });

    await f.t.run(async (ctx) =>
      ctx.db.patch(sessionId, {
        lastSeenAt: Date.now() - PROCTOR_LIVE_WINDOW_MS - 1,
      }),
    );
    rows = await asStaff.query(api.proctor.sessions, {});
    expect(rows[0]?.live).toBe(false);
  });
});

describe("retention", () => {
  it("drops recordings past the cutoff and keeps the session", async () => {
    const f = await fixture();
    const { sessionId } = await share(f);

    const old = Date.now() - 40 * 24 * 60 * 60 * 1000;

    const storageIds = await f.t.run(async (ctx) => {
      const ids = [];

      for (const [index, startedAt] of [
        [0, old],
        [1, Date.now()],
      ] as const) {
        const storageId = await ctx.storage.store(new Blob(["x"], { type: "video/webm" }));
        ids.push(storageId);
        await ctx.db.insert("proctorChunks", {
          sessionId,
          profileId: f.memberId,
          index,
          startedAt,
          durationMs: 5000,
          bytes: 1,
          mimeType: "video/webm",
          storageId,
        });
      }

      return ids;
    });

    await f.t.mutation(internal.jobs.proctor.sweepRecordings, {});

    const left = await f.t.run(async (ctx) => ctx.db.query("proctorChunks").collect());
    expect(left).toHaveLength(1);
    expect(left[0]?.index).toBe(1);
    // The session itself survives: who shared and when stays on the record.
    expect(await f.t.run(async (ctx) => ctx.db.get(sessionId))).not.toBeNull();
    // And the blob is actually gone, not merely unreferenced.
    const removed = storageIds[0];

    if (!removed) throw new Error("no blob was stored");
    expect(await f.t.run(async (ctx) => ctx.storage.getUrl(removed))).toBeNull();
  });

  it("keeps everything when retention is switched off", async () => {
    const f = await fixture();
    const { sessionId } = await share(f);
    await f.t.run(async (ctx) => {
      await ctx.db.insert("siteSettings", siteSettingsRow({ proctorRetentionDays: 0 }));
      await ctx.db.insert("proctorChunks", {
        sessionId,
        profileId: f.memberId,
        index: 0,
        startedAt: Date.now() - 400 * 24 * 60 * 60 * 1000,
        durationMs: 5000,
        bytes: 1,
        mimeType: "video/webm",
        storageId: await ctx.storage.store(new Blob(["x"], { type: "video/webm" })),
      });
    });

    await f.t.mutation(internal.jobs.proctor.sweepRecordings, {});
    expect(await f.t.run(async (ctx) => ctx.db.query("proctorChunks").collect())).toHaveLength(1);
  });
});
