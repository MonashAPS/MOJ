/**
 * Contest rankings: the `/contest/[key]/ranking/` table, the per-problem best
 * solutions view, and the recompute paths behind them.
 *
 * Ported from `ContestRanking` / `get_contest_ranking_list`
 * (judge/views/contests.py:702) and `RankedSubmissions`
 * (judge/views/ranked_submission.py). The scoring itself is the contest
 * format's, run through `applyFreeze` so a frozen board is computed from
 * pre-freeze submissions only.
 *
 * The users leaderboard lives in `convex/rankings.ts`; this module is contests
 * only.
 */

import {
  applyFreeze,
  type ContestProblemRow,
  contestAccessCheck,
  contestCanSeeFullScoreboard,
  contestCanSeeOwnScoreboard,
  contestIsEditableBy,
  type FrozenRankingRow,
  isFrozenFor,
  PARTICIPATION_LIVE,
  ranker,
} from "@moj/core";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import {
  contestByKey,
  contestSubmissionRows,
  formatFor,
  labelForProblem,
  loadContestProblems,
  toContestProblemRow,
  toContestRow,
  toParticipationRow,
  toViewerRowInContest,
} from "./contestFormats";
import type { OrganizationRef, ParticipationCell, UserRef } from "./contests";
import { safeDisplay } from "./contests";
import { optionalViewer, requireViewer } from "./lib/auth";
import { forbidden, notFound } from "./lib/errors";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export type RankingProblem = {
  contestProblemId: Id<"contestProblems">;
  problemId: Id<"problems">;
  label: string;
  code: string;
  name: string;
  points: number;
  isPretested: boolean;
};

export type RankingRow = {
  participationId: Id<"contestParticipations">;
  /** Null when the viewer may only see their own row, where DMOJ shows '???'. */
  rank: number | null;
  /** '???' for the own-row view, '-' for the viewer's running virtual row. */
  rankLabel: string;
  virtual: number;
  isDisqualified: boolean;
  isViewer: boolean;
  frozen: boolean;
  user: UserRef;
  organizations: OrganizationRef[];
  points: number;
  cumtime: number;
  tiebreaker: number;
  rating: number | null;
  result: { points: number; pointsText: string; cumtime: number; cumtimeText: string };
  problems: (ParticipationCell | null)[];
};

export type RankingPayload = {
  now: number;
  contest: {
    _id: Id<"contests">;
    key: string;
    name: string;
    formatName: string;
    freezeMinutes: number;
    pointsPrecision: number;
    startTime: number;
    endTime: number;
  };
  problems: RankingProblem[];
  rows: RankingRow[];
  totalRows: number;
  isDone: boolean;
  continueCursor: string;
  isFrozen: boolean;
  isRevealed: boolean;
  canSeeFullScoreboard: boolean;
  hasRating: boolean;
  canDisqualify: boolean;
} | null;

/* -------------------------------------------------------------------------- */
/* Ranking                                                                    */
/* -------------------------------------------------------------------------- */

async function organizationsOf(ctx: QueryCtx, profileId: Id<"profiles">): Promise<OrganizationRef[]> {
  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_profile", (q) => q.eq("profileId", profileId))
    .collect();
  const out: OrganizationRef[] = [];
  for (const membership of memberships) {
    const organization = await ctx.db.get(membership.organizationId);
    if (organization) {
      out.push({
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        shortName: organization.shortName,
      });
    }
  }
  return out;
}

/** Staff (or `view_contest_scoreboard`) have revealed the frozen board. */
export function contestIsRevealed(contest: Doc<"contests">): boolean {
  return contest.freezeRevealed === true || contest.isUnfrozen === true;
}

/**
 * `ContestRanking.get_ranking_list` (contests.py:762).
 *
 * The rows come from the contest format applied to each participation's
 * submissions, with `applyFreeze` cutting off post-freeze submissions for
 * anyone who may not see through the freeze.
 */
