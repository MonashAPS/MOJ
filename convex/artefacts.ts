/**
 * Files attached to a contest or a problem: what a viewer may see of them, and
 * where to fetch one. Staff manage them in admin/artefacts.ts.
 */

import {
  type AudienceMembership,
  artefactIsVisible,
  contestAccessCheck,
  contestIsEditableBy,
  problemIsEditableBy,
} from "@moj/core";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { artefactsOfContest, artefactsOfProblem } from "./artefacts/names";
import { contestByKey, toContestRow, toViewerRowInContest } from "./contests/formats";
import { optionalViewer } from "./lib/auth";
import { canAccessProblem, loadViewerContext, problemByCode, toCoreProblem } from "./problems";

export type ArtefactRow = {
  id: Doc<"artefacts">["_id"];
  name: string;
  size: number;
  contentType: string;
  audiences: Doc<"artefacts">["audiences"];
  from: Doc<"artefacts">["from"];
  uploadedAt: number;
};

/** Which audiences the viewer is in, and whether the owner's clock has run out. */
type Standing = { membership: AudienceMembership; ended: boolean };

/** The viewer's standing on a contest, from its people lists, their participation and its access rules. */
export async function contestStanding(ctx: QueryCtx, contest: Doc<"contests">): Promise<Standing> {
  const profile = await optionalViewer(ctx);
  const viewer = await toViewerRowInContest(ctx, profile);
  const row = toContestRow(contest);

  const participation = profile
    ? await ctx.db
        .query("contestParticipations")
        .withIndex("by_contest_profile", (q) => q.eq("contestId", contest._id).eq("profileId", profile._id))
        .first()
    : null;

  return {
    membership: {
      staff: contestIsEditableBy(row, viewer),
      testers: profile !== null && contest.testerProfileIds.includes(profile._id),
      spectators: profile !== null && contest.spectatorProfileIds.includes(profile._id),
      contestants: participation !== null,
      everyone: contestAccessCheck(row, viewer).kind === "ok",
    },
    ended: contest.endTime <= Date.now(),
  };
}

/** The viewer's standing on a problem. It has no contest to join or watch. */
export async function problemStanding(ctx: QueryCtx, problem: Doc<"problems">): Promise<Standing> {
  const viewer = await loadViewerContext(ctx);
  const profileId = viewer.profile?._id;

  return {
    membership: {
      staff: problemIsEditableBy(toCoreProblem(problem), viewer.core),
      testers: profileId !== undefined && problem.testerProfileIds.includes(profileId),
      spectators: false,
      contestants: false,
      everyone: await canAccessProblem(ctx, problem, viewer),
    },
    ended: false,
  };
}

/** The standing for whatever a file is attached to, or null when that is gone. */
async function standingOf(ctx: QueryCtx, artefact: Doc<"artefacts">): Promise<Standing | null> {
  if (artefact.owner.kind === "contest") {
    const contest = await ctx.db.get(artefact.owner.contestId);

    return contest ? await contestStanding(ctx, contest) : null;
  }

  const problem = await ctx.db.get(artefact.owner.problemId);

  return problem ? await problemStanding(ctx, problem) : null;
}

function toRow(artefact: Doc<"artefacts">): ArtefactRow {
  return {
    id: artefact._id,
    name: artefact.name,
    size: artefact.size,
    contentType: artefact.contentType,
    audiences: artefact.audiences,
    from: artefact.from,
    uploadedAt: artefact.uploadedAt,
  };
}

function visibleRows(rows: readonly Doc<"artefacts">[], standing: Standing): ArtefactRow[] {
  return rows
    .filter((row) => artefactIsVisible(row, standing.membership, standing.ended))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toRow);
}

/** The files this viewer may download from a contest. An empty list for a contest they cannot see. */
export const forContest = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<ArtefactRow[]> => {
    const contest = await contestByKey(ctx, key);

    if (!contest) return [];

    return visibleRows(await artefactsOfContest(ctx, contest._id), await contestStanding(ctx, contest));
  },
});

/** The files this viewer may download from a problem. */
export const forProblem = query({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<ArtefactRow[]> => {
    const problem = await problemByCode(ctx, code);

    if (!problem) return [];

    return visibleRows(await artefactsOfProblem(ctx, problem._id), await problemStanding(ctx, problem));
  },
});

/** Where to fetch one file from, or null when the viewer may not. */
export const download = query({
  args: { id: v.id("artefacts") },
  handler: async (
    ctx,
    { id },
  ): Promise<{ url: string; name: string; contentType: string; size: number } | null> => {
    const artefact = await ctx.db.get(id);

    if (!artefact) return null;
    const standing = await standingOf(ctx, artefact);

    if (!standing || !artefactIsVisible(artefact, standing.membership, standing.ended)) return null;
    const url = await ctx.storage.getUrl(artefact.storageId);

    if (!url) return null;

    return { url, name: artefact.name, contentType: artefact.contentType, size: artefact.size };
  },
});
