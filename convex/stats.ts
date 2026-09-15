// The /stats/language page: judge/views/stats.py and judge/utils/stats.py.
//
// DMOJ answers each chart with a `Count` aggregate straight off the database.
// Convex has no GROUP BY, so the tallies are computed from a bounded scan and
// kept in `statsSnapshots`; the queries serve the snapshot and fall back to
// computing one inline when there is none.

import { USER_DISPLAY_CODES } from "@moj/core";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { type AnyCtx, STATS_LANGUAGE_THRESHOLD, siteSettings } from "./lib/community";

const BASE_COLORS = [
  0x3366cc, 0xdc3912, 0xff9900, 0x109618, 0x990099, 0x3b3eac, 0x0099c6, 0xdd4477, 0x66aa00, 0xb82e2e,
  0x316395, 0x994499, 0x22aa99, 0xaaaa11, 0x6633cc, 0xe67300, 0x8b0707, 0x329262, 0x5574a6, 0x3b3eac,
];

function hex(color: number): string {
  return `#${color.toString(16).toUpperCase().padStart(6, "0")}`;
}

function highlight(color: number): string {
  const r = Math.min(Math.trunc(((color >> 16) & 0xff) * 1.2), 255);
  const g = Math.min(Math.trunc(((color >> 8) & 0xff) * 1.2), 255);
  const b = Math.min(Math.trunc((color & 0xff) * 1.2), 255);

  return `#${[r, g, b].map((part) => part.toString(16).toUpperCase().padStart(2, "0")).join("")}`;
}

/** `judge.utils.stats.chart_colors`. */
export const CHART_COLORS: string[] = BASE_COLORS.map(hex);

/** `judge.utils.stats.highlight_colors`. */
export const HIGHLIGHT_COLORS: string[] = BASE_COLORS.map(highlight);

export type PieChart = {
  labels: string[];
  datasets: Array<{
    backgroundColor: string[];
    highlightBackgroundColor: string[];
    data: number[];
  }>;
};

export type BarChart = {
  labels: string[];
  datasets: Array<{
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    hoverBackgroundColor: string;
    hoverBorderColor: string;
    data: number[];
  }>;
};

/** `get_pie_chart` (judge/utils/stats.py:20). */
export function pieChart(data: Array<[string, number]>): PieChart {
  return {
    labels: data.map(([label]) => label),
    datasets: [
      {
        backgroundColor: CHART_COLORS,
        highlightBackgroundColor: HIGHLIGHT_COLORS,
        data: data.map(([, count]) => count),
      },
    ],
  };
}

/** `get_bar_chart` (judge/utils/stats.py:33). */
export function barChart(data: Array<[string, number]>): BarChart {
  return {
    labels: data.map(([label]) => label),
    datasets: [
      {
        backgroundColor: "rgba(151,187,205,0.5)",
        borderColor: "rgba(151,187,205,0.8)",
        borderWidth: 1,
        hoverBackgroundColor: "rgba(151,187,205,0.75)",
        hoverBorderColor: "rgba(151,187,205,1)",
        data: data.map(([, count]) => count),
      },
    ],
  };
}

/** How many submissions one snapshot pass reads. */
export const STATS_SCAN_LIMIT = 50_000;

export type LanguageTally = {
  languageId: string;
  name: string;
  total: number;
  ac: number;
};

export type StatsTallies = {
  languages: LanguageTally[];
  /** Result code to submission count; DMOJ skips submissions with no result. */
  results: Record<string, number>;
  scanned: number;
  truncated: boolean;
};

async function computeTallies(ctx: AnyCtx, limit: number): Promise<StatsTallies> {
  const languages = await ctx.db.query("languages").collect();
  const byId = new Map<string, LanguageTally>();

  for (const language of languages) {
    byId.set(language._id, { languageId: language._id, name: language.name, total: 0, ac: 0 });
  }

  const rows = await ctx.db
    .query("submissions")
    .withIndex("by_date")
    .order("desc")
    .take(limit + 1);

  const truncated = rows.length > limit;
  const scanned = truncated ? rows.slice(0, limit) : rows;

  const results: Record<string, number> = {};

  for (const row of scanned) {
    const tally = byId.get(row.languageId);

    if (tally) {
      tally.total += 1;

      if (row.result === "AC") tally.ac += 1;
    }

    if (row.result) results[row.result] = (results[row.result] ?? 0) + 1;
  }

  return {
    languages: [...byId.values()],
    results,
    scanned: scanned.length,
    truncated,
  };
}

async function tallies(ctx: AnyCtx): Promise<StatsTallies & { computedAt: number }> {
  const snapshot = await ctx.db
    .query("statsSnapshots")
    .withIndex("by_key", (q) => q.eq("key", "language"))
    .unique();

  if (snapshot) {
    // SAFETY: `statsSnapshots.data` is only ever written by `refresh` below, with the
    // value `computeTallies` returned.
    const data = snapshot.data as StatsTallies;

    return { ...data, computedAt: snapshot.computedAt };
  }

  return { ...(await computeTallies(ctx, 20_000)), computedAt: Date.now() };
}

