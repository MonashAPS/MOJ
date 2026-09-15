// @vitest-environment edge-runtime
/**
 * Claiming: authentication, the queue order, tiers, judge pins and the
 * reservation rule from `JudgeList` (SPEC section 6).
 */

import { describe, expect, it } from "vitest";
import { insertJudge, insertLanguage, insertProblem, insertProfile, insertSubmission } from "./test.fixtures";
import { judgeClient, setupTest } from "./test.setup";

async function fixture() {
  const t = setupTest();
  const languageId = await insertLanguage(t, { key: "PY3" });
  const cpp = await insertLanguage(t, { key: "CPP17" });
  const problemId = await insertProblem(t, {
    code: "aplusb",
    allowedLanguageIds: [languageId],
    memoryLimit: 262144,
  });
  const other = await insertProblem(t, {
    code: "other",
    allowedLanguageIds: [languageId],
    memoryLimit: 262144,
  });
  const author = await insertProfile(t);
  return { t, languageId, cpp, problemId, other, author };
}

describe("judge authentication", () => {
  it("rejects an unknown judge, a bad key and a blocked judge", async () => {
    const { t } = await fixture();
    await insertJudge(t, { name: "local", key: "secret" });
    await insertJudge(t, { name: "blocked", key: "secret", isBlocked: true });

    expect((await judgeClient(t, "nope", "x").claim()).status).toBe(403);
    expect((await judgeClient(t, "local", "wrong").claim()).status).toBe(403);
    expect((await judgeClient(t, "blocked", "secret").claim()).status).toBe(403);
    expect((await judgeClient(t, "local", "secret").claim()).status).toBe(200);
  });

  it("stores the problem list and the runtimes from the handshake", async () => {
    const { t } = await fixture();
    const judgeId = await insertJudge(t, { name: "local", problemCodes: [], runtimeKeys: [] });
    const client = judgeClient(t, "local");

    const response = await client.handshake(
      [
        ["aplusb", 1789036959.9853778],
        ["other", 1789036960],
      ],
      { PY3: [["python3", [3, 9, 10]]], CPP17: [["g++", [11]]] },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, judgeId });

    const stored = await t.run(async (ctx) => ctx.db.get(judgeId));
    expect(stored?.online).toBe(true);
    expect(stored?.problemCodes).toEqual(["aplusb", "other"]);
    expect(stored?.runtimeKeys).toEqual(["CPP17", "PY3"]);

    const runtimes = await t.run(async (ctx) =>
      ctx.db
        .query("runtimeVersions")
        .withIndex("by_judge", (q) => q.eq("judgeId", judgeId))
        .collect(),
    );
    expect(runtimes.map((row) => row.version).sort()).toEqual(["11", "3.9.10"]);
  });

  it("takes load and a new problem list on the heartbeat", async () => {
    const { t } = await fixture();
    const judgeId = await insertJudge(t, { name: "local", problemCodes: ["aplusb"] });
    const client = judgeClient(t, "local");

    const response = await client.heartbeat({ load: 0.42, problems: [["other", 12345]] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; serverTime: number };
    expect(body.ok).toBe(true);
    expect(body.serverTime).toBeGreaterThan(0);

    const stored = await t.run(async (ctx) => ctx.db.get(judgeId));
    expect(stored?.load).toBe(0.42);
    expect(stored?.problemCodes).toEqual(["other"]);
  });

  it("marks the judge offline and drops its runtimes on disconnect", async () => {
    const { t } = await fixture();
    const judgeId = await insertJudge(t, { name: "local" });
    const client = judgeClient(t, "local");
    await client.handshake();

    expect((await client.disconnect()).status).toBe(200);
    const stored = await t.run(async (ctx) => ctx.db.get(judgeId));
    expect(stored?.online).toBe(false);
  });
});

