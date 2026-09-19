/**
 * Staff attaching files to a contest or a problem. Each change is a revision
 * on the owner, whose snapshot lists its files.
 */

import { contestIsEditableBy, problemIsEditableBy } from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { type MutationCtx, mutation, query } from "../_generated/server";
import { artefactsOfContest, artefactsOfProblem } from "../artefacts/names";
import { contestByKey, toContestRow, toViewerRowInContest } from "../contests/formats";
import { snapshotContest } from "../contests/snapshot";
import { requireViewer } from "../lib/auth";
import { writeRevision } from "../lib/community";
import { forbidden, invalid, notFound } from "../lib/errors";
import { loadViewerContext, problemByCode, toCoreProblem } from "../problems";
import { artefactVisibility } from "../schema";
import { writeProblemRevision } from "./problems";

/** What a file is attached to, named the way the editor names it. */
const owner = v.union(
  v.object({ kind: v.literal("contest"), key: v.string() }),
  v.object({ kind: v.literal("problem"), code: v.string() }),
);

type OwnerRef = { kind: "contest"; key: string } | { kind: "problem"; code: string };

type Owner =
  | { kind: "contest"; contest: Doc<"contests">; profileId: Id<"profiles"> }
  | { kind: "problem"; problem: Doc<"problems">; profileId: Id<"profiles"> };

/** The owner, once the viewer has been checked as one of its editors. */
async function requireOwnerEditor(ctx: MutationCtx, ref: OwnerRef): Promise<Owner> {
  if (ref.kind === "contest") {
    const profile = await requireViewer(ctx);
    const contest = await contestByKey(ctx, ref.key);

    if (!contest) throw notFound(`Contest "${ref.key}"`);

    if (!contestIsEditableBy(toContestRow(contest), await toViewerRowInContest(ctx, profile)))
      throw forbidden();

    return { kind: "contest", contest, profileId: profile._id };
  }

  const viewer = await loadViewerContext(ctx);

  if (!viewer.profile) throw forbidden("You must be logged in to do that.");
  const problem = await problemByCode(ctx, ref.code);

  if (!problem) throw notFound(`Problem "${ref.code}"`);

  if (!problemIsEditableBy(toCoreProblem(problem), viewer.core))
    throw forbidden("You may not edit this problem.");

  return { kind: "problem", problem, profileId: viewer.profile._id };
}

async function ownerRefOf(ctx: MutationCtx, artefact: Doc<"artefacts">): Promise<OwnerRef> {
  if (artefact.owner.kind === "contest") {
    const contest = await ctx.db.get(artefact.owner.contestId);

    if (!contest) throw notFound("Contest");

    return { kind: "contest", key: contest.key };
  }

  const problem = await ctx.db.get(artefact.owner.problemId);

  if (!problem) throw notFound("Problem");

  return { kind: "problem", code: problem.code };
}

async function recordChange(ctx: MutationCtx, target: Owner, reason: string): Promise<void> {
  if (target.kind === "contest") {
    await writeRevision(
      ctx,
      "contest",
      target.contest._id,
      await snapshotContest(ctx, target.contest._id),
      target.profileId,
      reason,
    );

    return;
  }

  await writeProblemRevision(ctx, target.problem._id, target.profileId, reason);
}

/** A problem's file has no contest to end, so "afterwards" means nothing there. */
function checkVisibility(target: Owner, visibility: Doc<"artefacts">["visibility"]): void {
  if (target.kind === "problem" && visibility === "afterEnd") {
    throw invalid("A problem's file is either for staff or for everyone who can see the problem.");
  }
}

export const uploadUrl = mutation({
  args: { owner },
  handler: async (ctx, args): Promise<string> => {
    await requireOwnerEditor(ctx, args.owner);

    return await ctx.storage.generateUploadUrl();
  },
});

export const add = mutation({
  args: {
    owner,
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    visibility: artefactVisibility,
  },
  handler: async (ctx, args): Promise<Id<"artefacts">> => {
    const target = await requireOwnerEditor(ctx, args.owner);
    const name = args.name.trim();

    if (!name) throw invalid("A file needs a name.");
    checkVisibility(target, args.visibility);
    const stored = await ctx.db.system.get(args.storageId);

    if (!stored) throw invalid("The upload did not arrive.");

    const id = await ctx.db.insert("artefacts", {
      owner:
        target.kind === "contest"
          ? { kind: "contest", contestId: target.contest._id }
          : { kind: "problem", problemId: target.problem._id },
      name,
      storageId: args.storageId,
      size: stored.size,
      contentType: args.contentType || stored.contentType || "application/octet-stream",
      visibility: args.visibility,
      uploadedByProfileId: target.profileId,
      uploadedAt: Date.now(),
    });

    await recordChange(ctx, target, `Added file ${name}`);

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("artefacts"),
    name: v.optional(v.string()),
    visibility: v.optional(artefactVisibility),
  },
  handler: async (ctx, args): Promise<null> => {
    const artefact = await ctx.db.get(args.id);

    if (!artefact) throw notFound("File");
    const target = await requireOwnerEditor(ctx, await ownerRefOf(ctx, artefact));
    const patch: Partial<Doc<"artefacts">> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();

      if (!name) throw invalid("A file needs a name.");
      patch.name = name;
    }

    if (args.visibility !== undefined) {
      checkVisibility(target, args.visibility);
      patch.visibility = args.visibility;
    }

    if (Object.keys(patch).length === 0) return null;
    await ctx.db.patch(artefact._id, patch);
    await recordChange(ctx, target, `Changed file ${patch.name ?? artefact.name}`);

    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("artefacts") },
  handler: async (ctx, { id }): Promise<null> => {
    const artefact = await ctx.db.get(id);

    if (!artefact) throw notFound("File");
    const target = await requireOwnerEditor(ctx, await ownerRefOf(ctx, artefact));

    await ctx.storage.delete(artefact.storageId);
    await ctx.db.delete(artefact._id);
    await recordChange(ctx, target, `Removed file ${artefact.name}`);

    return null;
  },
});

/** Every file on the owner, for its editor, whoever it is for. */
export const list = query({
  args: { owner },
  handler: async (ctx, args) => {
    let rows: Doc<"artefacts">[] = [];

    if (args.owner.kind === "contest") {
      const contest = await contestByKey(ctx, args.owner.key);

      if (contest) rows = await artefactsOfContest(ctx, contest._id);
    } else {
      const problem = await problemByCode(ctx, args.owner.code);

      if (problem) rows = await artefactsOfProblem(ctx, problem._id);
    }

    const out = [];

    for (const row of rows.sort((a, b) => a.name.localeCompare(b.name))) {
      const uploader = await ctx.db.get(row.uploadedByProfileId);
      out.push({
        id: row._id,
        name: row.name,
        size: row.size,
        contentType: row.contentType,
        visibility: row.visibility,
        uploadedAt: row.uploadedAt,
        uploadedBy: uploader?.username ?? null,
      });
    }

    return out;
  },
});
