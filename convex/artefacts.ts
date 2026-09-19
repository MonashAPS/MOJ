/**
 * Files attached to a contest or a problem: what a viewer may see of them, and
 * where to fetch one. Staff manage them in admin/artefacts.ts.
 */

import { artefactIsVisible, contestAccessCheck, contestIsEditableBy, problemIsEditableBy } from "@moj/core";
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
  visibility: Doc<"artefacts">["visibility"];
  uploadedAt: number;
};

/** Who the viewer is to the thing a file is attached to. */
type Audience = { canEdit: boolean; canView: boolean; ended: boolean };

async function contestAudience(ctx: QueryCtx, contest: Doc<"contests">): Promise<Audience> {
  const profile = await optionalViewer(ctx);
  const viewer = await toViewerRowInContest(ctx, profile);
  const row = toContestRow(contest);

  return {
    canEdit: contestIsEditableBy(row, viewer),
    canView: contestAccessCheck(row, viewer).kind === "ok",
    ended: contest.endTime <= Date.now(),
  };
}

async function problemAudience(ctx: QueryCtx, problem: Doc<"problems">): Promise<Audience> {
  const viewer = await loadViewerContext(ctx);

  return {
    canEdit: problemIsEditableBy(toCoreProblem(problem), viewer.core),
    canView: await canAccessProblem(ctx, problem, viewer),
    ended: false,
  };
}

/** The audience for whatever a file is attached to, or null when that is gone. */
async function audienceOf(ctx: QueryCtx, artefact: Doc<"artefacts">): Promise<Audience | null> {
  if (artefact.owner.kind === "contest") {
    const contest = await ctx.db.get(artefact.owner.contestId);

    return contest ? await contestAudience(ctx, contest) : null;
  }

  const problem = await ctx.db.get(artefact.owner.problemId);

  return problem ? await problemAudience(ctx, problem) : null;
}

function toRow(artefact: Doc<"artefacts">): ArtefactRow {
  return {
    id: artefact._id,
    name: artefact.name,
    size: artefact.size,
    contentType: artefact.contentType,
    visibility: artefact.visibility,
    uploadedAt: artefact.uploadedAt,
  };
}

function visibleRows(rows: readonly Doc<"artefacts">[], audience: Audience): ArtefactRow[] {
  return rows
    .filter((row) => artefactIsVisible(row.visibility, audience))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toRow);
}

/** The files this viewer may download from a contest. An empty list for a contest they cannot see. */
export const forContest = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<ArtefactRow[]> => {
    const contest = await contestByKey(ctx, key);

    if (!contest) return [];

    return visibleRows(await artefactsOfContest(ctx, contest._id), await contestAudience(ctx, contest));
  },
});

/** The files this viewer may download from a problem. */
export const forProblem = query({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<ArtefactRow[]> => {
    const problem = await problemByCode(ctx, code);

    if (!problem) return [];

    return visibleRows(await artefactsOfProblem(ctx, problem._id), await problemAudience(ctx, problem));
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
    const audience = await audienceOf(ctx, artefact);

    if (!audience || !artefactIsVisible(artefact.visibility, audience)) return null;
    const url = await ctx.storage.getUrl(artefact.storageId);

    if (!url) return null;

    return { url, name: artefact.name, contentType: artefact.contentType, size: artefact.size };
  },
});
