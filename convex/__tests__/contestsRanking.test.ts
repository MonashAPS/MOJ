// @vitest-environment edge-runtime

import { blindDuringFreeze } from "@moj/core";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import {
  HOUR,
  identityOf,
  insertContest,
  insertContestProblem,
  insertGroup,
  insertLanguage,
  insertOrganization,
  insertParticipation,
  insertProblem,
  insertProfile,
  insertSubmission,
  joinOrganization,
  MINUTE,
} from "./contests.fixtures";

const modules = import.meta.glob("../**/*.ts");

function harness() {
  return convexTest(schema, modules);
}

/**
 * A finished ICPC contest with a one-hour freeze: `ada` solved before the
 * freeze, `bob` after it, so exactly one cell is withheld.
 */
async function frozenContest(t: ReturnType<typeof harness>, extra: Record<string, unknown> = {}) {
  const now = Date.now();
  const start = now - 3 * HOUR;
  const end = now - HOUR;
  return await t.run(async (ctx) => {
    const groupId = await insertGroup(ctx.db);
    const languageId = await insertLanguage(ctx.db);
    const editorId = await insertProfile(ctx.db, "editor", {
      permissions: ["judge.edit_own_contest"],
    });
    const adaId = await insertProfile(ctx.db, "ada");
    const bobId = await insertProfile(ctx.db, "bob");
    await insertProfile(ctx.db, "watcher");

    const problemId = await insertProblem(ctx.db, "aplus", groupId);
    const contestId = await insertContest(ctx.db, "icpc", {
      startTime: start,
      endTime: end,
      formatName: "icpc",
      formatConfig: { penalty: 20 },
      freezeMinutes: 60,
      authorProfileIds: [editorId],
      ...extra,
    });
    const contestProblemId = await insertContestProblem(ctx.db, contestId, problemId, 0);

    const adaParticipation = await insertParticipation(ctx.db, contestId, adaId, {
      realStart: start,
    });
    const bobParticipation = await insertParticipation(ctx.db, contestId, bobId, {
      realStart: start,
    });

    // Ada: one wrong answer, then an accept 30 minutes in (before the freeze).
    await insertSubmission(ctx.db, {
      profileId: adaId,
      problemId,
      languageId,
      contestId,
      contestProblemId,
      participationId: adaParticipation,
      date: start + 20 * MINUTE,
      result: "WA",
      points: 0,
      contestPoints: 0,
    });
    await insertSubmission(ctx.db, {
      profileId: adaId,
      problemId,
      languageId,
      contestId,
      contestProblemId,
      participationId: adaParticipation,
      date: start + 30 * MINUTE,
      result: "AC",
    });
    // Bob: an accept 90 minutes in, which is inside the freeze.
    await insertSubmission(ctx.db, {
      profileId: bobId,
      problemId,
      languageId,
      contestId,
      contestProblemId,
      participationId: bobParticipation,
      date: start + 90 * MINUTE,
      result: "AC",
    });

    return {
      contestId,
      contestProblemId,
      problemId,
      languageId,
      adaId,
      bobId,
      editorId,
      adaParticipation,
      bobParticipation,
      start,
      end,
    };
  });
}

