// Languages and their per-judge runtimes: judge/models/runtime.py and
// judge/views/language.py.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { seesAllJudges } from "./judges";

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
