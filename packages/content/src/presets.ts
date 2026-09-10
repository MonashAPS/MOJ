/**
 * Preset definitions, one per DMOJ `MARKDOWN_STYLES` entry.
 *
 * DMOJ has three underlying style objects:
 *
 *   MARKDOWN_DEFAULT_STYLE / MARKDOWN_USER_LARGE_STYLE
 *     safe_mode = True   -> raw HTML is escaped, not parsed
 *     no `bleach` key    -> nothing to sanitise, because nothing unsafe can be produced
 *
 *   MARKDOWN_STAFF_EDITABLE_STYLE
 *     safe_mode = False  -> raw HTML is parsed
 *     bleach             -> BLEACH_USER_SAFE_TAGS + BLEACH_USER_SAFE_ATTRS + all CSS props + MathML
 *
 *   MARKDOWN_ADMIN_EDITABLE_STYLE
 *     safe_mode = False  -> raw HTML is parsed
 *     no bleach          -> output is trusted verbatim
 */

export const PRESET_NAMES = [
  "problem",
  "problem-full",
  "comment",
  "self-description",
  "blog",
  "solution",
  "contest",
  "contest-tag",
  "flatpage",
  "organization-about",
  "ticket",
  "license",
  "language",
  "judge",
  "default",
] as const;

export type Preset = (typeof PRESET_NAMES)[number];

export type SanitiseMode =
  /** DMOJ's `bleach` params on MARKDOWN_STAFF_EDITABLE_STYLE. */
  | "user-safe"
  /** DMOJ's MARKDOWN_ADMIN_EDITABLE_STYLE: no bleach pass at all. */
  | "trusted";

export interface PresetConfig {
  /** DMOJ `safe_mode`: when true raw HTML is escaped into text instead of parsed. */
  readonly rawHtml: boolean;
  /** DMOJ `bleach`: `trusted` means the HTML is emitted verbatim. */
  readonly sanitise: SanitiseMode;
  /** DMOJ `nofollow`, defaulting to True in `judge.jinja2.markdown.markdown`. */
  readonly nofollow: boolean;
  /** DMOJ `use_camo`: rewrite remote image sources through the camo proxy. */
  readonly camo: boolean;
  /** AwesomeRenderer.header adds 2 to every heading level, for every style. */
  readonly demoteHeadings: number;
}

const STAFF_EDITABLE: PresetConfig = {
  rawHtml: true,
  sanitise: "user-safe",
  nofollow: true,
  camo: true,
  demoteHeadings: 2,
};

const ADMIN_EDITABLE: PresetConfig = {
  rawHtml: true,
  sanitise: "trusted",
  nofollow: true,
  camo: true,
  demoteHeadings: 2,
};

const USER_WRITTEN: PresetConfig = {
  rawHtml: false,
  sanitise: "user-safe",
  nofollow: true,
  camo: true,
  demoteHeadings: 2,
};

export const PRESETS: Readonly<Record<Preset, PresetConfig>> = {
  default: USER_WRITTEN,
  comment: USER_WRITTEN,
  "self-description": USER_WRITTEN,
  "organization-about": USER_WRITTEN,
  ticket: USER_WRITTEN,
  problem: STAFF_EDITABLE,
  contest: STAFF_EDITABLE,
  "contest-tag": STAFF_EDITABLE,
  language: STAFF_EDITABLE,
  license: STAFF_EDITABLE,
  judge: STAFF_EDITABLE,
  blog: STAFF_EDITABLE,
  solution: STAFF_EDITABLE,
  "problem-full": ADMIN_EDITABLE,
  flatpage: ADMIN_EDITABLE,
};

export function presetConfig(preset: Preset | string): PresetConfig {
  const found = (PRESETS as Record<string, PresetConfig | undefined>)[preset];
  return found ?? PRESETS.default;
}

/** Presets whose source may contain raw HTML that reaches the output tree. */
export function presetAllowsRawHtml(preset: Preset | string): boolean {
  return presetConfig(preset).rawHtml;
}