describe("ranking with a freeze", () => {
  test("a frozen cell is withheld from the public and shown to the editor", async () => {
    const t = harness();
    await frozenContest(t);

    const publicView = await t
      .withIdentity(identityOf("watcher"))
      .query(api.contestRankings.ranking, { key: "icpc" });
    expect(publicView?.isFrozen).toBe(true);
    expect(publicView?.canSeeFullScoreboard).toBe(true);
    const publicRows = Object.fromEntries((publicView?.rows ?? []).map((row) => [row.user.username, row]));
    expect(publicRows.ada?.points).toBe(1);
    expect(publicRows.ada?.rank).toBe(1);
    // 30 minutes to solve plus one 20 minute penalty.
    expect(publicRows.ada?.cumtime).toBe(30 * 60 + 20 * 60);
    expect(publicRows.bob?.points).toBe(0);
    expect(publicRows.bob?.rank).toBe(2);
    expect(publicRows.bob?.frozen).toBe(true);

    const editorView = await t
      .withIdentity(identityOf("editor"))
      .query(api.contestRankings.ranking, { key: "icpc" });
    expect(editorView?.isFrozen).toBe(false);
    const editorRows = Object.fromEntries((editorView?.rows ?? []).map((row) => [row.user.username, row]));
    expect(editorRows.bob?.points).toBe(1);
    expect(editorRows.bob?.frozen).toBe(false);
    // Both solved once; Ada's 50 penalty minutes still beat Bob's 90.
    expect(editorRows.ada?.rank).toBe(1);
    expect(editorRows.bob?.rank).toBe(2);
    expect(editorRows.bob?.cumtime).toBe(90 * 60);
  });

  test("a contestant does not see through the freeze either", async () => {
    const t = harness();
    await frozenContest(t, { blindDuringFreeze: true });

    const own = await t.withIdentity(identityOf("bob")).query(api.contestRankings.ranking, { key: "icpc" });
    const bob = (own?.rows ?? []).find((row) => row.user.username === "bob");
    expect(bob?.points).toBe(0);
    expect(bob?.frozen).toBe(true);

    // The submission-row masking `blindDuringFreeze` drives lives in
    // `@moj/core`; this is the contract the submissions module reads.
    const contest = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("contests")
        .withIndex("by_key", (q) => q.eq("key", "icpc"))
        .unique();
      return row;
    });
    const masked = blindDuringFreeze(
      { profileId: "p1", date: (contest?.endTime ?? 0) - 30 * MINUTE, result: "AC" },
      {
        id: contest?._id ?? "c",
        key: "icpc",
        startTime: contest?.startTime ?? 0,
        endTime: contest?.endTime ?? 0,
        isVisible: true,
        isPrivate: false,
        isOrganizationPrivate: false,
        scoreboardVisibility: "V",
        freezeMinutes: 60,
        blindDuringFreeze: true,
      },
      null,
      { now: (contest?.endTime ?? 0) - MINUTE, viewerProfileId: "p1" },
    );
    expect((masked as { masked?: boolean }).masked).toBe(true);
  });

  test("unfreezing shows the withheld cell to everyone", async () => {
    const t = harness();
    await frozenContest(t);

    await t
      .withIdentity(identityOf("editor"))
      .mutation(api.scoreboard.unfreezeContest, { key: "icpc", revealed: true });

    const publicView = await t
      .withIdentity(identityOf("watcher"))
      .query(api.contestRankings.ranking, { key: "icpc" });
    expect(publicView?.isFrozen).toBe(false);
    expect(publicView?.isRevealed).toBe(true);
    const rows = Object.fromEntries((publicView?.rows ?? []).map((row) => [row.user.username, row]));
    expect(rows.bob?.points).toBe(1);
    expect(rows.bob?.rank).toBe(2);
    expect(rows.bob?.frozen).toBe(false);
  });

  test("a hidden scoreboard shows the viewer their own row and nothing else", async () => {
    const t = harness();
    const fixture = await frozenContest(t, {
      scoreboardVisibility: "C",
      endTime: Date.now() + HOUR,
    });
    // DMOJ only shows the own row to someone who is in the contest.
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.adaId, { currentParticipationId: fixture.adaParticipation });
    });

    const own = await t.withIdentity(identityOf("ada")).query(api.contestRankings.ranking, { key: "icpc" });
    expect(own?.canSeeFullScoreboard).toBe(false);
    expect(own?.rows.length).toBe(1);
    expect(own?.rows[0]?.user.username).toBe("ada");
    expect(own?.rows[0]?.rankLabel).toBe("???");

    const outsider = await t
      .withIdentity(identityOf("watcher"))
      .query(api.contestRankings.ranking, { key: "icpc" });
    expect(outsider).toBeNull();
  });

  test("best solutions for a contest problem come back highest first", async () => {
    const t = harness();
    await frozenContest(t);
    const payload = await t
      .withIdentity(identityOf("editor"))
      .query(api.contestRankings.rankByProblem, { key: "icpc", problemCode: "aplus" });
    expect(payload?.label).toBe("A");
    expect(payload?.rows.map((row) => row.user.username)).toEqual(["ada", "bob"]);
  });
});

