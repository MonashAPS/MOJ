/**
 * The PDF statement cache: what `/problem/[code]/pdf` reads to render, and
 * where the rendered file is stored once the route has produced it.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { notFound } from "../lib/errors";
import {
  canAccessProblem,
  loadViewerContext,
  problemByCode,
  requireProblem,
  translationFor,
} from "../problems";

/**
 * Everything `/problem/[code]/pdf` needs in one read: the statement to render,
 * the info-box values the Typst template prints, and whatever is already in the
 * `pdfCache` for this problem and language.
 *
 * The route hashes `statement + meta` itself and compares against
 * `cached.sourceHash`, so a statement edit invalidates the cache without the
 * query having to hash anything (which would make it non-deterministic to
 * re-run when the template changes).
 */
export const source = query({
  args: { code: v.string(), language: v.optional(v.string()) },
  handler: async (ctx, { code, language }) => {
    const problem = await problemByCode(ctx, code);
    if (!problem) return null;

    const viewer = await loadViewerContext(ctx);
    if (!(await canAccessProblem(ctx, problem, viewer))) return null;

    const lang = language ?? "en";
    const translation = await translationFor(ctx, problem._id, lang);

    const authors: string[] = [];
    for (const id of problem.authorProfileIds) {
      const row = await ctx.db.get(id);
      if (row) authors.push(row.username);
    }

    // The Typst template prints a python time limit when there is one.
    const limits = await ctx.db
      .query("languageLimits")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect();
    let pythonTimeLimit: number | null = null;
    for (const limit of limits) {
      const lang3 = await ctx.db.get(limit.languageId);
      if (lang3 && (lang3.key === "PY3" || lang3.key.toLowerCase().startsWith("py"))) {
        pythonTimeLimit = limit.timeLimit;
        break;
      }
    }

    const cached = await ctx.db
      .query("pdfCache")
      .withIndex("by_problem_language", (q) => q.eq("problemCode", problem.code).eq("language", lang))
      .unique();

    return {
      code: problem.code,
      language: lang,
      statement: translation?.description ?? problem.description,
      meta: {
        name: translation?.name ?? problem.name,
        code: problem.code,
        points: problem.points,
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
        pythonTimeLimit,
        authors,
        inputType: "standard input",
        outputType: "standard output",
      },
      cached: cached
        ? {
            sourceHash: cached.sourceHash,
            url: await ctx.storage.getUrl(cached.storageId),
            renderedAt: cached.renderedAt,
          }
        : null,
    };
  },
});

/** An upload slot for a freshly rendered PDF; access-checked like the read. */
export const uploadUrl = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const problem = await requireProblem(ctx, code);
    const viewer = await loadViewerContext(ctx);
    if (!(await canAccessProblem(ctx, problem, viewer))) throw notFound("Problem");
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: {
    code: v.string(),
    language: v.string(),
    sourceHash: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const problem = await requireProblem(ctx, args.code);
    const viewer = await loadViewerContext(ctx);
    if (!(await canAccessProblem(ctx, problem, viewer))) throw notFound("Problem");

    const existing = await ctx.db
      .query("pdfCache")
      .withIndex("by_problem_language", (q) =>
        q.eq("problemCode", problem.code).eq("language", args.language),
      )
      .unique();

    if (existing) {
      if (existing.storageId !== args.storageId) await ctx.storage.delete(existing.storageId);
      await ctx.db.patch(existing._id, {
        storageId: args.storageId,
        sourceHash: args.sourceHash,
        renderedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("pdfCache", {
        problemCode: problem.code,
        language: args.language,
        storageId: args.storageId,
        sourceHash: args.sourceHash,
        renderedAt: Date.now(),
      });
    }

    await ctx.db.insert("uploads", {
      storageId: args.storageId,
      uploaderProfileId: viewer.profile?._id,
      kind: "pdf",
      name: `${problem.code}.${args.language}.pdf`,
      createdAt: Date.now(),
      cacheKey: `pdf:${problem.code}:${args.language}:${args.sourceHash}`,
    });

    return { ok: true };
  },
});
