import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { asUser, insertContest, insertContestProblem, insertProblem, insertProfile } from "./test.fixtures";
import { setupTest } from "./test.setup";

describe("public problem contest associations", () => {
  it.each([undefined, null, "start", "end"] as const)(
    "protects unreleased %s lists on every problem surface",
    async (policy) => {
      const t = setupTest();

      const contestId = await t.run(async (ctx) => {
        await insertProfile(ctx, {
          username: "editor",
          isStaff: true,
          permissions: ["judge.edit_all_contest"],
        });
        const problemId = await insertProblem(ctx, { code: "aplusb" });

        const id = await insertContest(ctx, {
          key: "unreleased",
          problemListReleaseAt: policy,
          startTime: Date.now() + 60_000,
          endTime: Date.now() + 120_000,
        });

        await insertContestProblem(ctx, { contestId: id, problemId });

        return id;
      });

      expect((await t.query(api.problems.get, { code: "aplusb" }))?.appearedIn).toEqual([]);
      expect((await t.query(api.problems.list, { contestKeys: ["unreleased"] })).items).toEqual([]);
      expect((await t.query(api.pages.problems.filterOptions, {})).contests).toEqual([]);
      expect(
        (await asUser(t, "editor").query(api.problems.get, { code: "aplusb" }))?.appearedIn,
      ).toHaveLength(1);

      await t.run(async (ctx) =>
        ctx.db.patch(contestId, { startTime: Date.now() - 120_000, endTime: Date.now() - 60_000 }),
      );
      const expected = policy === null ? 0 : 1;
      expect((await t.query(api.problems.get, { code: "aplusb" }))?.appearedIn).toHaveLength(expected);
      expect((await t.query(api.problems.list, { contestKeys: ["unreleased"] })).items).toHaveLength(
        expected,
      );
      expect((await t.query(api.pages.problems.filterOptions, {})).contests).toHaveLength(expected);

      await t.run(async (ctx) => ctx.db.patch(contestId, { isVisible: false }));
      expect((await t.query(api.problems.get, { code: "aplusb" }))?.appearedIn).toEqual([]);
      expect((await t.query(api.problems.list, { contestKeys: ["unreleased"] })).items).toEqual([]);
      expect((await t.query(api.pages.problems.filterOptions, {})).contests).toEqual([]);
    },
  );
});