describe("recomputing", () => {
  test("recomputeParticipation rewrites the score from the submissions", async () => {
    const t = harness();
    const fixture = await frozenContest(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.adaParticipation, { score: 999, cumtime: 1, tiebreaker: 1 });
    });

    await t.mutation(internal.contestRankings.recomputeParticipation, {
      participationId: fixture.adaParticipation,
    });

    await t.run(async (ctx) => {
      const row = await ctx.db.get(fixture.adaParticipation);
      expect(row?.score).toBe(1);
      expect(row?.cumtime).toBe(30 * 60 + 20 * 60);
    });
  });

  test("rescoreContest walks every participation as a job", async () => {
    const t = harness();
    const fixture = await frozenContest(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.adaParticipation, { score: 0 });
      await ctx.db.patch(fixture.bobParticipation, { score: 0 });
    });

    const job = await t
      .withIdentity(identityOf("editor"))
      .mutation(api.contestRankings.rescoreContest, { key: "icpc" });
    expect(job.total).toBe(2);
    await t.finishAllScheduledFunctions(() => {});

    await t.run(async (ctx) => {
      expect((await ctx.db.get(fixture.adaParticipation))?.score).toBe(1);
      expect((await ctx.db.get(fixture.bobParticipation))?.score).toBe(1);
      const row = await ctx.db.get(job.jobId);
      expect(row?.status).toBe("done");
      expect(row?.progress.done).toBe(2);
    });
  });

  test("a disqualified participation drops to the sentinel score", async () => {
    const t = harness();
    const fixture = await frozenContest(t);

    await t.withIdentity(identityOf("editor")).mutation(api.contests.disqualify, {
      key: "icpc",
      participationId: fixture.adaParticipation,
      disqualified: true,
    });

    await t.run(async (ctx) => {
      const row = await ctx.db.get(fixture.adaParticipation);
      expect(row?.isDisqualified).toBe(true);
      expect(row?.score).toBe(-9999);
      const contest = await ctx.db.get(fixture.contestId);
      expect(contest?.bannedProfileIds).toContain(fixture.adaId);
    });

    const view = await t
      .withIdentity(identityOf("editor"))
      .query(api.contestRankings.ranking, { key: "icpc" });
    expect(view?.rows.at(-1)?.user.username).toBe("ada");
  });
});

