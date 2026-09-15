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
      .first();

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
const DEFAULT_ACCENT_RGB: Rgb = [0x29, 0x41, 0xa5];

const DEFAULT_NAV_RGB: Rgb = [0x10, 0x1a, 0x3d];

const DEFAULT_ACCENT = toHex(DEFAULT_ACCENT_RGB);

const DEFAULT_NAV = toHex(DEFAULT_NAV_RGB);

export type Branding = {
  siteName: string;
  siteLongName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  accentColor: string;
  accentColorDark: string;
  accentFillDark: string;
  accentFillHoverDark: string;
  accentFillActiveDark: string;
  navColor: string;
  navColorDark: string;
  titlebarColor: string;
  titlebarColorDark: string;
  contestBarColor: string;
  contestBarColorDark: string;
  customCss: string;
  themeDefault: "system" | "light" | "dark";
  /** The operator's colours differ from the ones they would have had anyway. */
  colorsCustomised: boolean;
  isCustomised: boolean;
};

function parseHex(value: string): Rgb | null {
  const [, digits] = /^#?([0-9a-f]{6})$/i.exec(value.trim()) ?? [];

  if (digits === undefined) return null;
  const int = Number.parseInt(digits, 16);

  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const part = (value: number) =>
    Math.round(Math.max(0, Math.min(255, value)))
      .toString(16)
      .padStart(2, "0");

  return `#${part(r)}${part(g)}${part(b)}`;
}

/* The light-to-dark relation ---------------------------------------------- *
 * `tokens.css` does not wash a colour towards white to get its dark
 * counterpart; it raises the lightness and keeps the hue and the chroma, which
 * is why #2f4fd0 becomes #8fa6ff rather than a grey-blue. Doing the same to an
 * operator's colours, in OKLab, gives a branded instance a dark palette built
 * the way the design system builds its own.
 *
 * Two rules, measured off the token file itself. The chrome keeps a little more
 * chroma as it lightens, because a dark ground eats saturation and a navy that
 * only gains lightness stops reading as navy; the accent gives some up, because
 * a light accent on a dark ground is a paler thing than its light-mode self.
 * The unit tests feed this function the token file's light values and check
 * that the token file's own dark values come back:
 *
 *   accent       #2f4fd0 -> #8fa6ff   L +0.259, chroma x0.65
 *   nav          #101a3d -> #16234a   L +0.029, chroma x1.1
 *   titlebar     #16234a -> #243766   L +0.081, chroma x1.1, off the dark nav
 *   contest bar  #101a3d -> #182448   L +0.039, and on dark it sits halfway
 *                between the dark nav and the dark titlebar
 *
 * The filled primary is the one thing on dark that does not take the lifted
 * accent: a fill light enough to read as text is too light to carry white text,
 * so it takes the light accent barely lifted, #2f4fd0 -> #3b5bdb, and its hover
 * and pressed states step off that.
 */
type Rgb = [number, number, number];

type Lab = [number, number, number];

const ACCENT_DARK_LIFT = 0.259;

const ACCENT_DARK_CHROMA = 0.65;

const NAV_DARK_LIFT = 0.029;

const TITLEBAR_DARK_LIFT = 0.081;

const CONTEST_BAR_LIFT = 0.039;

const CHROME_CHROMA = 1.1;

const ACCENT_FILL_LIFT = 0.035;

const ACCENT_FILL_HOVER_LIFT = 0.05;

const ACCENT_FILL_ACTIVE_DROP = -0.05;

function toLinear(value: number): number {
  const c = value / 255;

  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  return (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055) * 255;
}