describe("claimNext", () => {
  it("takes the oldest submission of the lowest priority first", async () => {
    const { t, languageId, problemId, author } = await fixture();
    const base = Date.now();
    // Inserted out of order on purpose.
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      priority: 1,
      date: base + 1000,
      legacyId: 10,
    });
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      priority: 2,
      date: base,
      legacyId: 11,
    });
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      priority: 1,
      date: base,
      legacyId: 12,
    });
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      priority: 0,
      date: base + 5000,
      legacyId: 13,
    });

    const judgeId = await insertJudge(t, {
      name: "local",
      problemCodes: ["aplusb"],
      runtimeKeys: ["PY3"],
    });
    const client = judgeClient(t, "local");

    const order: number[] = [];
    for (let i = 0; i < 4; i++) {
      const body = (await (await client.claim()).json()) as {
        submission: { submissionId: number } | null;
      };
      if (!body.submission) break;
      order.push(body.submission.submissionId);
      // Free the judge so it can take the next one.
      await t.run(async (ctx) => ctx.db.patch(judgeId, { currentSubmissionId: undefined }));
    }
    expect(order).toEqual([13, 12, 10, 11]);
  });

  it("only claims problems and languages the judge has", async () => {
    const { t, languageId, cpp, problemId, other, author } = await fixture();
    await insertSubmission(t, {
      profileId: author,
      problemId: other,
      languageId,
      status: "QU",
      legacyId: 1,
      date: 1,
    });
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId: cpp,
      status: "QU",
      legacyId: 2,
      date: 2,
    });
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 3,
      date: 3,
    });

    await insertJudge(t, { name: "local", problemCodes: ["aplusb"], runtimeKeys: ["PY3"] });
    const body = (await (await judgeClient(t, "local").claim()).json()) as {
      submission: { submissionId: number; problemCode: string; languageKey: string } | null;
    };
    expect(body.submission?.submissionId).toBe(3);
    expect(body.submission?.problemCode).toBe("aplusb");
    expect(body.submission?.languageKey).toBe("PY3");
  });

  it("honours judgePin", async () => {
    const { t, languageId, problemId, author } = await fixture();
    const pinned = await insertJudge(t, { name: "pinned" });
    await insertJudge(t, { name: "other" });
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 7,
      judgePin: pinned,
    });

    const otherBody = (await (await judgeClient(t, "other").claim()).json()) as {
      submission: unknown;
    };
    expect(otherBody.submission).toBeNull();

    const pinnedBody = (await (await judgeClient(t, "pinned").claim()).json()) as {
      submission: { submissionId: number } | null;
    };
    expect(pinnedBody.submission?.submissionId).toBe(7);
  });

  it("only lets the minimum online tier claim", async () => {
    const { t, languageId, problemId, author } = await fixture();
    await insertJudge(t, { name: "fast", tier: 0 });
    await insertJudge(t, { name: "slow", tier: 5 });
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 4,
    });

    const body = (await (await judgeClient(t, "slow").claim()).json()) as { submission: unknown };
    expect(body.submission).toBeNull();
  });

  it("promotes the higher tier once the lower one goes offline", async () => {
    const { t, languageId, problemId, author } = await fixture();
    const fast = await insertJudge(t, { name: "fast", tier: 0 });
    await insertJudge(t, { name: "slow", tier: 5 });
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 5,
    });

    await t.run(async (ctx) => ctx.db.patch(fast, { online: false }));
    const body = (await (await judgeClient(t, "slow").claim()).json()) as {
      submission: { submissionId: number } | null;
    };
    expect(body.submission?.submissionId).toBe(5);
  });

  it("reserves the last free judge of a tier for non-rejudge work", async () => {
    const { t, languageId, problemId, author } = await fixture();
    const busy = await insertJudge(t, { name: "busy" });
    await insertJudge(t, { name: "free" });

    const held = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "G",
      legacyId: 20,
    });
    await t.run(async (ctx) => ctx.db.patch(busy, { currentSubmissionId: held }));

    // A rejudge is skipped while only one judge in the tier is free...
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      priority: 2,
      legacyId: 21,
      date: 1,
    });
    const reserved = (await (await judgeClient(t, "free").claim()).json()) as {
      submission: unknown;
    };
    expect(reserved.submission).toBeNull();

    // ...but a normal submission still goes out.
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      priority: 1,
      legacyId: 22,
      date: 2,
    });
    const dispatched = (await (await judgeClient(t, "free").claim()).json()) as {
      submission: { submissionId: number } | null;
    };
    expect(dispatched.submission?.submissionId).toBe(22);
  });

  it("claims a rejudge when it is the only judge", async () => {
    const { t, languageId, problemId, author } = await fixture();
    await insertJudge(t, { name: "only" });
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      priority: 2,
      legacyId: 30,
    });
    const body = (await (await judgeClient(t, "only").claim()).json()) as {
      submission: { submissionId: number } | null;
    };
    expect(body.submission?.submissionId).toBe(30);
  });

  it("marks the submission processing and the judge busy", async () => {
    const { t, languageId, problemId, author } = await fixture();
    const judgeId = await insertJudge(t, { name: "local" });
    const submissionId = await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 40,
      source: "print(42)",
    });

    const body = (await (await judgeClient(t, "local").claim()).json()) as {
      submission: {
        submissionId: number;
        source: string;
        timeLimit: number;
        memoryLimit: number;
        shortCircuit: boolean;
        meta: { pretestsOnly: boolean; inContest: number | null; attemptNo: number };
      } | null;
    };
    expect(body.submission?.source).toBe("print(42)");
    expect(body.submission?.timeLimit).toBe(1);
    expect(body.submission?.memoryLimit).toBe(262144);
    expect(body.submission?.shortCircuit).toBe(false);
    expect(body.submission?.meta.attemptNo).toBe(1);
    expect(body.submission?.meta.inContest).toBeNull();

    const stored = await t.run(async (ctx) => ctx.db.get(submissionId));
    expect(stored?.status).toBe("P");
    expect(stored?.claimedByJudgeId).toBe(judgeId);
    expect(stored?.judgedOnJudgeId).toBe(judgeId);

    const judge = await t.run(async (ctx) => ctx.db.get(judgeId));
    expect(judge?.currentSubmissionId).toBe(submissionId);

    // A busy judge claims nothing more.
    const again = (await (await judgeClient(t, "local").claim()).json()) as { submission: unknown };
    expect(again.submission).toBeNull();
  });

  it("resolves a per-language limit override", async () => {
    const { t, languageId, problemId, author } = await fixture();
    await t.run(async (ctx) =>
      ctx.db.insert("languageLimits", {
        problemId,
        languageId,
        timeLimit: 5,
        memoryLimit: 65536,
      }),
    );
    await insertJudge(t, { name: "local" });
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      legacyId: 50,
    });

    const body = (await (await judgeClient(t, "local").claim()).json()) as {
      submission: { timeLimit: number; memoryLimit: number } | null;
    };
    expect(body.submission?.timeLimit).toBe(5);
    expect(body.submission?.memoryLimit).toBe(65536);
  });

  it("counts the attempt number as DMOJ does", async () => {
    const { t, languageId, problemId, author } = await fixture();
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "D",
      date: 100,
      legacyId: 60,
    });
    // Compile errors and internal errors do not count.
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "CE",
      date: 200,
      legacyId: 61,
    });
    await insertSubmission(t, {
      profileId: author,
      problemId,
      languageId,
      status: "QU",
      date: 300,
      legacyId: 62,
    });

    await insertJudge(t, { name: "local" });
    const body = (await (await judgeClient(t, "local").claim()).json()) as {
      submission: { submissionId: number; meta: { attemptNo: number } } | null;
    };
    expect(body.submission?.submissionId).toBe(62);
    expect(body.submission?.meta.attemptNo).toBe(2);
  });
});
