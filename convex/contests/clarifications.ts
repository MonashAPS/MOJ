/**
 * Contest clarifications. DMOJ keeps them as `ProblemClarification` rows on the
 * contest's problems (judge/views/blog.py:49), so the list gathers them across
 * every problem in the contest and labels each one.
 */

import { contestAccessCheck, contestIsEditableBy } from "@moj/core";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { optionalViewer, requireViewer } from "../lib/auth";
import { forbidden, invalid, notFound } from "../lib/errors";
import { canAccessProblem, loadViewerContext } from "../problems";
import {
  contestByKey,
  labelForProblem,
  loadContestProblems,
  problemListAccessFor,
  toContestRow,
  toViewerRowInContest,
} from "./formats";

export type Clarification = {
  _id: Id<"problemClarifications">;
  problemId: Id<"problems">;
  problemCode: string;
  problemName: string;
  label: string;
  description: string;
  date: number;
};

/**
 * DMOJ's contest clarifications are `ProblemClarification` rows on the
 * contest's problems (judge/views/blog.py:49).
 */
export const list = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<Clarification[] | null> => {
    const contest = await contestByKey(ctx, key);

    if (!contest) return null;

    const profile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);
    const current = profile?.currentParticipationId ? await ctx.db.get(profile.currentParticipationId) : null;
    const inThisContest = current?.contestId === contest._id;

    if (!inThisContest && contestAccessCheck(toContestRow(contest), viewer).kind !== "ok") {
      return null;
    }

    const problemListAccess = problemListAccessFor(contest, profile, viewer, inThisContest, Date.now());

    if (!problemListAccess.released) return [];

    const contestProblems = await loadContestProblems(ctx, contest._id);
    const problemViewer = await loadViewerContext(ctx);
    const out: Clarification[] = [];

    for (const [index, contestProblem] of contestProblems.entries()) {
      const problem = await ctx.db.get(contestProblem.problemId);

      if (!problem) continue;

      if (!problemListAccess.privileged && !(await canAccessProblem(ctx, problem, problemViewer))) continue;

      const rows = await ctx.db
        .query("problemClarifications")
        .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
        .collect();

      for (const row of rows) {
        out.push({
          _id: row._id,
          problemId: problem._id,
          problemCode: problem.code,
          problemName: problem.name,
          label: labelForProblem(contest, index),
          description: row.description,
          date: row.date,
        });
      }
    }

    return out.sort((a, b) => b.date - a.date);
  },
});

export const add = mutation({
  args: { key: v.string(), problemCode: v.string(), description: v.string() },
  handler: async (ctx, { key, problemCode, description }): Promise<Id<"problemClarifications">> => {
    const profile = await requireViewer(ctx);
    const contest = await contestByKey(ctx, key);

    if (!contest) throw notFound(`Contest "${key}"`);
    const viewer = await toViewerRowInContest(ctx, profile);

    if (!contestIsEditableBy(toContestRow(contest), viewer)) throw forbidden();

    const body = description.trim();

    if (!body) throw invalid("A clarification needs a body.");

    const problem = await ctx.db
      .query("problems")
      .withIndex("by_code", (q) => q.eq("code", problemCode))
      .unique();

    if (!problem) throw notFound(`Problem "${problemCode}"`);

    const contestProblems = await loadContestProblems(ctx, contest._id);

    if (!contestProblems.some((row) => row.problemId === problem._id)) {
      throw invalid(`"${problemCode}" is not in this contest.`);
    }

    return await ctx.db.insert("problemClarifications", {
      problemId: problem._id,
      description: body,
      date: Date.now(),
    });
  },
});