export const ranking = query({
  args: {
    key: v.string(),
    paginationOpts: v.optional(v.object({ numItems: v.number(), cursor: v.union(v.string(), v.null()) })),
    includeVirtual: v.optional(v.boolean()),
    includeSpectators: v.optional(v.boolean()),
    organizationSlug: v.optional(v.string()),
    classId: v.optional(v.id("classes")),
  },
  handler: async (ctx, args): Promise<RankingPayload> => {
    const now = Date.now();
    const contest = await contestByKey(ctx, args.key);
    if (!contest) return null;

    const profile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);
    const contestRow = toContestRow(contest);

    const current = profile?.currentParticipationId ? await ctx.db.get(profile.currentParticipationId) : null;
    const inThisContest = current?.contestId === contest._id;
    if (!inThisContest && contestAccessCheck(contestRow, viewer).kind !== "ok") return null;

    const allParticipations = await ctx.db
      .query("contestParticipations")
      .withIndex("by_contest_virtual_score", (q) => q.eq("contestId", contest._id))
      .collect();
    const liveParticipation =
      (profile
        ? allParticipations.find((row) => row.profileId === profile._id && row.virtual === PARTICIPATION_LIVE)
        : null) ?? null;

    const context = {
      now,
      liveParticipation: liveParticipation ? toParticipationRow(liveParticipation) : null,
    };
    if (!contestCanSeeOwnScoreboard(contestRow, viewer, context)) return null;
    const canSeeFull = contestCanSeeFullScoreboard(contestRow, viewer, context);

    const contestProblems = await loadContestProblems(ctx, contest._id);
    const problemRows: ContestProblemRow[] = contestProblems.map((row) => toContestProblemRow(row));
    const labels = contestProblems.map((_row, index) => labelForProblem(contest, index));

    const problems: RankingProblem[] = [];
    for (const [index, contestProblem] of contestProblems.entries()) {
      const problem = await ctx.db.get(contestProblem.problemId);
      problems.push({
        contestProblemId: contestProblem._id,
        problemId: contestProblem.problemId,
        label: labels[index] as string,
        code: problem?.code ?? "",
        name: problem?.name ?? "",
        points: contestProblem.points,
        isPretested: contestProblem.isPretested,
      });
    }

    // Which participations are in the table.
    let selected: Doc<"contestParticipations">[];
    if (!canSeeFull) {
      selected = liveParticipation ? [liveParticipation] : [];
    } else {
      selected = allParticipations.filter((row) => {
        if (row.virtual === PARTICIPATION_LIVE) return true;
        if (row.virtual > 0) return args.includeVirtual === true;
        return args.includeSpectators === true;
      });
    }

    // The viewer's own running virtual participation is shown above the table
    // with a '-' rank, as `get_contest_ranking_list` does.
    const currentVirtual =
      canSeeFull && current && current.contestId === contest._id && current.virtual !== 0 ? current : null;
    if (currentVirtual && !selected.some((row) => row._id === currentVirtual._id)) {
      selected = [...selected, currentVirtual];
    }

    const revealed = contestIsRevealed(contest);
    const frozenForViewer = isFrozenFor(contestRow, viewer, { now, revealed });

    const withSubmissions: { participation: Doc<"contestParticipations">; rows: FrozenRankingRow }[] = [];
    const freezeInput = [];
    for (const participation of selected) {
      freezeInput.push({
        participation: toParticipationRow(participation),
        submissions: await contestSubmissionRows(ctx, participation._id, contest.formatName),
      });
    }
    const frozenRows = applyFreeze(freezeInput, contestRow, viewer, {
      now,
      revealed,
      contestProblems: problemRows,
    });
    frozenRows.forEach((row, index) => {
      withSubmissions.push({ participation: selected[index] as Doc<"contestParticipations">, rows: row });
    });

    const ratingRows = await ctx.db
      .query("ratings")
      .withIndex("by_contest", (q) => q.eq("contestId", contest._id))
      .collect();
    const ratingByParticipation = new Map<string, number>();
    for (const row of ratingRows) ratingByParticipation.set(row.participationId, row.rating);

    const format = formatFor(contest);
    type Built = {
      row: RankingRow;
      sortKey: [number, number, number, number, number];
    };
    const built: Built[] = [];

    for (const entry of withSubmissions) {
      const participation = entry.participation;
      const profileDoc = await ctx.db.get(participation.profileId);
      if (!profileDoc) continue;

      // Organisation and class filters.
      if (args.organizationSlug || args.classId) {
        const memberships = await ctx.db
          .query("organizationMemberships")
          .withIndex("by_profile", (q) => q.eq("profileId", profileDoc._id))
          .collect();
        if (args.organizationSlug) {
          let matched = false;
          for (const membership of memberships) {
            const organization = await ctx.db.get(membership.organizationId);
            if (organization?.slug === args.organizationSlug) {
              matched = true;
              break;
            }
          }
          if (!matched) continue;
        }
        if (args.classId) {
          const klass = await ctx.db.get(args.classId);
          if (!klass?.memberProfileIds.includes(profileDoc._id)) continue;
        }
      }

      const update = entry.rows.update;
      // The disqualified score DMOJ writes on the row itself.
      const points = participation.isDisqualified ? -9999 : update.score;
      const cumtime = participation.isDisqualified ? 0 : update.cumtime;
      const tiebreaker = participation.isDisqualified ? 0 : update.tiebreaker;

      const scored = {
        ...toParticipationRow(participation),
        score: points,
        cumtime,
        tiebreaker,
        formatData: update.formatData,
      };

      const submissionCount = Object.keys(update.formatData).length;
      built.push({
        sortKey: [participation.isDisqualified ? 1 : 0, -points, cumtime, tiebreaker, -submissionCount],
        row: {
          participationId: participation._id,
          rank: 0,
          rankLabel: "",
          virtual: participation.virtual,
          isDisqualified: participation.isDisqualified,
          isViewer: !!profile && profileDoc._id === profile._id,
          frozen: entry.rows.frozen,
          user: {
            _id: profileDoc._id,
            username: profileDoc.username,
            displayName: profileDoc.usernameDisplayOverride || profileDoc.username,
            rating: profileDoc.rating ?? null,
            displayRank: profileDoc.displayRank,
          },
          organizations: await organizationsOf(ctx, profileDoc._id),
          points,
          cumtime,
          tiebreaker,
          rating: ratingByParticipation.get(participation._id) ?? null,
          result: format.displayParticipationResult(scored, contestRow),
          problems: problemRows.map((problem, index) => {
            const cell = safeDisplay(format, scored, problem, contestRow);
            if (!cell) return null;
            return {
              contestProblemId: problem.id as Id<"contestProblems">,
              label: labels[index] as string,
              state: cell.state,
              points: cell.points,
              pointsText: cell.pointsText,
              timeText: cell.timeText,
              penalty: cell.penalty,
              penaltyText: cell.penaltyText,
              bonus: cell.bonus,
              bonusText: cell.bonusText,
            };
          }),
        },
      });
    }

    built.sort((a, b) => {
      for (let i = 0; i < a.sortKey.length; i++) {
        const delta = (a.sortKey[i] as number) - (b.sortKey[i] as number);
        if (delta !== 0) return delta;
      }
      return 0;
    });

    // The viewer's running virtual row is pulled out and shown first.
    const virtualRows = currentVirtual
      ? built.filter((entry) => entry.row.participationId === currentVirtual._id)
      : [];
    const tableRows = built.filter(
      (entry) => !virtualRows.some((row) => row.row.participationId === entry.row.participationId),
    );

    const ranked = ranker(
      tableRows.map((entry) => entry.row),
      (row) => `${row.points}/${row.cumtime}/${row.tiebreaker}`,
    );
    for (const { rank, item } of ranked) {
      item.rank = canSeeFull ? rank : null;
      item.rankLabel = canSeeFull ? String(rank) : "???";
    }
    for (const entry of virtualRows) {
      entry.row.rank = null;
      entry.row.rankLabel = "-";
    }

    const ordered = [...virtualRows.map((entry) => entry.row), ...ranked.map((entry) => entry.item)];

    const numItems = Math.max(1, Math.min(args.paginationOpts?.numItems ?? 500, 1000));
    const offset = Number.parseInt(args.paginationOpts?.cursor ?? "0", 10) || 0;
    const page = ordered.slice(offset, offset + numItems);

    return {
      now,
      contest: {
        _id: contest._id,
        key: contest.key,
        name: contest.name,
        formatName: contest.formatName,
        freezeMinutes: contest.freezeMinutes,
        pointsPrecision: contest.pointsPrecision,
        startTime: contest.startTime,
        endTime: contest.endTime,
      },
      problems,
      rows: page,
      totalRows: ordered.length,
      isDone: offset + numItems >= ordered.length,
      continueCursor: String(offset + numItems),
      isFrozen: frozenForViewer,
      isRevealed: revealed,
      canSeeFullScoreboard: canSeeFull,
      hasRating: ratingRows.length > 0,
      canDisqualify: contestIsEditableBy(contestRow, viewer),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Best solutions for one contest problem                                     */
/* -------------------------------------------------------------------------- */

export type RankedSubmissionRow = {
  submissionId: Id<"submissions">;
  user: UserRef;
  points: number;
  time: number | null;
  memory: number | null;
  languageName: string;
  languageKey: string;
  result: string | null;
  date: number;
};

export type RankByProblemPayload = {
  contestKey: string;
  contestName: string;
  problemCode: string;
  problemName: string;
  label: string;
  rows: RankedSubmissionRow[];
} | null;

/**
 * `ContestRankedSubmission` (judge/views/ranked_submission.py:80): each user's
 * best contest submission for one problem, highest points first and, within
 * the same points, fastest first.
 */
export const rankByProblem = query({
  args: { key: v.string(), problemCode: v.string(), languageKeys: v.optional(v.array(v.string())) },
  handler: async (ctx, { key, problemCode, languageKeys }): Promise<RankByProblemPayload> => {
    const contest = await contestByKey(ctx, key);
    if (!contest) return null;

    const profile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);
    const contestRow = toContestRow(contest);
    if (contestAccessCheck(contestRow, viewer).kind !== "ok") return null;

    const now = Date.now();
    const liveParticipation = profile
      ? ((
          await ctx.db
            .query("contestParticipations")
            .withIndex("by_profile_contest", (q) =>
              q.eq("profileId", profile._id).eq("contestId", contest._id),
            )
            .collect()
        ).find((row) => row.virtual === PARTICIPATION_LIVE) ?? null)
      : null;
    const context = {
      now,
      liveParticipation: liveParticipation ? toParticipationRow(liveParticipation) : null,
    };
    if (!contestCanSeeFullScoreboard(contestRow, viewer, context)) return null;

    const problem = await ctx.db
      .query("problems")
      .withIndex("by_code", (q) => q.eq("code", problemCode))
      .unique();
    if (!problem) return null;

    const contestProblems = await loadContestProblems(ctx, contest._id);
    const index = contestProblems.findIndex((row) => row.problemId === problem._id);
    if (index === -1) return null;

    const wanted = languageKeys && languageKeys.length > 0 ? new Set(languageKeys) : null;

    const submissions = (
      await ctx.db
        .query("submissions")
        .withIndex("by_contest_date", (q) => q.eq("contestId", contest._id))
        .collect()
    ).filter((row) => row.problemId === problem._id && !row.isArchived);

    const best = new Map<string, Doc<"submissions">>();
    for (const submission of submissions) {
      const points = submission.contestPoints ?? 0;
      if (points <= 0) continue;
      const language = await ctx.db.get(submission.languageId);
      if (wanted && (!language || !wanted.has(language.key))) continue;

      const currentBest = best.get(submission.profileId);
      if (!currentBest) {
        best.set(submission.profileId, submission);
        continue;
      }
      const bestPoints = currentBest.contestPoints ?? 0;
      if (points > bestPoints) {
        best.set(submission.profileId, submission);
      } else if (
        points === bestPoints &&
        (submission.time ?? Number.POSITIVE_INFINITY) < (currentBest.time ?? Number.POSITIVE_INFINITY)
      ) {
        best.set(submission.profileId, submission);
      }
    }

    const rows: RankedSubmissionRow[] = [];
    for (const submission of best.values()) {
      const owner = await ctx.db.get(submission.profileId);
      if (!owner || owner.isUnlisted) continue;
      const language = await ctx.db.get(submission.languageId);
      rows.push({
        submissionId: submission._id,
        user: {
          _id: owner._id,
          username: owner.username,
          displayName: owner.usernameDisplayOverride || owner.username,
          rating: owner.rating ?? null,
          displayRank: owner.displayRank,
        },
        points: submission.contestPoints ?? 0,
        time: submission.time ?? null,
        memory: submission.memory ?? null,
        languageName: language?.name ?? "",
        languageKey: language?.key ?? "",
        result: submission.result ?? null,
        date: submission.date,
      });
    }

    rows.sort(
      (a, b) =>
        b.points - a.points ||
        (a.time ?? Number.POSITIVE_INFINITY) - (b.time ?? Number.POSITIVE_INFINITY) ||
        a.date - b.date,
    );

    return {
      contestKey: contest.key,
      contestName: contest.name,
      problemCode: problem.code,
      problemName: problem.name,
      label: labelForProblem(contest, index),
      rows,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Recompute                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `ContestParticipation.recompute_results` (contest.py:529): run the contest
 * format over the participation's submissions and write the result back.
 * A disqualified participation is pinned to DMOJ's sentinel score.
 */
export async function recompute(
  ctx: MutationCtx,
  participationId: Id<"contestParticipations">,
): Promise<void> {
  const participation = await ctx.db.get(participationId);
  if (!participation) return;
  const contest = await ctx.db.get(participation.contestId);
  if (!contest) return;

  const contestProblems = (await loadContestProblems(ctx, contest._id)).map((row) =>
    toContestProblemRow(row),
  );
  const submissions = await contestSubmissionRows(ctx, participationId, contest.formatName);
  const format = formatFor(contest);

  const update = format.updateParticipation({
    participation: toParticipationRow(participation),
    submissions,
    contestProblems,
    contest: toContestRow(contest),
  });

  if (participation.isDisqualified) {
    await ctx.db.patch(participationId, {
      score: -9999,
      cumtime: 0,
      tiebreaker: 0,
      formatData: update.formatData,
    });
    return;
  }

  await ctx.db.patch(participationId, {
    score: update.score,
    cumtime: update.cumtime,
    tiebreaker: update.tiebreaker,
    formatData: update.formatData,
  });
}

/** Called by the judging path and by the rescore job. */
export const recomputeParticipation = internalMutation({
  args: { participationId: v.id("contestParticipations") },
  handler: async (ctx, { participationId }): Promise<null> => {
    await recompute(ctx, participationId);
    return null;
  },
});

export const RESCORE_CHUNK = 25;

/**
 * `rescore_contest` (judge/tasks/contest.py:14) as a chunked job: the runner
 * lives in `convex/jobsContests.ts` and walks the participations in batches.
 */
export const rescoreContest = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<{ jobId: Id<"jobs">; total: number }> => {
    const profile = await requireViewer(ctx);
    const contest = await contestByKey(ctx, key);
    if (!contest) throw notFound(`Contest "${key}"`);
    const viewer = await toViewerRowInContest(ctx, profile);
    if (!contestIsEditableBy(toContestRow(contest), viewer)) throw forbidden();

    const participations = await ctx.db
      .query("contestParticipations")
      .withIndex("by_contest_virtual_score", (q) => q.eq("contestId", contest._id))
      .collect();

    const jobId = await ctx.db.insert("jobs", {
      type: "rescore",
      status: "queued",
      progress: { done: 0, total: participations.length, stage: "Recalculating contest scores" },
      args: { contestId: contest._id, key: contest.key },
      createdByProfileId: profile._id,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.jobsContests.rescoreChunk, {
      jobId,
      contestId: contest._id,
      cursor: 0,
    });

    return { jobId, total: participations.length };
  },
});
