/**
 * The hall scoreboard's event feed (`/scoreboard/[event]`).
 *
 * `convex/scoreboard.ts` answers the grid; this answers the sidebar the fork
 * calls the event feed (`live_scoreboard.py`'s `events` block, one list per
 * division, merged newest-first by the page). It is a separate subscription so
 * a feed that is closed costs nothing, and so a submission landing does not
 * rebuild the whole board payload.
 *
 * The freeze applies here too: `classifyEvent` reads anything at or after the
 * freeze point as pending for everyone, staff included, so the sidebar cannot
 * spoil the frozen grid or the reveal.
 */

import { type Attempt, classifyEvent, freezeOffsetFor } from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { type QueryCtx, query } from "../_generated/server";
import { labelForProblem, loadContestProblems } from "../contestFormats";
import { isStaff, optionalViewer } from "../lib/auth";

const LIVE = 0;
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

/** Submissions read per division before filtering. */
const SCAN = 400;

export type FeedItem = {
  id: string;
  divisionKey: string;
  divisionName: string;
  /** Wall clock, so the hall can read it against the clock on the wall. */
  at: number;
  /** Contest minute, which is what the grid counts in. */
  minute: number;
  username: string;
  displayName: string;
  problem: string;
  problemName: string;
  state: string;
  /** Withheld while the entry is masked by the freeze. */
  verdict: string | null;
  masked: boolean;
};

async function eventByKey(ctx: QueryCtx, key: string): Promise<Doc<"scoreboardEvents"> | null> {
  return await ctx.db
    .query("scoreboardEvents")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

async function divisionFeed(
  ctx: QueryCtx,
  contest: Doc<"contests">,
  eventFreezeMinutes: number,
  limit: number,
): Promise<FeedItem[]> {
  const freezeMinutes = contest.freezeRevealed ? 0 : eventFreezeMinutes;
  const freezeOffset = freezeOffsetFor(contest, freezeMinutes);

  const contestProblems = await loadContestProblems(ctx, contest._id);
  const labels = new Map<string, { label: string; name: string }>();
  for (const [index, contestProblem] of contestProblems.entries()) {
    const problem = await ctx.db.get(contestProblem.problemId);
    labels.set(contestProblem._id, {
      label: labelForProblem(contest, index),
      name: problem?.name ?? "",
    });
  }

  const participations = await ctx.db
    .query("contestParticipations")
    .withIndex("by_contest_virtual_score", (q) => q.eq("contestId", contest._id).eq("virtual", LIVE))
    .collect();
  const live = new Map<string, Doc<"contestParticipations">>();
  for (const participation of participations) {
    if (!participation.isDisqualified) live.set(participation._id, participation);
  }

  const submissions = await ctx.db
    .query("submissions")
    .withIndex("by_contest_date", (q) => q.eq("contestId", contest._id))
    .order("desc")
    .take(SCAN);

  const names = new Map<string, { username: string; displayName: string }>();
  const items: FeedItem[] = [];

  for (const submission of submissions) {
    if (items.length >= limit) break;
    if (!submission.participationId || !live.has(submission.participationId)) continue;
    if (!submission.contestProblemId) continue;
    const problem = labels.get(submission.contestProblemId);
    if (!problem) continue;
    if (submission.date < contest.startTime || submission.date > contest.endTime) continue;

    const participation = live.get(submission.participationId) as Doc<"contestParticipations">;
    let who = names.get(participation.profileId);
    if (!who) {
      const profile = await ctx.db.get(participation.profileId);
      if (!profile) continue;
      who = {
        username: profile.username,
        displayName: profile.usernameDisplayOverride || profile.username,
      };
      names.set(participation.profileId, who);
    }

    const attempt: Attempt = {
      participation: submission.participationId,
      problem: submission.contestProblemId,
      time: (submission.date - contest.startTime) / 1000,
      points: submission.contestPoints ?? 0,
      result: submission.result ?? null,
      maxPoints: 0,
    };
    const [state, masked] = classifyEvent(attempt, freezeOffset);

    items.push({
      id: submission._id,
      divisionKey: contest.key,
      divisionName: contest.name,
      at: submission.date,
      minute: Math.floor(attempt.time / 60),
      username: who.username,
      displayName: who.displayName,
      problem: problem.label,
      problemName: problem.name,
      state,
      verdict: masked ? null : (submission.result ?? null),
      masked,
    });
  }

  return items;
}

/**
 * Recent submissions across every division of one event, newest first.
 *
 * Public exactly as `scoreboard.event` is: the hall URL is public the moment
 * the event is configured, and a private event is staff-only.
 */
export const feed = query({
  args: { key: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { key, limit }): Promise<FeedItem[]> => {
    const row = await eventByKey(ctx, key);
    if (!row) return [];

    const profile = await optionalViewer(ctx);
    if (!row.isPublic && !isStaff(profile)) return [];

    const cap = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? DEFAULT_LIMIT)));

    const items: FeedItem[] = [];
    for (const id of row.contestIds as Id<"contests">[]) {
      const contest = await ctx.db.get(id);
      if (!contest) continue;
      items.push(...(await divisionFeed(ctx, contest, row.freezeMinutes, cap)));
    }

    // Ties break on the submission id, so the order is stable between updates.
    items.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    return items.slice(0, cap);
  },
});
