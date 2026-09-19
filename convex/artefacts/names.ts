/**
 * The files attached to a contest or a problem, as a revision snapshot lists
 * them: name and audience, so a diff says which file came or went.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function artefactsOfContest(
  ctx: QueryCtx,
  contestId: Id<"contests">,
): Promise<Doc<"artefacts">[]> {
  return await ctx.db
    .query("artefacts")
    .withIndex("by_contest", (q) => q.eq("owner.contestId", contestId))
    .collect();
}

export async function artefactsOfProblem(
  ctx: QueryCtx,
  problemId: Id<"problems">,
): Promise<Doc<"artefacts">[]> {
  return await ctx.db
    .query("artefacts")
    .withIndex("by_problem", (q) => q.eq("owner.problemId", problemId))
    .collect();
}

export function artefactSnapshot(rows: readonly Doc<"artefacts">[]): { name: string; visibility: string }[] {
  return rows
    .map((row) => ({ name: row.name, visibility: row.visibility }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
