// Languages and their per-judge runtimes: judge/models/runtime.py and
// judge/views/language.py. `list` and `byKey` are what the registration and
// profile forms need; the rest is what the problem and language pages need:
// the submit form's language picker, the editor template, the per-problem
// limits and the per-judge runtime detail.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { seesAllJudges } from "./judges";
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

/** The preset `@moj/content` renders language descriptions with. */
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

export const LANGUAGE_PRESET = "language" as const;

export type LanguageRuntimeOnJudge = {
  judgeId: Id<"judges">;
  judgeName: string;
  online: boolean;
  runtimes: Array<{ name: string; version: string; priority: number }>;
};

export type LanguageDetail = Doc<"languages"> & {
  descriptionPreset: typeof LANGUAGE_PRESET;
  shortDisplayName: string;
  displayName: string;
  /** `Language.runtime_versions()`: runtime name to the sorted version set. */
  versions: Array<{ name: string; versions: string[] }>;
  judges: LanguageRuntimeOnJudge[];
  problemCount: number;
};

/** The `/runtimes/#<key>` detail panel. */
export const detail = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<LanguageDetail | null> => {
    const language = await ctx.db
      .query("languages")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!language) return null;

    const seeAll = await seesAllJudges(ctx);
    const rows = await ctx.db
      .query("runtimeVersions")
      .withIndex("by_language", (q) => q.eq("languageId", language._id))
      .collect();

    const judges = new Map<string, LanguageRuntimeOnJudge>();
    for (const row of [...rows].sort((a, b) => a.priority - b.priority)) {
      const judge = await ctx.db.get(row.judgeId);
      if (!judge) continue;
      if (!seeAll && !judge.online) continue;
      let entry = judges.get(judge._id);
      if (!entry) {
        entry = { judgeId: judge._id, judgeName: judge.name, online: judge.online, runtimes: [] };
        judges.set(judge._id, entry);
      }
      entry.runtimes.push({ name: row.name, version: row.version, priority: row.priority });
    }

    const byName = new Map<string, Set<string>>();
    for (const entry of judges.values()) {
      for (const runtime of entry.runtimes) {
        let set = byName.get(runtime.name);
        if (!set) {
          set = new Set<string>();
          byName.set(runtime.name, set);
        }
        if (runtime.version) set.add(runtime.version);
      }
    }

    const problems = await ctx.db.query("problems").collect();
    const problemCount = problems.filter((row) => row.allowedLanguageIds.includes(language._id)).length;

    return {
      ...language,
      descriptionPreset: LANGUAGE_PRESET,
      shortDisplayName: language.shortName || language.key,
      displayName: language.info ? `${language.name} (${language.info})` : language.name,
      versions: [...byName.entries()].map(([name, set]) => ({ name, versions: [...set].sort() })),
      judges: [...judges.values()].sort((a, b) => a.judgeName.localeCompare(b.judgeName)),
      problemCount,
    };
  },
});

/** Every language plus the count of problems that accept it, for the console. */
export const withProblemCounts = query({
  args: {},
  handler: async (ctx) => {
    const [languages, problems] = await Promise.all([
      ctx.db.query("languages").collect(),
      ctx.db.query("problems").collect(),
    ]);
    languages.sort((a, b) => a.key.localeCompare(b.key));
    return languages.map((language) => ({
      ...language,
      shortDisplayName: language.shortName || language.key,
      problemCount: problems.filter((row) => row.allowedLanguageIds.includes(language._id)).length,
    }));
  },
});