describe("ratings", () => {
  test("rating a contest re-rates every later rated contest", async () => {
    const t = harness();
    const now = Date.now();
    const fixture = await t.run(async (ctx) => {
      const groupId = await insertGroup(ctx.db);
      const languageId = await insertLanguage(ctx.db);
      const adaId = await insertProfile(ctx.db, "ada");
      const bobId = await insertProfile(ctx.db, "bob");
      await insertProfile(ctx.db, "rater", {
        permissions: ["judge.contest_rating"],
        isStaff: true,
      });
      const problemId = await insertProblem(ctx.db, "aplus", groupId);

      const build = async (key: string, endsAgo: number, adaScore: number, bobScore: number) => {
        const contestId = await insertContest(ctx.db, key, {
          startTime: now - endsAgo - HOUR,
          endTime: now - endsAgo,
          isRated: true,
        });
        const contestProblemId = await insertContestProblem(ctx.db, contestId, problemId, 0);
        for (const [profileId, score] of [
          [adaId, adaScore],
          [bobId, bobScore],
        ] as const) {
          const participationId = await insertParticipation(ctx.db, contestId, profileId, {
            realStart: now - endsAgo - HOUR,
            score,
            cumtime: 100,
          });
          await insertSubmission(ctx.db, {
            profileId,
            problemId,
            languageId,
            contestId,
            contestProblemId,
            participationId,
            date: now - endsAgo - MINUTE,
            result: score > 0 ? "AC" : "WA",
            points: score > 0 ? 100 : 0,
            contestPoints: score,
          });
        }
        return contestId;
      };

      return {
        first: await build("first", 3 * HOUR, 1, 0),
        second: await build("second", HOUR, 0, 1),
        adaId,
        bobId,
      };
    });

    await t.withIdentity(identityOf("rater")).mutation(api.ratings.rateContest, { key: "first" });

    await t.run(async (ctx) => {
      const firstRatings = await ctx.db
        .query("ratings")
        .withIndex("by_contest", (q) => q.eq("contestId", fixture.first))
        .collect();
      const secondRatings = await ctx.db
        .query("ratings")
        .withIndex("by_contest", (q) => q.eq("contestId", fixture.second))
        .collect();
      expect(firstRatings.length).toBe(2);
      expect(secondRatings.length).toBe(2);

      // The winner of the first contest is ranked above the loser there.
      const firstByProfile = Object.fromEntries(firstRatings.map((row) => [row.profileId, row]));
      expect(firstByProfile[fixture.adaId]?.rank).toBeLessThan(firstByProfile[fixture.bobId]?.rank ?? 0);

      // `profiles.rating` follows the most recently ended rated contest.
      const secondByProfile = Object.fromEntries(secondRatings.map((row) => [row.profileId, row]));
      const ada = await ctx.db.get(fixture.adaId);
      const bob = await ctx.db.get(fixture.bobId);
      expect(ada?.rating).toBe(secondByProfile[fixture.adaId]?.rating);
      expect(bob?.rating).toBe(secondByProfile[fixture.bobId]?.rating);
      expect((bob?.rating ?? 0) > (ada?.rating ?? 0)).toBe(true);
    });

    const history = await t.query(api.ratings.history, { username: "ada" });
    expect(history?.map((row) => row.contestKey)).toEqual(["first", "second"]);
  });

  test("rating needs judge.contest_rating", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      await insertProfile(ctx.db, "nobody");
      await insertContest(ctx.db, "rated", { isRated: true });
    });
    await expect(
      t.withIdentity(identityOf("nobody")).mutation(api.ratings.rateContest, { key: "rated" }),
    ).rejects.toThrow(/judge.contest_rating/);
  });
});

