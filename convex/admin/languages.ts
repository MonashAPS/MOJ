// Staff console: languages. judge/models/runtime.py:19 and DMOJ's
// `copy_language` management command.

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requirePerm } from "../lib/auth";
import { writeRevision } from "../lib/community";
import { invalid, notFound } from "../lib/errors";

const LANGUAGE_PERM = "judge.change_language";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePerm(ctx, LANGUAGE_PERM);
    const [languages, problems] = await Promise.all([
      ctx.db.query("languages").collect(),
      ctx.db.query("problems").collect(),
    ]);
    languages.sort((a, b) => a.key.localeCompare(b.key));
    return languages.map((row) => ({
      ...row,
      problemCount: problems.filter((problem) => problem.allowedLanguageIds.includes(row._id)).length,
    }));
  },
});

export const get = query({
  args: { id: v.id("languages") },
  handler: async (ctx, { id }) => {
    await requirePerm(ctx, LANGUAGE_PERM);
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    key: v.string(),
    name: v.string(),
    shortName: v.optional(v.string()),
    commonName: v.string(),
    editorMode: v.string(),
    shikiLang: v.string(),
    template: v.optional(v.string()),
    info: v.optional(v.string()),
    description: v.optional(v.string()),
    extension: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"languages">> => {
    const editor = await requirePerm(ctx, LANGUAGE_PERM);

    const key = args.key.trim();
    if (key.length === 0) throw invalid("A language needs a short identifier.");
    if (key.length > 6) throw invalid("Short identifiers are limited to 6 characters.");

    const clash = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (clash) throw invalid(`A language with the identifier ${key} already exists.`);

    const id = await ctx.db.insert("languages", {
      key,
      name: args.name,
      shortName: args.shortName ?? "",
      commonName: args.commonName,
      editorMode: args.editorMode,
      shikiLang: args.shikiLang,
      template: args.template ?? "",
      info: args.info ?? "",
      description: args.description ?? "",
      extension: args.extension,
    });
    await writeRevision(
      ctx,
      "language",
      id,
      await ctx.db.get(id),
      editor._id,
      args.reason ?? "Created language",
    );
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("languages"),
    key: v.optional(v.string()),
    name: v.optional(v.string()),
    shortName: v.optional(v.string()),
    commonName: v.optional(v.string()),
    editorMode: v.optional(v.string()),
    shikiLang: v.optional(v.string()),
    template: v.optional(v.string()),
    info: v.optional(v.string()),
    description: v.optional(v.string()),
    extension: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const editor = await requirePerm(ctx, LANGUAGE_PERM);
    const row = await ctx.db.get(args.id);
    if (!row) throw notFound("Language");

    const patch: Partial<Doc<"languages">> = {};
    if (args.key !== undefined) {
      const key = args.key.trim();
      if (key.length === 0) throw invalid("A language needs a short identifier.");
      if (key !== row.key) {
        const clash = await ctx.db
          .query("languages")
          .withIndex("by_key", (q) => q.eq("key", key))
          .unique();
        if (clash) throw invalid(`A language with the identifier ${key} already exists.`);
      }
      patch.key = key;
    }
    if (args.name !== undefined) patch.name = args.name;
    if (args.shortName !== undefined) patch.shortName = args.shortName;
    if (args.commonName !== undefined) patch.commonName = args.commonName;
    if (args.editorMode !== undefined) patch.editorMode = args.editorMode;
    if (args.shikiLang !== undefined) patch.shikiLang = args.shikiLang;
    if (args.template !== undefined) patch.template = args.template;
    if (args.info !== undefined) patch.info = args.info;
    if (args.description !== undefined) patch.description = args.description;
    if (args.extension !== undefined) patch.extension = args.extension;

    await writeRevision(ctx, "language", args.id, row, editor._id, args.reason ?? "Edited language");
    await ctx.db.patch(args.id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("languages"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const editor = await requirePerm(ctx, LANGUAGE_PERM);
    const row = await ctx.db.get(id);
    if (!row) throw notFound("Language");

    const submission = await ctx.db
      .query("submissions")
      .withIndex("by_language_date", (q) => q.eq("languageId", id))
      .first();
    if (submission) throw invalid("That language has submissions and cannot be deleted.");

    const problems = await ctx.db.query("problems").collect();
    for (const problem of problems) {
      if (!problem.allowedLanguageIds.includes(id)) continue;
      await ctx.db.patch(problem._id, {
        allowedLanguageIds: problem.allowedLanguageIds.filter((entry) => entry !== id),
      });
    }
    const limits = await ctx.db.query("languageLimits").collect();
    for (const limit of limits) {
      if (limit.languageId === id) await ctx.db.delete(limit._id);
    }
    const versions = await ctx.db
      .query("runtimeVersions")
      .withIndex("by_language", (q) => q.eq("languageId", id))
      .collect();
    for (const version of versions) await ctx.db.delete(version._id);

    await writeRevision(ctx, "language", id, row, editor._id, reason ?? "Deleted language");
    await ctx.db.delete(id);
  },
});

/**
 * `copy_language` (judge/management/commands/copy_language.py): every problem
 * that allows `source` also allows `target`, and the per-language limits come
 * along with it.
 */
export const copyLanguage = mutation({
  args: { sourceKey: v.string(), targetKey: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { sourceKey, targetKey, reason }) => {
    const editor = await requirePerm(ctx, LANGUAGE_PERM);

    const source = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", sourceKey))
      .unique();
    if (!source) throw invalid(`Invalid source language: ${sourceKey}`);
    const target = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", targetKey))
      .unique();
    if (!target) throw invalid(`Invalid target language: ${targetKey}`);
    if (source._id === target._id) throw invalid("Pick two different languages.");

    const problems = await ctx.db.query("problems").collect();
    let allowed = 0;
    for (const problem of problems) {
      const hasSource = problem.allowedLanguageIds.includes(source._id);
      const hasTarget = problem.allowedLanguageIds.includes(target._id);
      if (hasSource && !hasTarget) {
        await ctx.db.patch(problem._id, {
          allowedLanguageIds: [...problem.allowedLanguageIds, target._id],
        });
        allowed += 1;
      } else if (!hasSource && hasTarget) {
        // `target.problem_set.set(source.problem_set.all())` replaces the set.
        await ctx.db.patch(problem._id, {
          allowedLanguageIds: problem.allowedLanguageIds.filter((entry) => entry !== target._id),
        });
      }
    }

    const limits = await ctx.db.query("languageLimits").collect();
    let copied = 0;
    for (const limit of limits) {
      if (limit.languageId !== source._id) continue;
      const existing = limits.find(
        (row) => row.problemId === limit.problemId && row.languageId === target._id,
      );
      if (existing) continue;
      await ctx.db.insert("languageLimits", {
        problemId: limit.problemId,
        languageId: target._id,
        timeLimit: limit.timeLimit,
        memoryLimit: limit.memoryLimit,
      });
      copied += 1;
    }

    await writeRevision(
      ctx,
      "language",
      target._id,
      { copiedFrom: source.key, problems: allowed, limits: copied },
      editor._id,
      reason ?? `Copied ${source.key} to ${target.key}`,
    );
    return { problems: allowed, limits: copied };
  },
});