/** Recomputes the snapshot; the crons in section 12 drive this. */
export const refresh = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const data = await computeTallies(ctx, limit ?? STATS_SCAN_LIMIT);

    const existing = await ctx.db
      .query("statsSnapshots")
      .withIndex("by_key", (q) => q.eq("key", "language"))
      .unique();

    const computedAt = Date.now();

    if (existing) await ctx.db.patch(existing._id, { data, computedAt });
    else await ctx.db.insert("statsSnapshots", { key: "language", data, computedAt });

    return { scanned: data.scanned, truncated: data.truncated, computedAt };
  },
});

/** `language_data` (judge/views/stats.py:16): submissions per language. */
export const languageData = query({
  args: {},
  handler: async (ctx): Promise<PieChart> => {
    const data = await tallies(ctx);
    const threshold = (await siteSettings(ctx))?.statsLanguageThreshold ?? STATS_LANGUAGE_THRESHOLD;

    return languagePie(
      data.languages.filter((row) => row.total > 0).map((row) => [row.name, row.total] as const),
      threshold,
    );
  },
});

/** `ac_language_data` (judge/views/stats.py:32): AC submissions per language. */
export const acLanguageData = query({
  args: {},
  handler: async (ctx): Promise<PieChart> => {
    const data = await tallies(ctx);
    const threshold = (await siteSettings(ctx))?.statsLanguageThreshold ?? STATS_LANGUAGE_THRESHOLD;

    return languagePie(
      data.languages.filter((row) => row.ac > 0).map((row) => [row.name, row.ac] as const),
      threshold,
    );
  },
});

function languagePie(entries: ReadonlyArray<readonly [string, number]>, threshold: number): PieChart {
  const sorted = [...entries].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const count = Math.min(sorted.length, threshold);
  const head = sorted.slice(0, count);
  const other = sorted.slice(count).reduce((sum, [, value]) => sum + value, 0);

  return {
    labels: [...head.map(([name]) => name), "Other"],
    datasets: [
      {
        backgroundColor: [...CHART_COLORS.slice(0, count), "#FDB45C"],
        highlightBackgroundColor: [...HIGHLIGHT_COLORS.slice(0, count), "#FFC870"],
        data: [...head.map(([, value]) => value), other],
      },
    ],
  };
}

/** `status_data` (judge/views/stats.py:36): the verdict distribution. */
export const statusData = query({
  args: {},
  handler: async (ctx): Promise<PieChart> => {
    const data = await tallies(ctx);

    const entries = Object.entries(data.results)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([code, count]): [string, number] => [USER_DISPLAY_CODES[code] ?? code, count]);

    return pieChart(entries);
  },
});

/** `ac_rate` (judge/views/stats.py:51): AC percentage per language, by volume. */
export const acRate = query({
  args: {},
  handler: async (ctx): Promise<BarChart> => {
    const data = await tallies(ctx);

    const entries = data.languages
      .filter((row) => row.total > 0)
      .sort((a, b) => a.total - b.total || a.name.localeCompare(b.name))
      .map((row): [string, number] => [row.name, (row.ac / row.total) * 100]);

    return barChart(entries);
  },
});

export type LanguageStats = {
  languageData: PieChart;
  acLanguageData: PieChart;
  statusData: PieChart;
  acRate: BarChart;
  computedAt: number;
  scanned: number;
  truncated: boolean;
};

/** Everything `/stats/language/` draws, in one subscription. */
export const language = query({
  args: {},
  handler: async (ctx): Promise<LanguageStats> => {
    const data = await tallies(ctx);
    const threshold = (await siteSettings(ctx))?.statsLanguageThreshold ?? STATS_LANGUAGE_THRESHOLD;

    return {
      languageData: languagePie(
        data.languages.filter((row) => row.total > 0).map((row) => [row.name, row.total] as const),
        threshold,
      ),
      acLanguageData: languagePie(
        data.languages.filter((row) => row.ac > 0).map((row) => [row.name, row.ac] as const),
        threshold,
      ),
      statusData: pieChart(
        Object.entries(data.results)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([code, count]): [string, number] => [USER_DISPLAY_CODES[code] ?? code, count]),
      ),
      acRate: barChart(
        data.languages
          .filter((row) => row.total > 0)
          .sort((a, b) => a.total - b.total || a.name.localeCompare(b.name))
          .map((row): [string, number] => [row.name, (row.ac / row.total) * 100]),
      ),
      computedAt: data.computedAt,
      scanned: data.scanned,
      truncated: data.truncated,
    };
  },
});
