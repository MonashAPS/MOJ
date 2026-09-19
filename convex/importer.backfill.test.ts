import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import {
  insertContest,
  insertContestProblem,
  insertParticipation,
  insertProblem,
  insertProblemGroup,
  insertProfile,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

async function seed(t: T) {
  return await t.run(async (ctx) => {
    const groupId = await insertProblemGroup(ctx);
    const profileId = await insertProfile(ctx, { username: "ada" });
    const contestId = await insertContest(ctx, { key: "week1" });
    const otherContestId = await insertContest(ctx, { key: "week2" });

    const problemA = await insertProblem(ctx, { code: "a", groupId });
    const problemB = await insertProblem(ctx, { code: "b", groupId });

    const cpA = await insertContestProblem(ctx, {
      contestId,
      problemId: problemA,
      order: 1,
      legacyId: 1,
    });

    const cpB = await insertContestProblem(ctx, {
      contestId,
      problemId: problemB,
      order: 2,
      legacyId: 4,
    });

    // Same legacy id, different contest: the backfill must not borrow it.
    await insertContestProblem(ctx, {
      contestId: otherContestId,
      problemId: problemA,
      order: 1,
      legacyId: 7,
    });

    const legacy = await insertParticipation(ctx, {
      contestId,
      profileId,
      realStart: Date.UTC(2024, 0, 1),
      score: 150,
      cumtime: 90,
      virtual: 0,
      // DMOJ's keys: ContestProblem ids, one of which is gone.
      formatData: {
        "1": { time: 30, points: 100 },
        "4": { time: 60, points: 50 },
        "9": { time: 1, points: 0 },
      },
      legacyId: 100,
    });

    const alreadyMapped = await insertParticipation(ctx, {
      contestId,
      profileId,
      realStart: Date.UTC(2024, 0, 1),
      score: 100,
      cumtime: 30,
      virtual: 1,
      formatData: { [cpA]: { time: 30, points: 100 } },
      legacyId: 101,
    });

    const empty = await insertParticipation(ctx, {
      contestId,
      profileId,
      realStart: Date.UTC(2024, 0, 1),
      virtual: 2,
      formatData: null,
      legacyId: 102,
    });

    // A cross contest legacy id that must be dropped rather than remapped.
    const foreign = await insertParticipation(ctx, {
      contestId,
      profileId,
      realStart: Date.UTC(2024, 0, 1),
      virtual: 3,
      formatData: { "7": { time: 5, points: 10 } },
      legacyId: 103,
    });

    return { cpA, cpB, legacy, alreadyMapped, empty, foreign };
  });
}

async function runAll(t: T) {
  let cursor: string | null = null;
  let rewritten = 0;
  let droppedKeys = 0;

  for (;;) {
    const result: {
      rewritten: number;
      droppedKeys: number;
      continueCursor: string | null;
      isDone: boolean;
    } = await t.mutation(internal.importer.backfillFormatDataKeys, { cursor, numItems: 2 });

    rewritten += result.rewritten;
    droppedKeys += result.droppedKeys;

    if (result.isDone) break;
    cursor = result.continueCursor;
  }

  return { rewritten, droppedKeys };
}

describe("importer.backfillFormatDataKeys", () => {
  it("rewrites the legacy ContestProblem keys onto the imported ids", async () => {
    const t = setupTest();
    const ids = await seed(t);

    const totals = await runAll(t);
    expect(totals.rewritten).toBe(2);
    // The "9" key has no contest problem and "7" belongs to another contest.
    expect(totals.droppedKeys).toBe(2);

    await t.run(async (ctx) => {
      const legacy = await ctx.db.get(ids.legacy);
      expect(legacy?.formatData).toEqual({
        [ids.cpA]: { time: 30, points: 100 },
        [ids.cpB]: { time: 60, points: 50 },
      });

      const mapped = await ctx.db.get(ids.alreadyMapped);
      expect(mapped?.formatData).toEqual({ [ids.cpA]: { time: 30, points: 100 } });

      const empty = await ctx.db.get(ids.empty);
      expect(empty?.formatData).toBeNull();

      const foreign = await ctx.db.get(ids.foreign);
      expect(foreign?.formatData).toEqual({});
    });
  });

  it("is idempotent", async () => {
    const t = setupTest();
    await seed(t);
    await runAll(t);
    const second = await runAll(t);
    expect(second.rewritten).toBe(0);
  });
});