describe("the hall scoreboard", () => {
  async function scoreboardFixture(t: ReturnType<typeof harness>) {
    const now = Date.now();
    const start = now - 3 * HOUR;
    const end = now - HOUR;
    return await t.run(async (ctx) => {
      const groupId = await insertGroup(ctx.db);
      const languageId = await insertLanguage(ctx.db);
      const staffId = await insertProfile(ctx.db, "staff", { isSuperuser: true, isStaff: true });
      const adaId = await insertProfile(ctx.db, "ada");
      const bobId = await insertProfile(ctx.db, "bob");
      await insertProfile(ctx.db, "watcher");

      const onsite = await insertOrganization(ctx.db, "onsite", { name: "On site" });
      await joinOrganization(ctx.db, onsite, adaId);

      const first = await insertProblem(ctx.db, "aplus", groupId);
      const second = await insertProblem(ctx.db, "bminus", groupId);
      const contestId = await insertContest(ctx.db, "divone", {
        startTime: start,
        endTime: end,
        formatName: "icpc",
        formatConfig: { penalty: 20 },
      });
      const cpFirst = await insertContestProblem(ctx.db, contestId, first, 0);
      const cpSecond = await insertContestProblem(ctx.db, contestId, second, 1);

      const adaParticipation = await insertParticipation(ctx.db, contestId, adaId, {
        realStart: start,
      });
      const bobParticipation = await insertParticipation(ctx.db, contestId, bobId, {
        realStart: start,
      });

      // Ada takes first blood on A at minute 10; Bob solves it at minute 20.
      await insertSubmission(ctx.db, {
        profileId: adaId,
        problemId: first,
        languageId,
        contestId,
        contestProblemId: cpFirst,
        participationId: adaParticipation,
        date: start + 10 * MINUTE,
        result: "AC",
      });
      await insertSubmission(ctx.db, {
        profileId: bobId,
        problemId: first,
        languageId,
        contestId,
        contestProblemId: cpFirst,
        participationId: bobParticipation,
        date: start + 20 * MINUTE,
        result: "AC",
      });
      // Bob solves B inside the last hour, which the event freezes.
      await insertSubmission(ctx.db, {
        profileId: bobId,
        problemId: second,
        languageId,
        contestId,
        contestProblemId: cpSecond,
        participationId: bobParticipation,
        date: start + 90 * MINUTE,
        result: "AC",
      });

      const eventId = await ctx.db.insert("scoreboardEvents", {
        key: "winter",
        name: "Winter Cup",
        contestIds: [contestId],
        theme: "default",
        badgeOrganizationSlugs: ["onsite"],
        inPersonOrganizationSlug: "onsite",
        freezeMinutes: 60,
        isPublic: true,
      });

      return { contestId, eventId, adaId, bobId, staffId, adaParticipation, bobParticipation };
    });
  }

  test("rows are ICPC scored, first blood is marked and the freeze holds", async () => {
    const t = harness();
    await scoreboardFixture(t);

    const payload = await t.query(api.scoreboard.event, { key: "winter" });
    expect(payload?.event.name).toBe("Winter Cup");
    expect(payload?.badges).toEqual([{ key: "onsite", label: "onsite" }]);
    const division = payload?.divisions[0];
    expect(division?.problems.map((problem) => problem.label)).toEqual(["A", "B"]);
    expect(division?.isFrozen).toBe(true);
    expect(division?.inPersonCount).toBe(1);

    const rows = Object.fromEntries((division?.rows ?? []).map((row) => [row.username, row]));
    expect(rows.ada?.rank).toBe(1);
    expect(rows.ada?.cells[0]?.state).toBe("solved");
    expect(rows.ada?.cells[0]?.firstBlood).toBe(true);
    expect(rows.ada?.cells[0]?.penalty).toBe(10);
    expect(rows.ada?.badges).toEqual(["onsite"]);
    expect(rows.ada?.inPerson).toBe(true);

    expect(rows.bob?.cells[0]?.firstBlood).toBe(false);
    expect(rows.bob?.cells[1]?.state).toBe("frozen");
    // The public never receives the withheld result.
    expect(rows.bob?.cells[1]?.reveal).toBeUndefined();

    const staffPayload = await t
      .withIdentity(identityOf("staff"))
      .query(api.scoreboard.event, { key: "winter" });
    expect(staffPayload?.canReveal).toBe(true);
    const staffBob = (staffPayload?.divisions[0]?.rows ?? []).find((row) => row.username === "bob");
    expect(staffBob?.cells[1]?.reveal?.state).toBe("solved");
  });

  test("the reveal is stepwise, persisted and undoable", async () => {
    const t = harness();
    await scoreboardFixture(t);
    const asStaff = t.withIdentity(identityOf("staff"));

    const step = await asStaff.mutation(api.scoreboard.revealStep, { event: "winter" });
    expect(step.revealed).toBe(1);
    expect(step.done).toBe(true);

    const revealed = await t.query(api.scoreboard.event, { key: "winter" });
    const bob = (revealed?.divisions[0]?.rows ?? []).find((row) => row.username === "bob");
    expect(bob?.cells[1]?.state).toBe("solved");
    expect(bob?.solved).toBe(2);
    expect(bob?.rank).toBe(1);
    expect(revealed?.divisions[0]?.isFrozen).toBe(false);

    await asStaff.mutation(api.scoreboard.revealUndo, { event: "winter" });
    const back = await t.query(api.scoreboard.event, { key: "winter" });
    const bobAgain = (back?.divisions[0]?.rows ?? []).find((row) => row.username === "bob");
    expect(bobAgain?.cells[1]?.state).toBe("frozen");

    const all = await asStaff.mutation(api.scoreboard.revealAll, { event: "winter" });
    expect(all.revealed).toBe(1);
    const final = await t.query(api.scoreboard.event, { key: "winter" });
    expect(final?.divisions[0]?.revealPending).toBe(0);
  });

  test("only staff who can edit every contest may reveal", async () => {
    const t = harness();
    await scoreboardFixture(t);
    await expect(
      t.withIdentity(identityOf("watcher")).mutation(api.scoreboard.revealStep, { event: "winter" }),
    ).rejects.toThrow(/may not run the reveal/);
  });

  test("setTag toggles the badge organisation for a competitor", async () => {
    const t = harness();
    const fixture = await scoreboardFixture(t);
    const asStaff = t.withIdentity(identityOf("staff"));

    const on = await asStaff.mutation(api.scoreboard.setTag, {
      event: "winter",
      username: "bob",
      slug: "onsite",
      on: true,
    });
    expect(on.badges).toEqual(["onsite"]);
    expect(on.inPerson).toBe(true);

    const off = await asStaff.mutation(api.scoreboard.setTag, {
      event: "winter",
      username: "ada",
      slug: "onsite",
      on: false,
    });
    expect(off.badges).toEqual([]);

    await expect(
      asStaff.mutation(api.scoreboard.setTag, {
        event: "winter",
        username: "bob",
        slug: "elsewhere",
        on: true,
      }),
    ).rejects.toThrow(/editable badge/);

    await expect(
      asStaff.mutation(api.scoreboard.setTag, {
        event: "winter",
        username: "watcher",
        slug: "onsite",
        on: true,
      }),
    ).rejects.toThrow(/not competing/);

    void fixture;
  });

  test("events lists the public scoreboards", async () => {
    const t = harness();
    await scoreboardFixture(t);
    const rows = await t.query(api.scoreboard.events, {});
    expect(rows.map((row) => row.key)).toEqual(["winter"]);
    expect(rows[0]?.contestKeys).toEqual(["divone"]);
  });
});

