// @vitest-environment edge-runtime

import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  insertLanguage,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSiteSettings,
  insertSubmission,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

/**
 * Every imported problem sits on `submission_source_visibility = 'F'`,
 * so `settings.DMOJ_SUBMISSION_SOURCE_VISIBILITY` alone decides who may read a
 * submission's source. These check that the site setting reaches
 * `Submission.can_see_detail`.
 */
async function seed(t: T, visibility?: "all" | "all-solved" | "only-own") {
  return await t.run(async (ctx) => {
    await insertSiteSettings(ctx, visibility === undefined ? {} : { submissionSourceVisibility: visibility });
    const languageId = await insertLanguage(ctx);
    const groupId = await insertProblemGroup(ctx, { name: "misc" });
    const problemId = await insertProblem(ctx, { code: "alpha", groupId });

    const author = await insertProfile(ctx, { username: "author" });
    await insertProfile(ctx, { username: "onlooker" });

    const submissionId = await insertSubmission(ctx, {
      profileId: author,
      problemId,
      languageId,
      result: "AC",
      points: 100,
      casePoints: 100,
      caseTotal: 100,
      priority: 0,
    });
    return { submissionId };
  });
}

describe("global submission source visibility", () => {
  test("all-solved hides the source from someone who has not solved it", async () => {
    const t = setupTest();
    const { submissionId } = await seed(t, "all-solved");
    const result = await asUser(t, "onlooker").query(api.submissions.source, { submissionId });
    expect(result?.canSeeSource).toBe(false);
  });

  test("all shows the source to anyone signed in", async () => {
    const t = setupTest();
    const { submissionId } = await seed(t, "all");
    const result = await asUser(t, "onlooker").query(api.submissions.source, { submissionId });
    expect(result?.canSeeSource).toBe(true);
    expect(result?.source).toBe("print(1)");
  });

  test("an unset setting falls back to DMOJ's all-solved default", async () => {
    const t = setupTest();
    const { submissionId } = await seed(t, undefined);
    const result = await asUser(t, "onlooker").query(api.submissions.source, { submissionId });
    expect(result?.canSeeSource).toBe(false);
  });
});
