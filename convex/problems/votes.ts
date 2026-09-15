/**
 * The points a user proposes for a problem: DMOJ's `ProblemPointsVote` and the
 * `problem_vote` views. Who may vote and who may see the tally are rules in
 * `@moj/core`; this is the plumbing.
 */

import { voteCanView, voteCanVote, votePermissionForUser } from "@moj/core";
import { v } from "convex/values";
import { mutation, type QueryCtx, query } from "../_generated/server";
import { requireViewer } from "../lib/auth";
import { forbidden, invalid, notFound } from "../lib/errors";
import {
  canAccessProblem,
  loadViewerContext,
  problemByCode,
  requireProblem,
  solveSetsFor,
  toCoreProblem,
} from "../problems";

export const MIN_USER_POINTS_VOTE = 1;

export const MAX_USER_POINTS_VOTE = 50;

async function voteContext(ctx: QueryCtx, code: string) {
  const problem = await requireProblem(ctx, code);
  const viewer = await loadViewerContext(ctx);

  if (!(await canAccessProblem(ctx, problem, viewer))) throw notFound("Problem");
  const sets = await solveSetsFor(ctx, viewer);

  const permission = votePermissionForUser(toCoreProblem(problem), viewer.core, {
    hasSolvedProblem: sets.solved.has(problem._id),
  });

  return { problem, viewer, permission };
}

export const vote = mutation({
  args: { code: v.string(), points: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, { code, points, note }) => {
    const profile = await requireViewer(ctx);
    const { problem, permission } = await voteContext(ctx, code);

    if (!voteCanVote(permission)) {
      throw forbidden("Not allowed to vote on this problem.");
    }

    if (!Number.isInteger(points)) {
      throw invalid("Proposed points must be a whole number.");
    }

    if (points < MIN_USER_POINTS_VOTE || points > MAX_USER_POINTS_VOTE) {
      throw invalid(`Proposed points must be between ${MIN_USER_POINTS_VOTE} and ${MAX_USER_POINTS_VOTE}.`);
    }

    const body = note ?? "";

    if (body.length > 8192) throw invalid("The note is too long.");

    // DMOJ deletes any pre-existing vote inside the transaction, then inserts.
    const existing = await ctx.db
      .query("problemPointsVotes")
      .withIndex("by_voter_problem", (q) => q.eq("voterProfileId", profile._id).eq("problemId", problem._id))
      .unique();

    if (existing) await ctx.db.delete(existing._id);

    await ctx.db.insert("problemPointsVotes", {
      points,
      voterProfileId: profile._id,
      problemId: problem._id,
      voteTime: Date.now(),
      note: body,
    });

    return { points };
  },
});

export const deleteVote = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const profile = await requireViewer(ctx);
    const { problem, permission } = await voteContext(ctx, code);

    if (!voteCanVote(permission)) {
      throw forbidden("Not allowed to delete votes on this problem.");
    }

    const existing = await ctx.db
      .query("problemPointsVotes")
      .withIndex("by_voter_problem", (q) => q.eq("voterProfileId", profile._id).eq("problemId", problem._id))
      .unique();

    if (existing) await ctx.db.delete(existing._id);

    return { ok: true };
  },
});

export const voteStats = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const problem = await problemByCode(ctx, code);

    if (!problem) return null;
    const viewer = await loadViewerContext(ctx);

    if (!(await canAccessProblem(ctx, problem, viewer))) return null;

    const sets = await solveSetsFor(ctx, viewer);

    const permission = votePermissionForUser(toCoreProblem(problem), viewer.core, {
      hasSolvedProblem: sets.solved.has(problem._id),
    });

    if (!voteCanView(permission)) return null;

    const rows = await ctx.db
      .query("problemPointsVotes")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect();

    const votes = rows.map((row) => row.points).sort((a, b) => a - b);

    let meanValue: number | null = null;
    let medianValue: number | null = null;

    if (votes.length > 0) {
      meanValue = votes.reduce((sum, value) => sum + value, 0) / votes.length;
      const mid = Math.floor(votes.length / 2);
      const upper = votes[mid] ?? 0;
      medianValue = votes.length % 2 === 1 ? upper : ((votes[mid - 1] ?? upper) + upper) / 2;
    }

    return {
      votes,
      mean: meanValue,
      median: medianValue,
      minPossibleVote: MIN_USER_POINTS_VOTE,
      maxPossibleVote: MAX_USER_POINTS_VOTE,
      currentPoints: problem.points,
    };
  },
});