describe("the staff console", () => {
  test("creating, editing and reordering a contest writes revisions", async () => {
    const t = harness();
    const ids = await t.run(async (ctx) => {
      const groupId = await insertGroup(ctx.db);
      await insertProfile(ctx.db, "author", {
        permissions: ["judge.edit_own_contest", "judge.change_contest_visibility", "judge.lock_contest"],
        isStaff: true,
      });
      return {
        first: await insertProblem(ctx.db, "aplus", groupId),
        second: await insertProblem(ctx.db, "bminus", groupId),
      };
    });

    const asAuthor = t.withIdentity(identityOf("author"));
    const now = Date.now();
    const created = await asAuthor.mutation(api.admin.contests.create, {
      key: "newone",
      name: "New one",
      startTime: now,
      endTime: now + HOUR,
      formatName: "icpc",
      formatConfig: { penalty: 20 },
      freezeMinutes: 30,
      reason: "Set up the weekly",
    });
    expect(created.key).toBe("newone");

    const a = await asAuthor.mutation(api.admin.contests.addProblem, {
      key: "newone",
      problemCode: "aplus",
      points: 1,
    });
    const b = await asAuthor.mutation(api.admin.contests.addProblem, {
      key: "newone",
      problemCode: "bminus",
      points: 1,
    });

    await asAuthor.mutation(api.admin.contests.reorderProblems, {
      key: "newone",
      order: [b, a],
    });
    const detail = await asAuthor.query(api.admin.contests.get, { key: "newone" });
    expect(detail?.problems.map((problem) => problem.code)).toEqual(["bminus", "aplus"]);
    expect(detail?.problems.map((problem) => problem.label)).toEqual(["A", "B"]);

    await asAuthor.mutation(api.admin.contests.setVisibility, {
      key: "newone",
      isVisible: true,
      reason: "Published",
    });

    await asAuthor.mutation(api.admin.contests.removeProblem, {
      key: "newone",
      contestProblemId: a,
    });
    const after = await asAuthor.query(api.admin.contests.get, { key: "newone" });
    expect(after?.problems.map((problem) => problem.order)).toEqual([0]);
    expect(after?.contest.isVisible).toBe(true);

    await t.run(async (ctx) => {
      const revisions = await ctx.db.query("revisions").collect();
      const reasons = revisions.map((row) => row.reason);
      expect(reasons).toContain("Set up the weekly");
      expect(reasons).toContain("Published");
      expect(revisions.every((row) => row.entityType === "contest")).toBe(true);
    });

    void ids;
  });

  test("an invalid format config is refused", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      await insertProfile(ctx.db, "author", { permissions: ["judge.edit_own_contest"] });
    });
    const now = Date.now();
    await expect(
      t.withIdentity(identityOf("author")).mutation(api.admin.contests.create, {
        key: "broken",
        name: "Broken",
        startTime: now,
        endTime: now + HOUR,
        formatName: "icpc",
        formatConfig: { penalty: -1 },
      }),
    ).rejects.toThrow(/penalty/);
  });

  test("changing visibility without the permission is refused", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const authorId = await insertProfile(ctx.db, "author", {
        permissions: ["judge.edit_own_contest"],
      });
      await insertContest(ctx.db, "mine", { authorProfileIds: [authorId], isVisible: false });
    });
    await expect(
      t.withIdentity(identityOf("author")).mutation(api.admin.contests.setVisibility, {
        key: "mine",
        isVisible: true,
      }),
    ).rejects.toThrow(/change_contest_visibility/);
  });

  test("scoreboard events are created and updated from the console", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      await insertProfile(ctx.db, "boss", {
        permissions: ["judge.edit_all_contest"],
        isStaff: true,
      });
      await insertContest(ctx.db, "divone");
      await insertContest(ctx.db, "divtwo");
    });

    const asBoss = t.withIdentity(identityOf("boss"));
    await asBoss.mutation(api.admin.scoreboards.create, {
      key: "winter26",
      name: "Winter Cup 2026",
      contestKeys: ["divone", "divtwo"],
      freezeMinutes: 60,
      badgeOrganizationSlugs: ["onsite"],
    });

    const listed = await asBoss.query(api.admin.scoreboards.list, {});
    expect(listed.length).toBe(1);
    expect(listed[0]?.contestKeys).toEqual(["divone", "divtwo"]);

    await asBoss.mutation(api.admin.scoreboards.update, {
      key: "winter26",
      contestKeys: ["divone"],
      isPublic: false,
    });
    const updated = await asBoss.query(api.admin.scoreboards.get, { key: "winter26" });
    expect(updated?.contestKeys).toEqual(["divone"]);
    expect(updated?.isPublic).toBe(false);

    // A hidden event is invisible to the public.
    expect(await t.query(api.scoreboard.event, { key: "winter26" })).toBeNull();

    await expect(
      asBoss.mutation(api.admin.scoreboards.update, { key: "winter26", contestKeys: ["ghost"] }),
    ).rejects.toThrow(/Unknown contest/);
  });
});

