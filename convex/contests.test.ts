// @vitest-environment edge-runtime

import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  HOUR,
  identityOf,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertMembership,
  insertOrganization,
  insertParticipation,
  insertProblem,
  insertProfile,
  insertSubmission,
} from "./test.fixtures";
import { setupTest } from "./test.setup";

describe("access matrix", () => {
  test("a visible public contest is open to anyone", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertContest(ctx, { key: "open", name: "Contest open" });
    });

    const anonymous = await t.query(api.contests.get, { key: "open" });
    expect(anonymous.access.kind).toBe("ok");
    expect(anonymous.contest?.name).toBe("Contest open");
  });

  test("an invisible contest is inaccessible, and missing keys say so", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertContest(ctx, { key: "hidden", isVisible: false });
    });

    expect((await t.query(api.contests.get, { key: "hidden" })).access.kind).toBe("inaccessible");
    expect((await t.query(api.contests.get, { key: "nope" })).access.kind).toBe("notFound");
  });

  test("an organisation-private contest names its organisations", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const organizationId = await insertOrganization(ctx, { slug: "maps", name: "MAPS" });
      await insertProfile(ctx, { username: "outsider" });
      const memberId = await insertProfile(ctx, { username: "member" });
      await insertMembership(ctx, { organizationId, profileId: memberId });
      await insertContest(ctx, {
        key: "orgonly",
        entry: {
          kind: "restricted",
          match: "all",
          organizationIds: [organizationId],
          classIds: [],
          profileIds: [],
        },
      });
    });

    const outsider = await t.withIdentity(identityOf("outsider")).query(api.contests.get, { key: "orgonly" });
    expect(outsider.access.kind).toBe("privateContest");

    if (outsider.access.kind === "privateContest") {
      expect(outsider.access.organizations.map((row) => row.name)).toEqual(["MAPS"]);
    }

    const member = await t.withIdentity(identityOf("member")).query(api.contests.get, { key: "orgonly" });
    expect(member.access.kind).toBe("ok");
  });

  test("editors see a hidden contest and get the edit flags", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const authorId = await insertProfile(ctx, {
        username: "author",
        permissions: ["judge.edit_own_contest"],
      });

      await insertContest(ctx, { key: "draft", isVisible: false, authorProfileIds: [authorId] });
    });

    const detail = await t.withIdentity(identityOf("author")).query(api.contests.get, { key: "draft" });
    expect(detail.access.kind).toBe("ok");
    expect(detail.viewer.canEdit).toBe(true);
    expect(detail.viewer.isEditor).toBe(true);
  });

  test("the list only shows contests the viewer may see", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "nobody" });
      await insertContest(ctx, { key: "shown" });
      await insertContest(ctx, { key: "unshown", isVisible: false });
      await insertContest(ctx, {
        key: "old",
        startTime: Date.now() - 5 * HOUR,
        endTime: Date.now() - 4 * HOUR,
      });
    });

    const payload = await t.query(api.contests.list, {});
    expect(payload.current.map((row) => row.key)).toEqual(["shown"]);
    expect(payload.past.page.map((row) => row.key)).toEqual(["old"]);
    expect(payload.totalPast).toBe(1);
  });
});

