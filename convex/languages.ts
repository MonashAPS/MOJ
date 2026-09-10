// NOTE (foundation agent): `list` and `byKey` are the two the registration and
// profile forms need. The rest is what the problem pages need: the submit
// form's language picker, the editor template and the per-problem limits.

import { v } from "convex/values";
import { query } from "./_generated/server";
import { canAccessProblem, loadViewerContext, problemByCode } from "./problems";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("languages").collect();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  },
});

export const byKey = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    return await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
  },
});

/** Editor templates for every language, for the submit page's language switch. */
export const templates = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("languages").collect();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows.map((row) => ({
      key: row.key,
      name: row.name,
      template: row.template,
      editorMode: row.editorMode,
      shikiLang: row.shikiLang,
      extension: row.extension,
    }));
  },
});

/**
 * `Problem.usable_languages`: the problem's allowed languages that at least one
 * online judge can actually run, with the effective limits for each.
 */
export const usableForProblem = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const problem = await problemByCode(ctx, code);
    if (!problem) return null;

    const viewer = await loadViewerContext(ctx);
    if (!(await canAccessProblem(ctx, problem, viewer))) return null;

    const judges = (
      await ctx.db
        .query("judges")
        .withIndex("by_online_tier", (q) => q.eq("online", true))
        .collect()
    ).filter((judge) => judge.problemCodes.includes(problem.code));
    const runtimeKeys = new Set(judges.flatMap((judge) => judge.runtimeKeys));

    const limits = await ctx.db
      .query("languageLimits")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect();
    const limitByLanguage = new Map(limits.map((row) => [row.languageId as string, row]));

    const out = [];
    for (const id of problem.allowedLanguageIds) {
      const language = await ctx.db.get(id);
      if (!language) continue;
      const limit = limitByLanguage.get(language._id);
      out.push({
        key: language.key,
        name: language.name,
        shortName: language.shortName,
        commonName: language.commonName,
        editorMode: language.editorMode,
        shikiLang: language.shikiLang,
        template: language.template,
        extension: language.extension,
        timeLimit: limit?.timeLimit ?? problem.timeLimit,
        memoryLimit: limit?.memoryLimit ?? problem.memoryLimit,
        runnable: runtimeKeys.size === 0 ? false : runtimeKeys.has(language.key),
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
    return { problemCode: problem.code, languages: out, onlineJudges: judges.length };
  },
});
