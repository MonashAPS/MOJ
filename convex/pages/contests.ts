/**
 * Page-level reads the contest pages need on top of `convex/contests.ts` and
 * `convex/contestRankings.ts`.
 *
 * Everything here is presentation plumbing: the tag page's own header, the
 * filter options the ranking page offers, the per-cell pending marks SPEC
 * section 7 asks for while a scoreboard is frozen, and the MOSS delete the
 * `/contest/[key]/moss` page needs.
 */

import {
  contestAccessCheck,
  contestCanSeeFullScoreboard,
  contestIsEditableBy,
  freezeTime,
  hasPerm,
  isFrozenFor,
  PARTICIPATION_LIVE,
} from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, type QueryCtx, query } from "../_generated/server";
import { contestByKey, loadContestProblems, toContestRow, toParticipationRow } from "../contestFormats";
import { contestIsRevealed } from "../contestRankings";
import { toViewerRowInContest } from "../contestFormats";
import { optionalViewer, requireViewer } from "../lib/auth";
import { forbidden, notFound } from "../lib/errors";

/* -------------------------------------------------------------------------- */
/* Tags                                                                       */
/* -------------------------------------------------------------------------- */

export type ContestTagPayload = {
  _id: Id<"contestTags">;
  name: string;
  color: string;
  /** Black or white, whichever reads on `color`; DMOJ computes the same thing. */
  textColor: string;
  description: string;
} | null;