describe("joining and leaving", () => {
  test("joining a running contest starts a live participation and counts the user", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "ada" });
      await insertContest(ctx, { key: "live" });
    });

    const asAda = t.withIdentity(identityOf("ada"));
    const joined = await asAda.mutation(api.contests.participation.join, { key: "live" });
    expect(joined.virtual).toBe(0);

    const viewer = await asAda.query(api.viewer.current, {});
    expect(viewer.inContest).toBe(true);
    expect(viewer.participation?._id).toBe(joined.participationId);
    expect(viewer.contest?.key).toBe("live");

    await t.run(async (ctx) => {
      const contest = await ctx.db
        .query("contests")
        .withIndex("by_key", (q) => q.eq("key", "live"))
        .unique();

      expect(contest?.userCount).toBe(1);
    });

    await asAda.mutation(api.contests.participation.leave, { key: "live" });
    expect((await asAda.query(api.viewer.current, {})).inContest).toBe(false);
  });

  test("joining again after the contest ends creates numbered virtual participations", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "ada" });
      await insertContest(ctx, {
        key: "past",
        startTime: Date.now() - 5 * HOUR,
        endTime: Date.now() - 4 * HOUR,
      });
    });

    const asAda = t.withIdentity(identityOf("ada"));
    expect((await asAda.mutation(api.contests.participation.join, { key: "past" })).virtual).toBe(1);
    expect((await asAda.mutation(api.contests.participation.join, { key: "past" })).virtual).toBe(2);
    expect((await asAda.mutation(api.contests.participation.join, { key: "past" })).virtual).toBe(3);

    const rows = await asAda.query(api.contests.participation.participations, { key: "past" });
    expect(rows?.map((row) => row.virtual)).toEqual([3, 2, 1]);
  });

  test("banned users cannot join, and an access code is demanded once", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const bannedId = await insertProfile(ctx, { username: "banned" });
      await insertProfile(ctx, { username: "coder" });
      await insertContest(ctx, {
        key: "gated",
        accessCode: "opensesame",
        bannedProfileIds: [bannedId],
      });
    });

    await expect(
      t.withIdentity(identityOf("banned")).mutation(api.contests.participation.join, { key: "gated" }),
    ).rejects.toThrow(/persona non grata/);

    const asCoder = t.withIdentity(identityOf("coder"));
    await expect(asCoder.mutation(api.contests.participation.join, { key: "gated" })).rejects.toThrow(
      /access code/i,
    );

    const joined = await asCoder.mutation(api.contests.participation.join, {
      key: "gated",
      accessCode: "opensesame",
    });

    expect(joined.virtual).toBe(0);
    // The code is only asked for when a participation would be created.
    expect((await asCoder.mutation(api.contests.participation.join, { key: "gated" })).participationId).toBe(
      joined.participationId,
    );
  });

  test("a spectator joins as a spectator, not as a contestant", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const authorId = await insertProfile(ctx, { username: "author" });
      await insertContest(ctx, { key: "spec", authorProfileIds: [authorId] });
    });

    const joined = await t
      .withIdentity(identityOf("author"))
      .mutation(api.contests.participation.join, { key: "spec" });

    expect(joined.virtual).toBe(-1);
  });

  test("contest mode is dropped once the window closes", async () => {
    const t = setupTest();
    let participationId: Id<"contestParticipations"> | null = null;
    await t.run(async (ctx) => {
      const profileId = await insertProfile(ctx, { username: "ada" });

      const contestId = await insertContest(ctx, {
        key: "over",
        startTime: Date.now() - 5 * HOUR,
        endTime: Date.now() - 4 * HOUR,
      });

      participationId = await insertParticipation(ctx, {
        contestId,
        profileId,
        realStart: Date.now() - 5 * HOUR,
      });
      await ctx.db.patch(profileId, { currentParticipationId: participationId });
    });

    const asAda = t.withIdentity(identityOf("ada"));
    const state = await asAda.query(api.viewer.current, {});
    expect(state.inContest).toBe(false);
    expect(state.contestModeStale).toBe(true);
    expect(state.participation?._id).toBe(participationId);

    expect(await asAda.mutation(api.contests.participation.clearStaleContest, {})).toEqual({ cleared: true });
    expect((await asAda.query(api.viewer.current, {})).participation).toBeNull();
  });
});

