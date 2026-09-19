/**
 * Publishing a contest's problems once it ends.
 *
 * A contest that asks for it makes every problem it holds public the moment
 * it is over, so the problems go straight into the practice set without
 * somebody remembering to flip each one. A problem still in use by a contest
 * that has not ended stays private, and the revision says so.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { scheduleJob, writeProblemRevision } from "../admin/problems";
import { writeRevision } from "../lib/community";
import { loadContestProblems } from "./formats";
import { snapshotContest } from "./snapshot";

/** Whether some other contest holding this problem is still to come or under way. */
async function heldByLiveContest(
  ctx: MutationCtx,
  problemId: Id<"problems">,
  except: Id<"contests">,
  now: number,
): Promise<boolean> {
  const links = await ctx.db
    .query("contestProblems")
    .withIndex("by_problem", (q) => q.eq("problemId", problemId))
    .collect();

  for (const link of links) {
    if (link.contestId === except) continue;
    const other = await ctx.db.get(link.contestId);

    if (other && other.endTime > now) return true;
  }

  return false;
}

/**
 * Make the contest's problems public and record it on the contest. The
 * profile is whoever caused it; the sweep passes none.
 */
export async function publishContestProblems(
  ctx: MutationCtx,
  contest: Doc<"contests">,
  now: number,
  byProfileId?: Id<"profiles">,
): Promise<{ published: string[]; held: string[] }> {
  const published: string[] = [];
  const held: string[] = [];

  for (const link of await loadContestProblems(ctx, contest._id)) {
    const problem = await ctx.db.get(link.problemId);

    if (!problem || problem.isPublic) continue;

    if (await heldByLiveContest(ctx, problem._id, contest._id, now)) {
      held.push(problem.code);
      continue;
    }

    await ctx.db.patch(problem._id, { isPublic: true });
    await writeProblemRevision(ctx, problem._id, byProfileId, `Published when contest ${contest.key} ended`);
    // Points only count for public problems, as when staff flip one by hand.
    await scheduleJob(ctx, "rescore", { problemCode: problem.code }, byProfileId);
    published.push(problem.code);
  }

  await ctx.db.patch(contest._id, { problemsPublishedAt: now });

  const reason =
    held.length === 0
      ? `Published ${published.length} problems at the end of the contest`
      : `Published ${published.length} problems at the end of the contest; ${held.join(", ")} still in use by a contest that has not ended`;

  await writeRevision(
    ctx,
    "contest",
    contest._id,
    await snapshotContest(ctx, contest._id),
    byProfileId,
    reason,
  );

  return { published, held };
}
