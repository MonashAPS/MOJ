// @vitest-environment edge-runtime

import rateLimiter from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { languageRow, problemRow, profileRow, siteSettingsRow } from "./lib/testing";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Every problem the club imported sits on `submission_source_visibility = 'F'`,
 * so `settings.DMOJ_SUBMISSION_SOURCE_VISIBILITY` alone decides who may read a
 * submission's source. These check that the site setting reaches
 * `Submission.can_see_detail`.
 */
async function seed(t: ReturnType<typeof convexTest>, visibility?: "all" | "all-solved" | "only-own") {
  return await t.run(async (ctx) => {
    await ctx.db.insert(
      "siteSettings",
      siteSettingsRow(visibility === undefined ? {} : { submissionSourceVisibility: visibility }),
    );
    const languageId = await ctx.db.insert("languages", languageRow());
    const groupId = await ctx.db.insert("problemGroups", { name: "misc", fullName: "Misc" });
    const problemId = await ctx.db.insert("problems", problemRow("alpha", groupId));

    const author = await ctx.db.insert("profiles", profileRow("author"));
    await ctx.db.insert("profiles", profileRow("onlooker"));

    const submissionId = await ctx.db.insert("submissions", {
      profileId: author,
      problemId,
      date: Date.now(),
      languageId,
      status: "D" as const,
      result: "AC" as const,
      currentTestcase: 0,
      batch: false,
      casePoints: 100,
      caseTotal: 100,
      isPretested: false,
      isArchived: false,
      priority: 0,
      retryCount: 0,
      points: 100,
    });
    await ctx.db.insert("submissionSources", { submissionId, source: "print(1)" });
    // `profileRow` derives userId as `user-<username>`.
    return { submissionId, onlookerId: "user-onlooker" };
  });
}

function identity(userId: string) {
  return { subject: userId, tokenIdentifier: userId, issuer: "test" };
}

describe("global submission source visibility", () => {
  test("all-solved hides the source from someone who has not solved it", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const { submissionId, onlookerId } = await seed(t, "all-solved");
    const result = await t.withIdentity(identity(onlookerId)).query(api.submissions.source, { submissionId });
    expect(result?.canSeeSource).toBe(false);
  });

  test("all shows the source to anyone signed in", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const { submissionId, onlookerId } = await seed(t, "all");
    const result = await t.withIdentity(identity(onlookerId)).query(api.submissions.source, { submissionId });
    expect(result?.canSeeSource).toBe(true);
    expect(result?.source).toBe("print(1)");
  });

  test("an unset setting falls back to DMOJ's all-solved default", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const { submissionId, onlookerId } = await seed(t, undefined);
    const result = await t.withIdentity(identity(onlookerId)).query(api.submissions.source, { submissionId });
    expect(result?.canSeeSource).toBe(false);
  });
});
