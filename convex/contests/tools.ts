/**
 * The two tools a contest's staff run from the contest page: cloning a contest
 * into a new key, and the MOSS plagiarism report.
 *
 * Ported from judge/views/contests.py (`ContestClone`, `ContestMossView`).
 */

import { contestIsEditableBy, hasPerm } from "@moj/core";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { optionalViewer, requireViewer } from "../lib/auth";
import { forbidden, invalid, mojError } from "../lib/errors";
import {
  CONTEST_KEY_PATTERN,
  contestByKey,
  loadContestProblems,
  toContestRow,
  toViewerRowInContest,
} from "./formats";
import { requireAccessibleContest } from "./participation";

/** `ContestClone` (contests.py:317). */
export const clone = mutation({
  args: { key: v.string(), newKey: v.string() },
  handler: async (ctx, { key, newKey }): Promise<{ contestId: Id<"contests">; key: string }> => {
    const profile = await requireViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);

    if (!hasPerm(viewer, "judge.clone_contest")) {
      throw forbidden("Missing permission judge.clone_contest.");
    }

    const contest = await requireAccessibleContest(ctx, key, profile);

    const wanted = newKey.trim();

    if (!CONTEST_KEY_PATTERN.test(wanted) || wanted.length > 20) {
      throw invalid("Contest id must be lowercase letters and digits, at most 20 characters.");
    }

    if (await contestByKey(ctx, wanted)) {
      throw mojError("CONFLICT", "That contest id is already taken.");
    }

    const { _id, _creationTime, legacyId, ...fields } = contest;

    const contestId = await ctx.db.insert("contests", {
      ...fields,
      key: wanted,
      isVisible: false,
      userCount: 0,
      lockedAfter: undefined,
      authorProfileIds: [profile._id],
      // The freeze comes along; the reveal ceremony does not.
      reveal: undefined,
    });

    for (const contestProblem of await loadContestProblems(ctx, contest._id)) {
      const {
        _id: _problemRowId,
        _creationTime: _problemCreated,
        legacyId: _problemLegacyId,
        ...problemFields
      } = contestProblem;

      await ctx.db.insert("contestProblems", { ...problemFields, contestId });
    }

    await ctx.db.insert("revisions", {
      entityType: "contest",
      entityId: contestId,
      snapshot: { key: wanted, clonedFrom: contest.key },
      authorProfileId: profile._id,
      reason: `Cloned contest from ${contest.key}`,
      createdAt: Date.now(),
    });

    return { contestId, key: wanted };
  },
});

export type MossPayload = {
  configured: boolean;
  message: string | null;
  results: {
    problemCode: string;
    problemName: string;
    languageKey: string;
    submissionCount: number;
    url: string | null;
  }[];
};

/**
 * `ContestMossView` (contests.py:852). MOSS itself needs an outbound call with
 * a key we do not have; without one the page says so and offers nothing.
 */
export const moss = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<MossPayload | null> => {
    const profile = await optionalViewer(ctx);

    if (!profile) return null;
    const contest = await contestByKey(ctx, key);

    if (!contest) return null;

    const viewer = await toViewerRowInContest(ctx, profile);

    if (!hasPerm(viewer, "judge.moss_contest")) return null;

    if (!contestIsEditableBy(toContestRow(contest), viewer)) return null;

    const settings = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
      .unique();

    if (!settings?.mossApiKey) {
      return { configured: false, message: "MOSS is not configured.", results: [] };
    }

    const rows = await ctx.db
      .query("contestMoss")
      .withIndex("by_contest", (q) => q.eq("contestId", contest._id))
      .collect();

    const results: MossPayload["results"] = [];

    for (const row of rows) {
      const problem = await ctx.db.get(row.problemId);
      results.push({
        problemCode: problem?.code ?? "",
        problemName: problem?.name ?? "",
        languageKey: row.languageKey,
        submissionCount: row.submissionCount,
        url: row.url ?? null,
      });
    }

    return { configured: true, message: null, results };
  },
});
