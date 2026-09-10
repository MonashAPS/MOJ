// Site chrome: the navigation bar, the misc config keys DMOJ kept in
// `MiscConfig`, flat pages, licenses and the settings document.
// judge/models/interface.py, judge/views/license.py.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";

export type NavNode = {
  _id: Id<"navigationBar">;
  key: string;
  label: string;
  path: string;
  regex: string;
  order: number;
  children: NavNode[];
};

export const nav = query({
  args: {},
  handler: async (ctx): Promise<NavNode[]> => {
    const rows = await ctx.db.query("navigationBar").withIndex("by_order").collect();
    return buildTree(rows);
  },
});

export const miscConfig = query({
  args: {},
  handler: async (ctx): Promise<Record<string, string>> => {
    const rows = await ctx.db.query("miscConfig").collect();
    const out: Record<string, string> = {};
    for (const row of rows) out[row.key] = row.value;
    return out;
  },
});

/** The preset `@moj/content` renders flat page bodies with. */
export const FLATPAGE_PRESET = "flatpage" as const;
/** The preset `@moj/content` renders license texts with. */
export const LICENSE_PRESET = "license" as const;

export const flatPage = query({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const row = await ctx.db
      .query("flatPages")
      .withIndex("by_url", (q) => q.eq("url", url))
      .unique();
    return row === null ? null : { ...row, contentPreset: FLATPAGE_PRESET };
  },
});

export const flatPages = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("flatPages").collect(),
});

export const settings = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
      .unique();
  },
});

/* -------------------------------------------------------------------------- */
/* Branding (SPEC section 24)                                                 */
/* -------------------------------------------------------------------------- */

/** The defaults live in `packages/ui/src/tokens.css`; these mirror the two an
 *  operator may override, so the query can always answer with a usable pair. */
const DEFAULT_ACCENT = "#2941a5";
const DEFAULT_NAV = "#101a3d";

export type Branding = {
  siteName: string;
  siteLongName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  accentColor: string;
  accentColorDark: string;
  navColor: string;
  titlebarColor: string;
  titlebarColorDark: string;
  customCss: string;
  themeDefault: "system" | "light" | "dark";
  isCustomised: boolean;
};

function parseHex(value: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const int = Number.parseInt(match[1] as string, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const part = (value: number) =>
    Math.round(Math.max(0, Math.min(255, value)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Dark mode needs the accent lifted off a navy ground, the way `tokens.css`
 *  lifts the default one; mixing towards white by a fixed ratio is enough. */
function lighten(rgb: [number, number, number], ratio: number): [number, number, number] {
  return [rgb[0] + (255 - rgb[0]) * ratio, rgb[1] + (255 - rgb[1]) * ratio, rgb[2] + (255 - rgb[2]) * ratio];
}

function darken(rgb: [number, number, number], ratio: number): [number, number, number] {
  return [rgb[0] * (1 - ratio), rgb[1] * (1 - ratio), rgb[2] * (1 - ratio)];
}

/** WCAG relative luminance, so the console can warn about an unreadable accent. */
export function relativeLuminance(rgb: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastWithWhite(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const luminance = relativeLuminance(rgb);
  return Math.round((1.05 / (luminance + 0.05)) * 100) / 100;
}

/**
 * Read once per request by the shell, which emits the overrides as CSS
 * variables on `:root`. Everything an operator has not set comes back as the
 * design system's own value, so the token file stays the source of defaults.
 */
export const branding = query({
  args: {},
  handler: async (ctx): Promise<Branding> => {
    const settings = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
      .unique();

    const accent = (settings?.accentColor && parseHex(settings.accentColor)) || parseHex(DEFAULT_ACCENT);
    const nav = (settings?.navColor && parseHex(settings.navColor)) || parseHex(DEFAULT_NAV);
    const accentRgb = accent as [number, number, number];
    const navRgb = nav as [number, number, number];

    return {
      siteName: settings?.siteName ?? "MOJ",
      siteLongName: settings?.siteLongName ?? "MAPS Online Judge",
      logoUrl: settings?.logoStorageId ? await ctx.storage.getUrl(settings.logoStorageId) : null,
      faviconUrl: settings?.faviconStorageId ? await ctx.storage.getUrl(settings.faviconStorageId) : null,
      accentColor: toHex(accentRgb),
      accentColorDark: toHex(lighten(accentRgb, 0.45)),
      navColor: toHex(navRgb),
      titlebarColor: toHex(navRgb),
      // The dark titlebar has to lift off the dark surface, as `--titlebar` does.
      titlebarColorDark: toHex(lighten(darken(navRgb, 0.1), 0.12)),
      customCss: settings?.customCss ?? "",
      themeDefault: settings?.themeDefault ?? "system",
      isCustomised: Boolean(
        settings?.logoStorageId ||
          settings?.faviconStorageId ||
          settings?.accentColor ||
          settings?.navColor ||
          settings?.customCss,
      ),
    };
  },
});

export const shell = query({
  args: {},
  handler: async (ctx) => {
    const [navRows, miscRows, siteSettings] = await Promise.all([
      ctx.db.query("navigationBar").withIndex("by_order").collect(),
      ctx.db.query("miscConfig").collect(),
      ctx.db
        .query("siteSettings")
        .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
        .unique(),
    ]);
    const misc: Record<string, string> = {};
    for (const row of miscRows) misc[row.key] = row.value;
    return { nav: buildTree(navRows), misc, settings: siteSettings };
  },
});

export const openOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("organizations").collect();
    return rows
      .filter((row) => row.isOpen)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => ({ _id: row._id, name: row.name, slug: row.slug, shortName: row.shortName }));
  },
});

function buildTree(rows: Doc<"navigationBar">[]): NavNode[] {
  const nodes = new Map<string, NavNode>();
  for (const row of rows) {
    nodes.set(row._id, {
      _id: row._id,
      key: row.key,
      label: row.label,
      path: row.path,
      regex: row.regex,
      order: row.order,
      children: [],
    });
  }
  const roots: NavNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row._id);
    if (!node) continue;
    const parent = row.parentId ? nodes.get(row.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: NavNode[]) => {
    list.sort((a, b) => a.order - b.order);
    for (const item of list) sort(item.children);
  };
  sort(roots);
  return roots;
}

/** `LicenseDetail` (judge/views/license.py:6). */
export const license = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("licenses")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return row === null ? null : { ...row, textPreset: LICENSE_PRESET };
  },
});

export const licenses = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("licenses").collect();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  },
});

/** `ContestTag`, for the contest list filters and the staff console. */
export const contestTags = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("contestTags").collect();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  },
});

/** One misc config value; DMOJ reads these through the `misc_config` filter. */
export const miscConfigValue = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("miscConfig")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return row?.value ?? null;
  },
});

/** The flat navigation rows, for the staff console's ordering editor. */
export const navRows = query({
  args: {},
  handler: async (ctx): Promise<Doc<"navigationBar">[]> => {
    const rows = await ctx.db.query("navigationBar").withIndex("by_order").collect();
    rows.sort((a, b) => a.order - b.order);
    return rows;
  },
});
