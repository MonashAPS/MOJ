// Judges as the site sees them: judge/models/runtime.py and
// judge/views/status.py. The judge-facing API lives in convex/judgeApi.ts.

import { isStaff as coreIsStaff } from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { optionalViewer } from "./lib/auth";
import { type AnyCtx, coreViewer } from "./lib/community";

/** The preset `@moj/content` renders judge descriptions with. */
export const JUDGE_PRESET = "judge" as const;

export type JudgeRuntime = { name: string; version: string; priority: number };

export type JudgeLanguageRuntimes = {
  languageId: Id<"languages">;
  key: string;
  name: string;
  runtimes: JudgeRuntime[];
};

export type JudgeRow = {
  _id: Id<"judges">;
  name: string;
  online: boolean;
  /** Milliseconds, as DMOJ's `ping_ms`. */
  pingMs: number | null;
  load: number | null;
  startTime: number | null;
  /** Milliseconds of uptime, or null when the judge is offline. */
  uptime: number | null;
  description: string;
  descriptionPreset: typeof JUDGE_PRESET;
  tier: number;
  isBlocked: boolean;
  isDisabled: boolean;
  lastSeen: number | null;
  lastIp: string | null;
  problemCount: number;
  runtimeNames: string[];
  runtimes: JudgeLanguageRuntimes[];
};

/** `get_judges` (judge/views/status.py:11). */
export async function judgesFor(ctx: AnyCtx, seeAll: boolean): Promise<Doc<"judges">[]> {
  const rows = await ctx.db.query("judges").collect();
  const visible = seeAll ? rows : rows.filter((row) => row.online);
  visible.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return visible;
}

export async function decorateJudge(ctx: AnyCtx, judge: Doc<"judges">): Promise<JudgeRow> {
  const versions = await ctx.db
    .query("runtimeVersions")
    .withIndex("by_judge", (q) => q.eq("judgeId", judge._id))
    .collect();

  const languages = new Map<string, Doc<"languages">>();
  for (const version of versions) {
    if (languages.has(version.languageId)) continue;
    const language = await ctx.db.get(version.languageId);
    if (language) languages.set(version.languageId, language);
  }

  const grouped = new Map<string, JudgeLanguageRuntimes>();
  for (const version of [...versions].sort((a, b) => a.priority - b.priority)) {
    const language = languages.get(version.languageId);
    if (!language) continue;
    let entry = grouped.get(version.languageId);
    if (!entry) {
      entry = {
        languageId: language._id,
        key: language.key,
        name: language.name,
        runtimes: [],
      };
      grouped.set(version.languageId, entry);
    }
    entry.runtimes.push({ name: version.name, version: version.version, priority: version.priority });
  }

  const runtimes = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  const now = Date.now();

  return {
    _id: judge._id,
    name: judge.name,
    online: judge.online,
    pingMs: judge.ping === undefined ? null : judge.ping * 1000,
    load: judge.load ?? null,
    startTime: judge.startTime ?? null,
    uptime: judge.online && judge.startTime !== undefined ? now - judge.startTime : null,
    description: judge.description,
    descriptionPreset: JUDGE_PRESET,
    tier: judge.tier,
    isBlocked: judge.isBlocked,
    isDisabled: judge.isDisabled,
    lastSeen: judge.lastSeen ?? null,
    lastIp: judge.lastIp ?? null,
    problemCount: judge.problemCodes.length,
    runtimeNames: runtimes.map((entry) => entry.name),
    runtimes,
  };
}

/** Whether the viewer sees offline judges too. */
export async function seesAllJudges(ctx: AnyCtx): Promise<boolean> {
  const profile = await optionalViewer(ctx);
  const viewer = await coreViewer(ctx, profile);
  return coreIsStaff(viewer);
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<{ judges: JudgeRow[]; seeAll: boolean }> => {
    const seeAll = await seesAllJudges(ctx);
    const rows = await judgesFor(ctx, seeAll);
    return { judges: await Promise.all(rows.map((row) => decorateJudge(ctx, row))), seeAll };
  },
});

export const get = query({
  args: { name: v.string() },
  handler: async (ctx, { name }): Promise<JudgeRow | null> => {
    const judge = await ctx.db
      .query("judges")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (!judge) return null;
    if (!judge.online && !(await seesAllJudges(ctx))) return null;
    return await decorateJudge(ctx, judge);
  },
});

export type RuntimeVersionData = Record<
  string,
  Array<{ key: string; name: string; runtime: Array<{ name: string; version: string }> }>
>;

/** `Judge.runtime_versions()` (judge/models/runtime.py:170). Online judges only. */
export const runtimeVersionData = query({
  args: {},
  handler: async (ctx): Promise<RuntimeVersionData> => {
    return await runtimeVersions(ctx);
  },
});

export async function runtimeVersions(ctx: AnyCtx): Promise<RuntimeVersionData> {
  const judges = (await ctx.db.query("judges").collect()).filter((row) => row.online);
  const out: RuntimeVersionData = {};

  for (const judge of judges) {
    const versions = await ctx.db
      .query("runtimeVersions")
      .withIndex("by_judge", (q) => q.eq("judgeId", judge._id))
      .collect();

    const decorated: Array<{ language: Doc<"languages">; version: Doc<"runtimeVersions"> }> = [];
    for (const version of versions) {
      const language = await ctx.db.get(version.languageId);
      if (language) decorated.push({ language, version });
    }
    decorated.sort(
      (a, b) => a.language.name.localeCompare(b.language.name) || a.version.priority - b.version.priority,
    );

    const byKey = new Map<
      string,
      { key: string; name: string; runtime: Array<{ name: string; version: string }> }
    >();
    for (const { language, version } of decorated) {
      let entry = byKey.get(language.key);
      if (!entry) {
        entry = { key: language.key, name: language.name, runtime: [] };
        byKey.set(language.key, entry);
      }
      entry.runtime.push({ name: version.name, version: version.version });
    }
    out[judge.name] = [...byKey.values()];
  }
  return out;
}
