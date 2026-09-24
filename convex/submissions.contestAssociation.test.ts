import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertParticipation,
  insertProblem,
  insertProfile,
  insertSubmission,
} from "./test.fixtures";
import { setupTest } from "./test.setup";

const paginationOpts = { numItems: 20, cursor: null };

describe("submission contest associations", () => {
  it.each([undefined, null, "start", "end"] as const)(
    "protects an unreleased %s list across submission surfaces",
    async (policy) => {
      const t = setupTest();

      const { contestId, submissionId } = await t.run(async (ctx) => {
        const profileId = await insertProfile(ctx, { username: "owner" });
        await insertProfile(ctx, {
          username: "editor",
          isStaff: true,
          permissions: ["judge.edit_all_contest", "judge.see_private_contest"],
        });
        const languageId = await insertLanguage(ctx);
        const problemId = await insertProblem(ctx, { code: "publicproblem", isPublic: true });

        const contestId = await insertContest(ctx, {
          key: "hiddenlist",
          startTime: Date.now() + 60_000,
          endTime: Date.now() + 120_000,
          problemListReleaseAt: policy,
          scoreboard: { audiences: ["everyone"], from: "start" },
        });

        const contestProblemId = await insertContestProblem(ctx, { contestId, problemId });
        const participationId = await insertParticipation(ctx, { contestId, profileId });

        const submissionId = await insertSubmission(ctx, {
          profileId,
          languageId,
          problemId,
          contestId,
          contestProblemId,
          participationId,
          contestPoints: 50,
        });

        return { contestId, submissionId };
      });

      for (const filters of [{}, { contestKey: "hiddenlist" }, { problemCode: "publicproblem" }]) {
        expect((await t.query(api.submissions.list, { ...filters, paginationOpts })).page).toEqual([]);
      }

      for (const filters of [{}, { contest: "hiddenlist" }, { problem: "publicproblem" }]) {
        const result = await t.query(api.apiV2.submissions, filters);
        expect(result.objects).toEqual([]);
      }

      const detail = await t.query(api.submissions.detail, { submissionId });
      expect(detail?.submission.contest).toBeNull();
      expect(detail?.submission.contestPoints).toBeNull();

      for (const username of ["owner", "editor"]) {
        const caller = asUser(t, username);
        expect(
          (await caller.query(api.submissions.list, { contestKey: "hiddenlist", paginationOpts })).page,
        ).toHaveLength(1);
        expect((await caller.query(api.apiV2.submissions, { contest: "hiddenlist" })).objects).toHaveLength(
          1,
        );
        expect((await caller.query(api.submissions.detail, { submissionId }))?.submission.contest?.key).toBe(
          "hiddenlist",
        );
      }

      await t.run(async (ctx) =>
        ctx.db.patch(contestId, {
          startTime: Date.now() - 120_000,
          endTime: Date.now() - 60_000,
        }),
      );
      const expected = policy === null ? 0 : 1;
      expect(
        (await t.query(api.submissions.list, { contestKey: "hiddenlist", paginationOpts })).page,
      ).toHaveLength(expected);
      expect((await t.query(api.apiV2.submissions, { contest: "hiddenlist" })).objects).toHaveLength(
        expected,
      );
      expect((await t.query(api.submissions.detail, { submissionId }))?.submission.contest?.key ?? null).toBe(
        expected ? "hiddenlist" : null,
      );
    },
  );
});
