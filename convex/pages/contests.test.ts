// @vitest-environment edge-runtime

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  asUser,
  HOUR,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertParticipation,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSubmission,
  MINUTE,
} from "../test.fixtures";
import { setupTest, type T } from "../test.setup";
import { tagTextColor } from "./contests";

describe("tag", () => {
  test("a tag carries its own colour and the ink that reads on it", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("contestTags", {
        name: "beginner",
        color: "#ffffff",
        description: "Gentle problems.",
      });
      await ctx.db.insert("contestTags", { name: "hard", color: "#101a3d", description: "" });
    });

    const light = await t.query(api.pages.contests.tag, { name: "beginner" });
    expect(light?.textColor).toBe("#000000");
    expect(light?.description).toBe("Gentle problems.");

    const dark = await t.query(api.pages.contests.tag, { name: "hard" });
    expect(dark?.textColor).toBe("#ffffff");

    expect(await t.query(api.pages.contests.tag, { name: "nope" })).toBeNull();
  });

  test("tagTextColor tolerates a short hex and rubbish", () => {
    expect(tagTextColor("#fff")).toBe("#000000");
    expect(tagTextColor("#000")).toBe("#ffffff");
    expect(tagTextColor("nonsense")).toBe("#000000");
  });
});

describe("frozenCells", () => {
  async function frozenContest(t: T) {
    const now = Date.now();

    return await t.run(async (ctx) => {
      const groupId = await insertProblemGroup(ctx);
      const languageId = await insertLanguage(ctx);
      const problemId = await insertProblem(ctx, { code: "aplusb", groupId });

      const contestId = await insertContest(ctx, {
        key: "frozen",
        startTime: now - 3 * HOUR,
        endTime: now + 30 * MINUTE,
        freezeMinutes: 60,
      });

      const contestProblemId = await insertContestProblem(ctx, {
        contestId,
        problemId,
        order: 0,
        points: 1,
      });

      const profileId = await insertProfile(ctx, { username: "runner" });

      const participationId = await insertParticipation(ctx, {
        contestId,
        profileId,
        realStart: now - 3 * HOUR,
      });

      // One submission before the freeze point and two after it.
      await insertSubmission(ctx, {
        profileId,
        problemId,
        languageId,
        contestId,
        contestProblemId,
        participationId,
        date: now - 2 * HOUR,
        result: "WA",
        points: 0,
        casePoints: 0,
        contestPoints: 0,
        time: 0.1,
        memory: 1024,
      });

      for (const offset of [10 * MINUTE, 5 * MINUTE]) {
        await insertSubmission(ctx, {
          profileId,
          problemId,
          languageId,
          contestId,
          contestProblemId,
          participationId,
          date: now - offset,
          result: "AC",
          points: 100,
          casePoints: 1,
          contestPoints: 1,
          time: 0.1,
          memory: 1024,
        });
      }

      return { contestProblemId, participationId };
    });
  }

  test("post-freeze submissions become pending marks", async () => {
    const t = setupTest();
    const { contestProblemId, participationId } = await frozenContest(t);

    const frozen = await t.query(api.pages.contests.frozenCells, { key: "frozen" });
    expect(frozen).not.toBeNull();
    expect(frozen?.cells).toEqual([
      {
        participationId: participationId as Id<"contestParticipations">,
        contestProblemId: contestProblemId as Id<"contestProblems">,
        pending: 2,
      },
    ]);
  });

  test("a staff viewer sees through the freeze, so there is nothing to withhold", async () => {
    const t = setupTest();
    await frozenContest(t);
    await t.run(async (ctx) => {
      await insertProfile(ctx, { username: "staff", isSuperuser: true });
    });

    const asStaff = asUser(t, "staff");
    expect(await asStaff.query(api.pages.contests.frozenCells, { key: "frozen" })).toBeNull();
  });

  test("a contest with no freeze has no pending marks", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertContest(ctx, { key: "open" });
    });
    expect(await t.query(api.pages.contests.frozenCells, { key: "open" })).toBeNull();
  });
});

describe("deleteMossResults", () => {
  test("an editor with the permission clears the stored results", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      const groupId = await insertProblemGroup(ctx);
      const problemId = await insertProblem(ctx, { code: "aplusb", groupId });

      const editorId = await insertProfile(ctx, {
        username: "editor",
        permissions: ["judge.moss_contest", "judge.edit_all_contest"],
      });

      const contestId = await insertContest(ctx, { key: "mossy", authorProfileIds: [editorId] });
      await ctx.db.insert("contestMoss", {
        contestId,
        problemId,
        languageKey: "CPP20",
        submissionCount: 3,
        url: "https://moss.example/1",
      });
    });

    const asEditor = asUser(t, "editor");
    expect(await asEditor.mutation(api.pages.contests.deleteMossResults, { key: "mossy" })).toEqual({
      deleted: 1,
    });
    const after = await t.run(async (ctx) => await ctx.db.query("contestMoss").collect());
    expect(after).toHaveLength(0);
  });

  test("a member without the permission cannot", async () => {
    const t = setupTest();
    await t.run(async (ctx) => {
      await insertContest(ctx, { key: "mossy" });
      await insertProfile(ctx, { username: "member" });
    });

    const asMember = asUser(t, "member");
    await expect(asMember.mutation(api.pages.contests.deleteMossResults, { key: "mossy" })).rejects.toThrow();
  });
});
