import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { setupConvexTest } from "./convexTest.setup";
import { makeContest, makeGroup, makeProblem, makeProfile } from "./fixtures.setup";

async function seed(t: ReturnType<typeof setupConvexTest>) {
  return await t.run(async (ctx) => {
    const groupId = await makeGroup(ctx);
    const profileId = await makeProfile(ctx, "ada");
    const contestId = await makeContest(ctx, "week1");
    const otherContestId = await makeContest(ctx, "week2");

    const problemA = await makeProblem(ctx, "a", groupId);
    const problemB = await makeProblem(ctx, "b", groupId);

    const cpA = await ctx.db.insert("contestProblems", {
      contestId,
      problemId: problemA,
      points: 100,
      partial: false,
      isPretested: false,
      order: 1,
      legacyId: 1,
    });
    const cpB = await ctx.db.insert("contestProblems", {
      contestId,
      problemId: problemB,
      points: 100,
      partial: false,
      isPretested: false,
      order: 2,
      legacyId: 4,
    });
    // Same legacy id, different contest: the backfill must not borrow it.
    await ctx.db.insert("contestProblems", {
      contestId: otherContestId,
      problemId: problemA,
      points: 100,
      partial: false,
      isPretested: false,
      order: 1,
      legacyId: 7,
    });

    const legacy = await ctx.db.insert("contestParticipations", {
      contestId,
      profileId,
      realStart: Date.UTC(2024, 0, 1),
      score: 150,
      cumtime: 90,
      isDisqualified: false,
      tiebreaker: 0,
      virtual: 0,
      // DMOJ's keys: ContestProblem ids, one of which is gone.
      formatData: {
        "1": { time: 30, points: 100 },
        "4": { time: 60, points: 50 },
        "9": { time: 1, points: 0 },
      },
      legacyId: 100,
    });
    const alreadyMapped = await ctx.db.insert("contestParticipations", {
      contestId,
      profileId,
      realStart: Date.UTC(2024, 0, 1),
      score: 100,
      cumtime: 30,
      isDisqualified: false,
      tiebreaker: 0,
      virtual: 1,
      formatData: { [cpA]: { time: 30, points: 100 } },
      legacyId: 101,
    });
    const empty = await ctx.db.insert("contestParticipations", {
      contestId,
      profileId,
      realStart: Date.UTC(2024, 0, 1),
      score: 0,
      cumtime: 0,
      isDisqualified: false,
      tiebreaker: 0,
      virtual: 2,
      formatData: null,
      legacyId: 102,
    });
    // A cross contest legacy id that must be dropped rather than remapped.
    const foreign = await ctx.db.insert("contestParticipations", {
      contestId,
      profileId,
      realStart: Date.UTC(2024, 0, 1),
      score: 0,
      cumtime: 0,
      isDisqualified: false,
      tiebreaker: 0,
      virtual: 3,
      formatData: { "7": { time: 5, points: 10 } },
      legacyId: 103,
    });
    return { cpA, cpB, legacy, alreadyMapped, empty, foreign };
  });
}

async function runAll(t: ReturnType<typeof setupConvexTest>) {
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
    const t = setupConvexTest();
    const ids = await seed(t);

    const totals = await runAll(t);
    expect(totals.rewritten).toBe(2);
    // The "9" key has no contest problem and "7" belongs to another contest.
    expect(totals.droppedKeys).toBe(2);

    await t.run(async (ctx) => {
      const legacy = await ctx.db.get(ids.legacy as Id<"contestParticipations">);
      expect(legacy?.formatData).toEqual({
        [ids.cpA]: { time: 30, points: 100 },
        [ids.cpB]: { time: 60, points: 50 },
      });

      const mapped = await ctx.db.get(ids.alreadyMapped as Id<"contestParticipations">);
      expect(mapped?.formatData).toEqual({ [ids.cpA]: { time: 30, points: 100 } });

      const empty = await ctx.db.get(ids.empty as Id<"contestParticipations">);
      expect(empty?.formatData).toBeNull();

      const foreign = await ctx.db.get(ids.foreign as Id<"contestParticipations">);
      expect(foreign?.formatData).toEqual({});
    });
  });

  it("is idempotent", async () => {
    const t = setupConvexTest();
    await seed(t);
    await runAll(t);
    const second = await runAll(t);
    expect(second.rewritten).toBe(0);
  });
});

describe("importer.backfillLabelScheme", () => {
  async function run(t: ReturnType<typeof setupConvexTest>) {
    let cursor: string | null = null;
    let rewritten = 0;
    for (;;) {
      const result: { rewritten: number; continueCursor: string | null; isDone: boolean } = await t.mutation(
        internal.importer.backfillLabelScheme,
        { cursor, numItems: 10 },
      );
      rewritten += result.rewritten;
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    return rewritten;
  }

  it("numbers the formats that DMOJ numbers and leaves icpc lettered", async () => {
    const t = setupConvexTest();
    const ids = await t.run(async (ctx) => ({
      def: await makeContest(ctx, "a", { formatName: "default" }),
      icpc: await makeContest(ctx, "b", { formatName: "icpc" }),
      ioi: await makeContest(ctx, "c", { formatName: "ioi16" }),
    }));

    expect(await run(t)).toBe(2);

    await t.run(async (ctx) => {
      expect((await ctx.db.get(ids.def))?.labelScheme).toBe("numbers");
      expect((await ctx.db.get(ids.icpc))?.labelScheme).toBe("letters");
      expect((await ctx.db.get(ids.ioi))?.labelScheme).toBe("numbers");
    });

    expect(await run(t)).toBe(0);
  });

  it("leaves a contest that carries custom labels alone", async () => {
    const t = setupConvexTest();
    const id = await t.run(async (ctx) => {
      const contestId = await makeContest(ctx, "custom", { formatName: "default" });
      await ctx.db.patch(contestId, { customLabels: ["P1", "P2"] });
      return contestId;
    });

    expect(await run(t)).toBe(0);
    await t.run(async (ctx) => {
      expect((await ctx.db.get(id))?.labelScheme).toBe("letters");
    });
  });
});
