// The /status, /runtimes and /runtimes/matrix pages: judge/views/status.py.

import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  decorateJudge,
  type JudgeRow,
  judgesFor,
  type RuntimeVersionData,
  runtimeVersions,
  seesAllJudges,
} from "./judges";

export type StatusPage = {
  judges: JudgeRow[];
  runtimeVersionData: RuntimeVersionData;
  seeAllJudges: boolean;
  onlineCount: number;
};

/** `status_all` (judge/views/status.py:18). */
export const page = query({
  args: {},
  handler: async (ctx): Promise<StatusPage> => {
    const seeAll = await seesAllJudges(ctx);
    const rows = await judgesFor(ctx, seeAll);
    return {
      judges: await Promise.all(rows.map((row) => decorateJudge(ctx, row))),
      runtimeVersionData: await runtimeVersions(ctx),
      seeAllJudges: seeAll,
      onlineCount: rows.filter((row) => row.online).length,
    };
  },
});

/** `status_table` (judge/views/status.py:27); the same rows, refreshed alone. */
export const table = query({
  args: {},
  handler: async (ctx): Promise<{ judges: JudgeRow[]; seeAllJudges: boolean }> => {
    const seeAll = await seesAllJudges(ctx);
    const rows = await judgesFor(ctx, seeAll);
    return {
      judges: await Promise.all(rows.map((row) => decorateJudge(ctx, row))),
      seeAllJudges: seeAll,
    };
  },
});

export type RuntimeListEntry = {
  _id: Id<"languages">;
  key: string;
  name: string;
  shortName: string;
  commonName: string;
  extension: string;
  description: string;
  descriptionPreset: "language";
  info: string;
  /** DMOJ's `Language.runtime_versions()`: runtime name to sorted version list. */
  versions: Array<{ name: string; versions: string[] }>;
};

/** `LanguageList` (judge/views/language.py:8), which backs `/runtimes/`. */
export const runtimes = query({
  args: {},
  handler: async (ctx): Promise<RuntimeListEntry[]> => {
    const seeAll = await seesAllJudges(ctx);
    const judges = await ctx.db.query("judges").collect();
    const onlineJudgeIds = new Set(judges.filter((row) => row.online).map((row) => row._id as string));

    const languages = await ctx.db.query("languages").collect();
    languages.sort((a, b) => a.key.localeCompare(b.key));

    const out: RuntimeListEntry[] = [];
    for (const language of languages) {
      const versions = await ctx.db
        .query("runtimeVersions")
        .withIndex("by_language", (q) => q.eq("languageId", language._id))
        .collect();

      const relevant = seeAll ? versions : versions.filter((row) => onlineJudgeIds.has(row.judgeId));
      if (!seeAll && relevant.length === 0) continue;

      out.push({
        _id: language._id,
        key: language.key,
        name: language.name,
        shortName: language.shortName || language.key,
        commonName: language.commonName,
        extension: language.extension,
        description: language.description,
        descriptionPreset: "language",
        info: language.info,
        versions: aggregateVersions(relevant),
      });
    }
    return out;
  },
});

/** `Language.runtime_versions()` (judge/models/runtime.py:66). */
function aggregateVersions(rows: Doc<"runtimeVersions">[]): Array<{ name: string; versions: string[] }> {
  const byName = new Map<string, Set<string>>();
  for (const row of [...rows].sort((a, b) => a.priority - b.priority)) {
    let set = byName.get(row.name);
    if (!set) {
      set = new Set<string>();
      byName.set(row.name, set);
    }
    // An empty string means the judge could not determine the version.
    if (row.version) set.add(row.version);
  }
  return [...byName.entries()].map(([name, set]) => ({
    name,
    versions: [...set].sort(compareVersions),
  }));
}

/** `packaging.version.parse` reduced to what the matrix compares. */
export function parseVersion(text: string): number[] {
  return text
    .split(/[^0-9]+/)
    .filter((part) => part !== "")
    .map((part) => Number(part));
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x !== y) return x - y;
  }
  return a.localeCompare(b);
}