/** `ContestTag.text_color` (judge/models/contest.py): luma over 0.5 goes black. */
export function tagTextColor(color: string): string {
  const hex = color.replace("#", "");
  if (hex.length !== 3 && hex.length !== 6) return "#000000";
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;
  const red = Number.parseInt(full.slice(0, 2), 16) / 255;
  const green = Number.parseInt(full.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(full.slice(4, 6), 16) / 255;
  if (!Number.isFinite(red + green + blue)) return "#000000";
  return 0.299 * red + 0.587 * green + 0.114 * blue > 0.5 ? "#000000" : "#ffffff";
}

/** `ContestTagDetail` (contests.py:902): the tag chip and its description. */
export const tag = query({
  args: { name: v.string() },
  handler: async (ctx, { name }): Promise<ContestTagPayload> => {
    const row = await ctx.db
      .query("contestTags")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (!row) return null;
    return {
      _id: row._id,
      name: row.name,
      color: row.color,
      textColor: tagTextColor(row.color),
      description: row.description,
    };
  },
});

/** Every tag in use, for the contest list's tag filter. */
export const tags = query({
  args: {},
  handler: async (ctx): Promise<NonNullable<ContestTagPayload>[]> => {
    const rows = await ctx.db.query("contestTags").collect();
    return rows
      .map((row) => ({
        _id: row._id,
        name: row.name,
        color: row.color,
        textColor: tagTextColor(row.color),
        description: row.description,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/* -------------------------------------------------------------------------- */
/* Ranking filters                                                            */
/* -------------------------------------------------------------------------- */

export type RankingFilters = {
  organizations: { _id: Id<"organizations">; name: string; shortName: string; slug: string }[];
  classes: { _id: Id<"classes">; name: string; slug: string; organizationName: string }[];
} | null;

async function accessibleContest(ctx: QueryCtx, key: string): Promise<Doc<"contests"> | null> {
  const contest = await contestByKey(ctx, key);
  if (!contest) return null;
  const profile = await optionalViewer(ctx);
  const viewer = await toViewerRowInContest(ctx, profile);
  const current = profile?.currentParticipationId ? await ctx.db.get(profile.currentParticipationId) : null;
  if (current?.contestId === contest._id) return contest;
  return contestAccessCheck(toContestRow(contest), viewer).kind === "ok" ? contest : null;
}

/**
 * The organisations that actually have someone on this scoreboard, and the
 * classes the contest is restricted to. Both drive the ranking page's filters,
 * so an empty list means the control is not offered at all.
 */
export const rankingFilters = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<RankingFilters> => {
    const contest = await accessibleContest(ctx, key);
    if (!contest) return null;

    const participations = await ctx.db
      .query("contestParticipations")
      .withIndex("by_contest_virtual_score", (q) => q.eq("contestId", contest._id))
      .collect();

    const organizations = new Map<
      string,
      { _id: Id<"organizations">; name: string; shortName: string; slug: string }
    >();
    const seenProfiles = new Set<string>();
    for (const participation of participations) {
      if (seenProfiles.has(participation.profileId)) continue;
      seenProfiles.add(participation.profileId);
      const memberships = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_profile", (q) => q.eq("profileId", participation.profileId))
        .collect();
      for (const membership of memberships) {
        if (organizations.has(membership.organizationId)) continue;
        const organization = await ctx.db.get(membership.organizationId);
        if (!organization) continue;
        organizations.set(organization._id, {
          _id: organization._id,
          name: organization.name,
          shortName: organization.shortName,
          slug: organization.slug,
        });
      }
    }

    const classes: NonNullable<RankingFilters>["classes"] = [];
    for (const id of contest.classIds) {
      const row = await ctx.db.get(id);
      if (!row) continue;
      const organization = await ctx.db.get(row.organizationId);
      classes.push({
        _id: row._id,
        name: row.name,
        slug: row.slug,
        organizationName: organization?.name ?? "",
      });
    }

    return {
      organizations: [...organizations.values()].sort((a, b) => a.name.localeCompare(b.name)),
      classes: classes.sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Frozen cells                                                               */
/* -------------------------------------------------------------------------- */

export type FrozenCells = {
  /** The freeze point, so the page can name it. */
  frozenAt: number;
  /** One entry per cell that has a submission the freeze is withholding. */
  cells: {
    participationId: Id<"contestParticipations">;
    contestProblemId: Id<"contestProblems">;
    pending: number;
  }[];
} | null;

/**
 * SPEC section 7: a submission made after the freeze point renders as pending
 * (`?`) rather than as nothing at all.
 *
 * `contestRankings.ranking` scores a frozen board from pre-freeze submissions,
 * which is what the ranking needs but leaves a post-freeze solve looking
 * identical to an untouched problem. This says which cells are withholding an
 * answer — the count of attempts, never their verdicts — and returns null
 * whenever the board is not frozen for this viewer, so nothing leaks.
 */
export const frozenCells = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<FrozenCells> => {
    const contest = await accessibleContest(ctx, key);
    if (!contest) return null;

    const now = Date.now();
    const profile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);
    const contestRow = toContestRow(contest);

    const cutoff = freezeTime(contestRow);
    if (cutoff === null) return null;
    if (!isFrozenFor(contestRow, viewer, { now, revealed: contestIsRevealed(contest) })) return null;

    const participations = await ctx.db
      .query("contestParticipations")
      .withIndex("by_contest_virtual_score", (q) => q.eq("contestId", contest._id))
      .collect();
    const live = participations.filter((row) => row.virtual === PARTICIPATION_LIVE);

    const liveOfViewer =
      (profile ? live.find((row) => row.profileId === profile._id) : null) ?? null;
    if (
      !contestCanSeeFullScoreboard(contestRow, viewer, {
        now,
        liveParticipation: liveOfViewer ? toParticipationRow(liveOfViewer) : null,
      })
    ) {
      // The own-row view still wants its own pending marks.
      if (!liveOfViewer) return { frozenAt: cutoff, cells: [] };
    }

    const contestProblems = await loadContestProblems(ctx, contest._id);
    const known = new Set<string>(contestProblems.map((row) => row._id));

    const counts = new Map<string, number>();
    for (const participation of live) {
      const submissions = await ctx.db
        .query("submissions")
        .withIndex("by_participation", (q) => q.eq("participationId", participation._id))
        .collect();
      for (const submission of submissions) {
        if (submission.date < cutoff) continue;
        const contestProblemId = submission.contestProblemId;
        if (!contestProblemId || !known.has(contestProblemId)) continue;
        const cellKey = `${participation._id}|${contestProblemId}`;
        counts.set(cellKey, (counts.get(cellKey) ?? 0) + 1);
      }
    }

    return {
      frozenAt: cutoff,
      cells: [...counts.entries()].map(([cellKey, pending]) => {
        const [participationId, contestProblemId] = cellKey.split("|");
        return {
          participationId: participationId as Id<"contestParticipations">,
          contestProblemId: contestProblemId as Id<"contestProblems">,
          pending,
        };
      }),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* MOSS                                                                       */
/* -------------------------------------------------------------------------- */

/** `ContestMossDelete` (contests.py:880). */
export const deleteMossResults = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<{ deleted: number }> => {
    const profile = await requireViewer(ctx);
    const contest = await contestByKey(ctx, key);
    if (!contest) throw notFound(`Contest "${key}"`);

    const viewer = await toViewerRowInContest(ctx, profile);
    if (!hasPerm(viewer, "judge.moss_contest") || !contestIsEditableBy(toContestRow(contest), viewer)) {
      throw forbidden();
    }

    const rows = await ctx.db
      .query("contestMoss")
      .withIndex("by_contest", (q) => q.eq("contestId", contest._id))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length };
  },
});