function toOklab([r, g, b]: Rgb): Lab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function toLinearRgb([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLab back to sRGB, pulling the chroma in until the colour fits the gamut
 *  the way a browser maps `oklch()`. A lifted blue clipped channel by channel
 *  would come back a different hue. */
function fromOklab([L, a, b]: Lab): Rgb {
  const fits = (lab: Lab) => toLinearRgb(lab).every((c) => c >= -0.0005 && c <= 1.0005);
  let scale = 1;

  if (!fits([L, a, b])) {
    let low = 0;
    let high = 1;

    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2;

      if (fits([L, a * mid, b * mid])) low = mid;
      else high = mid;
    }

    scale = low;
  }

  const [r, g, bl] = toLinearRgb([L, a * scale, b * scale]);

  return [fromLinear(r), fromLinear(g), fromLinear(bl)];
}

/** Raise a colour's lightness, hold its hue, and scale its chroma. */
function lift(rgb: Rgb, amount: number, chroma: number): Rgb {
  const [L, a, b] = toOklab(rgb);

  return fromOklab([Math.min(1, L + amount), a * chroma, b * chroma]);
}

/** Halfway between two colours, in OKLab, so the midpoint is the one the eye
 *  expects rather than the one the channels average to. */
function halfway(from: Rgb, to: Rgb): Rgb {
  const a = toOklab(from);
  const b = toOklab(to);

  return fromOklab([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
}

export type BrandingPalette = {
  accent: string;
  accentDark: string;
  accentFillDark: string;
  accentFillHoverDark: string;
  accentFillActiveDark: string;
  nav: string;
  navDark: string;
  titlebar: string;
  titlebarDark: string;
  contestBar: string;
  contestBarDark: string;
};

/**
 * The operator picks two colours and the other six follow. Pure, so the tests
 * can hand it `tokens.css`'s light values and hold what comes back against
 * `tokens.css`'s dark ones.
 */
export function brandingPalette(accentColor: string, navColor: string): BrandingPalette {
  const accent = parseHex(accentColor) ?? DEFAULT_ACCENT_RGB;
  const nav = parseHex(navColor) ?? DEFAULT_NAV_RGB;
  const navDark = lift(nav, NAV_DARK_LIFT, CHROME_CHROMA);
  const titlebarDark = lift(navDark, TITLEBAR_DARK_LIFT, CHROME_CHROMA);
  const fillDark = lift(accent, ACCENT_FILL_LIFT, 1);

  return {
    accent: toHex(accent),
    accentDark: toHex(lift(accent, ACCENT_DARK_LIFT, ACCENT_DARK_CHROMA)),
    accentFillDark: toHex(fillDark),
    accentFillHoverDark: toHex(lift(fillDark, ACCENT_FILL_HOVER_LIFT, 1)),
    accentFillActiveDark: toHex(lift(fillDark, ACCENT_FILL_ACTIVE_DROP, 1)),
    nav: toHex(nav),
    navDark: toHex(navDark),
    // In light the band wears the bar's own navy, as the token file has it.
    titlebar: toHex(nav),
    titlebarDark: toHex(titlebarDark),
    contestBar: toHex(lift(nav, CONTEST_BAR_LIFT, CHROME_CHROMA)),
    contestBarDark: toHex(halfway(navDark, titlebarDark)),
  };
}

/** A saved colour is an override only when it is not the value the instance
 *  would have had anyway: the branding form offers the defaults, and saving it
 *  unchanged must not start overriding the token file. */
function isOverride(value: string | undefined, fallback: string): boolean {
  if (!value) return false;
  const rgb = parseHex(value);

  return rgb !== null && toHex(rgb) !== fallback;
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

    const palette = brandingPalette(
      settings?.accentColor ?? DEFAULT_ACCENT,
      settings?.navColor ?? DEFAULT_NAV,
    );

    const colorsCustomised =
      isOverride(settings?.accentColor, DEFAULT_ACCENT) || isOverride(settings?.navColor, DEFAULT_NAV);

    return {
      siteName: settings?.siteName ?? "MOJ",
      siteLongName: settings?.siteLongName ?? "MAPS Online Judge",
      logoUrl: settings?.logoStorageId ? await ctx.storage.getUrl(settings.logoStorageId) : null,
      faviconUrl: settings?.faviconStorageId ? await ctx.storage.getUrl(settings.faviconStorageId) : null,
      accentColor: palette.accent,
      accentColorDark: palette.accentDark,
      accentFillDark: palette.accentFillDark,
      accentFillHoverDark: palette.accentFillHoverDark,
      accentFillActiveDark: palette.accentFillActiveDark,
      navColor: palette.nav,
      navColorDark: palette.navDark,
      titlebarColor: palette.titlebar,
      titlebarColorDark: palette.titlebarDark,
      contestBarColor: palette.contestBar,
      contestBarColorDark: palette.contestBarDark,
      customCss: settings?.customCss ?? "",
      themeDefault: settings?.themeDefault ?? "system",
      colorsCustomised,
      isCustomised:
        colorsCustomised ||
        Boolean(settings?.logoStorageId || settings?.faviconStorageId || settings?.customCss),
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
      .first();

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
      .first();

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