describe("contest problem states", () => {
  test("a past contest separates solved during from solved since", async () => {
    const t = setupTest();
    const now = Date.now();
    await t.run(async (ctx) => {
      const languageId = await insertLanguage(ctx);
      const profileId = await insertProfile(ctx, { username: "ada" });
      const during = await insertProblem(ctx, { code: "aplus", userCount: 12 });
      const since = await insertProblem(ctx, { code: "later", userCount: 3 });
      const partial = await insertProblem(ctx, { code: "half", partial: true });
      const untouched = await insertProblem(ctx, { code: "none" });

      const contestId = await insertContest(ctx, {
        key: "past",
        startTime: now - 5 * HOUR,
        endTime: now - 4 * HOUR,
        problemListReleaseAt: "end",
      });

      const cpDuring = await insertContestProblem(ctx, {
        contestId,
        problemId: during,
        order: 0,
        points: 1,
      });

      const cpSince = await insertContestProblem(ctx, { contestId, problemId: since, order: 1, points: 1 });

      const cpPartial = await insertContestProblem(ctx, {
        contestId,
        problemId: partial,
        order: 2,
        points: 1,
      });

      await insertContestProblem(ctx, { contestId, problemId: untouched, order: 3, points: 1 });

      const participationId = await insertParticipation(ctx, {
        contestId,
        profileId,
        realStart: now - 5 * HOUR,
      });

      await insertSubmission(ctx, {
        profileId,
        problemId: during,
        languageId,
        contestId,
        contestProblemId: cpDuring,
        participationId,
        date: now - 4.5 * HOUR,
        result: "AC",
        points: 100,
        casePoints: 1,
        contestPoints: 1,
      });
      await insertSubmission(ctx, {
        profileId,
        problemId: since,
        languageId,
        contestId,
        contestProblemId: cpSince,
        participationId,
        date: now - 4.4 * HOUR,
        result: "WA",
        points: 0,
        contestPoints: 0,
      });
      // Cleaned up after the contest, outside it.
      await insertSubmission(ctx, {
        profileId,
        problemId: since,
        languageId,
        date: now - HOUR,
        result: "AC",
        points: 100,
        casePoints: 1,
      });
      await insertSubmission(ctx, {
        profileId,
        problemId: partial,
        languageId,
        contestId,
        contestProblemId: cpPartial,
        participationId,
        date: now - 4.2 * HOUR,
        result: "WA",
        points: 40,
        casePoints: 4,
        caseTotal: 10,
        contestPoints: 0,
      });
    });

    const detail = await t.withIdentity(identityOf("ada")).query(api.contests.get, { key: "past" });
    const states = Object.fromEntries(detail.problems.map((problem) => [problem.code, problem]));

    expect(states.aplus?.state).toBe("solved");
    expect(states.aplus?.solvedDuringContest).toBe(true);
    expect(states.aplus?.solvedSinceContest).toBe(false);
    expect(states.aplus?.publicSolveCount).toBe(12);

    expect(states.later?.state).toBe("solved");
    expect(states.later?.solvedDuringContest).toBe(false);
    expect(states.later?.solvedSinceContest).toBe(true);

    expect(states.half?.state).toBe("partial");
    expect(states.half?.bestScore).toBe(40);

    expect(states.none?.state).toBe("untouched");
    expect(detail.problems.map((problem) => problem.label)).toEqual(["A", "B", "C", "D"]);
  });

  test("the contest bar carries the same states and the countdown", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const languageId = await insertLanguage(ctx);
      const profileId = await insertProfile(ctx, { username: "ada" });
      const problemId = await insertProblem(ctx, { code: "aplus" });
      const contestId = await insertContest(ctx, { key: "live" });

      const contestProblemId = await insertContestProblem(ctx, {
        contestId,
        problemId,
        order: 0,
        points: 1,
      });

      const participationId = await insertParticipation(ctx, { contestId, profileId });
      await ctx.db.patch(profileId, { currentParticipationId: participationId });
      await insertSubmission(ctx, {
        profileId,
        problemId,
        languageId,
        contestId,
        contestProblemId,
        participationId,
        date: Date.now() - 60_000,
        result: "AC",
        points: 100,
        casePoints: 1,
        contestPoints: 1,
      });
    });

    const bar = await t.withIdentity(identityOf("ada")).query(api.contests.navBar, {});
    expect(bar?.contest.key).toBe("live");
    expect(bar?.problems[0]?.label).toBe("A");
    expect(bar?.problems[0]?.state).toBe("solved");
    expect(bar?.isVirtual).toBe(false);
    expect((bar?.timeRemaining ?? 0) > 0).toBe(true);
    expect(bar?.links.clarifications).toBe(true);
  });
});

