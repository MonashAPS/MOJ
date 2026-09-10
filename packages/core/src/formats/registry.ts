/**
 * The contest format registry (judge/contest_format/registry.py).
 */

import type { ContestFormat } from './base.js';
import { UnknownContestFormatError } from './base.js';
import { atcoderFormat } from './atcoder.js';
import { defaultFormat } from './default.js';
import { ecooFormat } from './ecoo.js';
import { icpcFormat } from './icpc.js';
import { ioi16Format } from './ioi16.js';
import { legacyIoiFormat } from './legacyIoi.js';

export const FORMATS: Readonly<Record<string, ContestFormat>> = {
  atcoder: atcoderFormat,
  default: defaultFormat,
  ecoo: ecooFormat,
  icpc: icpcFormat,
  ioi: legacyIoiFormat,
  ioi16: ioi16Format,
};

/** `contest_format.formats[name]`; throws for an unknown name. */
export function getFormat(name: string): ContestFormat {
  const format = FORMATS[name];
  if (!format) throw new UnknownContestFormatError(name);
  return format;
}

/** Like `getFormat`, but falls back to `default` for an absent or unknown name. */
export function getFormatOrDefault(name: string | null | undefined): ContestFormat {
  if (!name) return defaultFormat;
  return FORMATS[name] ?? defaultFormat;
}

/** `contest_format.choices()`: `[key, display name]` pairs, sorted by key. */
export function formatChoices(): [string, string][] {
  return Object.keys(FORMATS)
    .sort()
    .map((key) => [key, (FORMATS[key] as ContestFormat).displayName]);
}