describe("the calendar and the feed", () => {
  test("a contest lands on its start day and the month is bounded", async () => {
    const t = harness();
    const start = Date.UTC(2026, 2, 14, 2, 0, 0);
    await t.run(async (ctx) => {
      await insertContest(ctx.db, "march", { startTime: start, endTime: start + 3 * HOUR });
    });

    const payload = await t.query(api.contests.calendar, { year: 2026, month: 3 });
    const days = (payload?.weeks ?? []).flat();
    const day = days.find((entry) => entry.date === "2026-03-14");
    expect(day?.oneday.map((row) => row.key)).toEqual(["march"]);
    expect(days.filter((entry) => !entry.isPad).length).toBe(31);

    // 1969 is before the first contest, so DMOJ 404s it.
    expect(await t.query(api.contests.calendar, { year: 1969, month: 7 })).toBeNull();

    const feed = await t.query(api.contests.ical, {});
    expect(feed.map((row) => row.uid)).toEqual(["contest-march"]);
  });
});

describe("contest formats", () => {
  test("the registry and the short form come from @moj/core", async () => {
    const t = harness();
    const formats = await t.query(api.contestFormats.list, {});
    expect(formats.map((format) => format.name).sort()).toEqual([
      "atcoder",
      "default",
      "ecoo",
      "icpc",
      "ioi",
      "ioi16",
    ]);

    const described = await t.query(api.contestFormats.describe, {
      name: "icpc",
      config: { penalty: 20 },
    });
    expect(described.error).toBeNull();
    expect(described.lines[0]).toContain("maximum score submission");

    const invalidConfig = await t.query(api.contestFormats.validate, {
      name: "icpc",
      config: { penalty: -5 },
    });
    expect(invalidConfig.ok).toBe(false);
  });
});