describe("clarifications and statistics", () => {
  test("editors post clarifications; contestants read them", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const authorId = await insertProfile(ctx, {
        username: "author",
        permissions: ["judge.edit_own_contest"],
      });

      await insertProfile(ctx, { username: "ada" });
      const problemId = await insertProblem(ctx, { code: "aplus" });
      const contestId = await insertContest(ctx, { key: "live", authorProfileIds: [authorId] });
      await insertContestProblem(ctx, { contestId, problemId, order: 0, points: 1 });
    });

    await expect(
      t.withIdentity(identityOf("ada")).mutation(api.contests.clarifications.add, {
        key: "live",
        problemCode: "aplus",
        description: "N is at most 10^5.",
      }),
    ).rejects.toThrow();

    await t.withIdentity(identityOf("author")).mutation(api.contests.clarifications.add, {
      key: "live",
      problemCode: "aplus",
      description: "N is at most 10^5.",
    });

    const rows = await t.withIdentity(identityOf("ada")).query(api.contests.clarifications.list, {
      key: "live",
    });

    expect(rows?.length).toBe(1);
    expect(rows?.[0]?.label).toBe("A");
    expect(rows?.[0]?.description).toBe("N is at most 10^5.");
  });

  test("statistics stay hidden until the contest ends", async () => {
    const t = setupTest();
    const now = Date.now();
    await t.run(async (ctx) => {
      const languageId = await insertLanguage(ctx, { name: "Python 3" });
      const profileId = await insertProfile(ctx, { username: "ada" });
      const problemId = await insertProblem(ctx, { code: "aplus" });
      const runningId = await insertContest(ctx, { key: "live" });
      await insertContestProblem(ctx, { contestId: runningId, problemId, order: 0, points: 1 });

      const contestId = await insertContest(ctx, {
        key: "past",
        problemListReleaseAt: "end",
        startTime: now - 5 * HOUR,
        endTime: now - 4 * HOUR,
      });

      const contestProblemId = await insertContestProblem(ctx, {
        contestId,
        problemId,
        order: 0,
        points: 1,
      });

      const participationId = await insertParticipation(ctx, {
        contestId,
        profileId,
        realStart: now - 5 * HOUR,
      });

      await insertSubmission(ctx, {
        profileId,
        problemId,
        languageId,
        contestId,
        contestProblemId,
        participationId,
        date: now - 4.5 * HOUR,
        result: "AC",
        points: 100,
        casePoints: 1,
        contestPoints: 1,
      });
      await insertSubmission(ctx, {
        profileId,
        problemId,
        languageId,
        contestId,
        contestProblemId,
        participationId,
        date: now - 4.6 * HOUR,
        result: "WA",
        points: 0,
        contestPoints: 0,
      });
    });

    expect(await t.query(api.contests.stats, { key: "live" })).toBeNull();

    const stats = await t.query(api.contests.stats, { key: "past" });
    expect(stats?.totalSubmissions).toBe(2);
    expect(stats?.problems[0]?.acRate).toBe(50);
    expect(stats?.languageCount).toEqual([{ name: "Python 3", count: 2 }]);

    const results = Object.fromEntries(
      (stats?.problemStatusCount ?? []).map((row) => [row.code, row.counts]),
    );

    expect(results.AC).toEqual([1]);
    expect(results.WA).toEqual([1]);
  });
});

describe("cloning", () => {
  test("a clone is hidden, empty of entrants and owned by the cloner", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "cloner", permissions: ["judge.clone_contest"] });
      const problemId = await insertProblem(ctx, { code: "aplus" });
      const contestId = await insertContest(ctx, { key: "original", userCount: 9 });
      await insertContestProblem(ctx, { contestId, problemId, order: 0, points: 7 });
    });

    const asCloner = t.withIdentity(identityOf("cloner"));

    const cloned = await asCloner.mutation(api.contests.tools.clone, {
      key: "original",
      newKey: "copy",
    });

    expect(cloned.key).toBe("copy");

    await t.run(async (ctx) => {
      const contest = await ctx.db.get(cloned.contestId);
      expect(contest?.isVisible).toBe(false);
      expect(contest?.userCount).toBe(0);

      const problems = await ctx.db
        .query("contestProblems")
        .withIndex("by_contest_order", (q) => q.eq("contestId", cloned.contestId))
        .collect();

      expect(problems.length).toBe(1);
      expect(problems[0]?.points).toBe(7);

      const revisions = await ctx.db.query("revisions").collect();
      expect(revisions[0]?.reason).toBe("Cloned contest from original");
    });

    await expect(
      asCloner.mutation(api.contests.tools.clone, { key: "original", newKey: "copy" }),
    ).rejects.toThrow(/already taken/);
  });

  test("cloning needs the permission", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "nobody" });
      await insertContest(ctx, { key: "original" });
    });
    await expect(
      t.withIdentity(identityOf("nobody")).mutation(api.contests.tools.clone, {
        key: "original",
        newKey: "copy",
      }),
    ).rejects.toThrow(/judge.clone_contest/);
  });
});

describe("moss", () => {
  test("without a key configured the page says MOSS is not configured", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const authorId = await insertProfile(ctx, {
        username: "author",
        permissions: ["judge.edit_own_contest", "judge.moss_contest"],
      });

      await insertContest(ctx, { key: "live", authorProfileIds: [authorId] });
    });

    const payload = await t
      .withIdentity(identityOf("author"))
      .query(api.contests.tools.moss, { key: "live" });

    expect(payload).toEqual({ configured: false, message: "MOSS is not configured.", results: [] });
  });
});