function compareVersionLists(a: string[], b: string[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const cmp = compareVersions(x, y);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

type MatrixCell = {
  runtimes: Array<{ name: string; version: string }>;
  isLatest: boolean;
};

export type VersionMatrix = {
  judges: string[];
  languages: Array<{ _id: Id<"languages">; key: string; name: string }>;
  /** judge or judge group name -> language key -> cell. */
  matrix: Record<string, Record<string, MatrixCell>>;
};

/** `version_matrix` (judge/views/status.py:53). */
export const matrix = query({
  args: {},
  handler: async (ctx): Promise<VersionMatrix> => {
    const judges = (await ctx.db.query("judges").collect()).filter((row) => row.online);
    const languageIds = new Set<string>();
    const perJudge = new Map<string, Map<string, Array<{ name: string; version: string }>>>();

    for (const judge of judges) {
      const versions = await ctx.db
        .query("runtimeVersions")
        .withIndex("by_judge", (q) => q.eq("judgeId", judge._id))
        .collect();
      versions.sort((a, b) => a.priority - b.priority);

      const byLanguage = new Map<string, Array<{ name: string; version: string }>>();
      for (const version of versions) {
        languageIds.add(version.languageId);
        const list = byLanguage.get(version.languageId) ?? [];
        list.push({ name: version.name, version: version.version });
        byLanguage.set(version.languageId, list);
      }
      perJudge.set(judge.name, byLanguage);
    }

    // Judges that share a domain suffix and an identical runtime list collapse
    // into one row named after the group.
    const groups = new Map<string, string[]>();
    for (const name of perJudge.keys()) {
      const dot = name.lastIndexOf(".");
      const group = dot === -1 ? name : name.slice(0, dot);
      const list = groups.get(group) ?? [];
      list.push(name);
      groups.set(group, list);
    }

    const collapsed = new Map<string, Map<string, Array<{ name: string; version: string }>>>();
    for (const [group, names] of groups) {
      if (names.length === 1) {
        const only = names[0];
        const data = only === undefined ? undefined : perJudge.get(only);
        if (only !== undefined && data) collapsed.set(only, data);
        continue;
      }

      const parent = names.map((_name, index) => index);
      const size = names.map(() => 1);
      for (let i = 0; i < names.length; i += 1) {
        if (parent[i] !== i) continue;
        for (let j = 0; j < names.length; j += 1) {
          if (i === j) continue;
          const left = perJudge.get(names[i] ?? "");
          const right = perJudge.get(names[j] ?? "");
          if (left && right && sameVersionList(left, right)) {
            parent[j] = i;
            size[i] = (size[i] ?? 0) + 1;
            size[j] = 0;
          }
        }
      }

      let rep = 0;
      for (let i = 1; i < names.length; i += 1) {
        if ((size[i] ?? 0) > (size[rep] ?? 0)) rep = i;
      }
      const repData = perJudge.get(names[rep] ?? "");
      if (repData) collapsed.set(group, repData);
      for (let i = 0; i < names.length; i += 1) {
        if (parent[i] === rep) continue;
        const data = perJudge.get(names[i] ?? "");
        if (data) collapsed.set(names[i] ?? "", data);
      }
    }

    const languages: Array<{ _id: Id<"languages">; key: string; name: string }> = [];
    const keyById = new Map<string, string>();
    for (const id of languageIds) {
      const language = await ctx.db.get(id as Id<"languages">);
      if (!language) continue;
      languages.push({ _id: language._id, key: language.key, name: language.name });
      keyById.set(id, language.key);
    }
    languages.sort((a, b) => compareVersions(a.name, b.name));

    const latest = new Map<string, string[]>();
    for (const data of collapsed.values()) {
      for (const [languageId, runtimeList] of data) {
        const versions = runtimeList.map((entry) => entry.version);
        const best = latest.get(languageId);
        if (!best || compareVersionLists(versions, best) > 0) latest.set(languageId, versions);
      }
    }

    const matrixOut: Record<string, Record<string, MatrixCell>> = {};
    for (const [name, data] of collapsed) {
      const row: Record<string, MatrixCell> = {};
      for (const [languageId, runtimeList] of data) {
        const key = keyById.get(languageId);
        if (!key) continue;
        const versions = runtimeList.map((entry) => entry.version);
        row[key] = {
          runtimes: runtimeList,
          isLatest: compareVersionLists(versions, latest.get(languageId) ?? []) === 0,
        };
      }
      matrixOut[name] = row;
    }

    return {
      judges: [...collapsed.keys()].sort((a, b) => a.localeCompare(b)),
      languages,
      matrix: matrixOut,
    };
  },
});

/** `compare_version_list` (judge/views/status.py:41). */
function sameVersionList(
  a: Map<string, Array<{ name: string; version: string }>>,
  b: Map<string, Array<{ name: string; version: string }>>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, left] of a) {
    const right = b.get(key);
    if (!right || right.length !== left.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i]?.name !== right[i]?.name) return false;
      if (left[i]?.version !== right[i]?.version) return false;
    }
  }
  return true;
}
