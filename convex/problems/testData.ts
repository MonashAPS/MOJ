/**
 * Site-owned test data: the archive the site holds for a problem.
 *
 * A problem repository publishes a zip with the same API key it already uses
 * for statements, judges fetch it over `GET /judge/data` and cache it, and the
 * claim names its hash so every judge grades the same bytes. A problem the site
 * holds nothing for behaves exactly as before: the judge grades from its own
 * disk.
 *
 * The HTTP edges live in convex/http/problemsApi.ts (publishers) and
 * convex/http/judge.ts (graders); everything here is internal, and every caller
 * authorises before it gets this far.
 */

import { problemIsEditableBy } from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { writeProblemRevision } from "../admin/problems";
import { authenticateJudge } from "../judgeApi";
import { publishedTestData, testDataRow } from "../lib/testData";
import { problemByCode, toCoreProblem } from "../problems";

/**
 * Archives up to this size are parsed when they are published, which is what
 * catches an invalid zip or a member path that escapes the extraction root.
 * Anything larger is stored on the publisher's word: reading it back would cost
 * the whole archive in memory, and the judge validates the bytes it downloads
 * either way.
 */
export const MAX_VALIDATED_ARCHIVE_BYTES = 64 * 1024 * 1024;

export type PublisherContext =
  | { status: "not_found" }
  | { status: "forbidden" }
  | {
      status: "ok";
      problemId: Id<"problems">;
      published: Awaited<ReturnType<typeof publishedTestData>>;
    };

/** The problems API's guard: the problem exists and the key's owner may edit it. */
export const publisherContext = internalQuery({
  args: { code: v.string(), actorProfileId: v.id("profiles") },
  handler: async (ctx, { code, actorProfileId }): Promise<PublisherContext> => {
    const problem = await problemByCode(ctx, code);
    if (!problem) return { status: "not_found" };
    const actor = await ctx.db.get(actorProfileId);
    if (!actor) return { status: "forbidden" };
    const editable = problemIsEditableBy(toCoreProblem(problem), {
      id: actor._id,
      username: actor.username,
      isStaff: actor.isStaff,
      isSuperuser: actor.isSuperuser,
      permissions: actor.permissions,
    });
    if (!editable) return { status: "forbidden" };
    return {
      status: "ok",
      problemId: problem._id,
      published: await publishedTestData(ctx, problem._id),
    };
  },
});

/**
 * Record an archive against a problem, replacing whatever it held.
 *
 * Nothing changes when the hash already matches: the stored copy stays, the
 * blob that just arrived is deleted, and no revision is written. Otherwise the
 * row takes the new archive, the previous blob is deleted, and the problem gets
 * a revision naming the hash and who published it.
 */
export const record = internalMutation({
  args: {
    problemId: v.id("problems"),
    storageId: v.id("_storage"),
    hash: v.string(),
    size: v.number(),
    fileCount: v.number(),
    actorProfileId: v.optional(v.id("profiles")),
    source: v.union(v.literal("api"), v.literal("editor")),
  },
  handler: async (ctx, args): Promise<{ changed: boolean; hash: string; storageId: Id<"_storage"> }> => {
    const existing = await testDataRow(ctx, args.problemId);
    if (existing && existing.hash === args.hash) {
      if (existing.storageId !== args.storageId) await ctx.storage.delete(args.storageId);
      return { changed: false, hash: existing.hash, storageId: existing.storageId };
    }

    const row = {
      problemId: args.problemId,
      storageId: args.storageId,
      hash: args.hash,
      size: args.size,
      fileCount: args.fileCount,
      uploadedByProfileId: args.actorProfileId,
      uploadedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      if (existing.storageId !== args.storageId) await ctx.storage.delete(existing.storageId);
    } else {
      await ctx.db.insert("problemTestData", row);
    }

    const actor: Doc<"profiles"> | null = args.actorProfileId ? await ctx.db.get(args.actorProfileId) : null;
    const where = args.source === "api" ? "the problems API" : "the test data editor";
    await writeProblemRevision(
      ctx,
      args.problemId,
      args.actorProfileId,
      `${actor?.username ?? "Someone"} published test data ${args.hash} through ${where}.`,
    );
    return { changed: true, hash: args.hash, storageId: args.storageId };
  },
});

/**
 * `GET /judge/data`: the stored archive for one problem, once the judge has
 * proved who it is. An unknown problem and a problem the site holds nothing for
 * are the same answer, because they mean the same thing to a judge.
 */
export const judgeArchive = internalQuery({
  args: { judgeName: v.string(), authKeyHash: v.string(), code: v.string() },
  handler: async (
    ctx,
    { judgeName, authKeyHash, code },
  ): Promise<{ storageId: Id<"_storage">; hash: string; size: number } | null> => {
    await authenticateJudge(ctx, judgeName, authKeyHash);
    const problem = await problemByCode(ctx, code);
    if (!problem) return null;
    const row = await testDataRow(ctx, problem._id);
    if (!row) return null;
    return { storageId: row.storageId, hash: row.hash, size: row.size };
  },
});
