/**
 * The contest format registry (judge/contest_format/registry.py).
 */

import { atcoderFormat } from "./atcoder";
import type { ContestFormat } from "./base";
import { UnknownContestFormatError } from "./base";
import { defaultFormat } from "./default";
import { ecooFormat } from "./ecoo";
import { icpcFormat } from "./icpc";
import { ioi16Format } from "./ioi16";
import { legacyIoiFormat } from "./legacyIoi";

/** The registry keys, which are also DMOJ's stored `Contest.format_name` values. */
export type ContestFormatName = "atcoder" | "default" | "ecoo" | "icpc" | "ioi" | "ioi16";

export const FORMATS: Readonly<Record<ContestFormatName, ContestFormat>> = {
  atcoder: atcoderFormat,
  default: defaultFormat,
  ecoo: ecooFormat,
  icpc: icpcFormat,
  ioi: legacyIoiFormat,
  ioi16: ioi16Format,
};

/** Whether a stored format name is one the registry knows. */
export function isContestFormatName(name: string): name is ContestFormatName {
  return name in FORMATS;
}

/** `contest_format.formats[name]`; throws for an unknown name. */
export function getFormat(name: string): ContestFormat {
  if (!isContestFormatName(name)) throw new UnknownContestFormatError(name);

  return FORMATS[name];
}

/** Like `getFormat`, but falls back to `default` for an absent or unknown name. */
export function getFormatOrDefault(name: string | null | undefined): ContestFormat {
  if (!name || !isContestFormatName(name)) return defaultFormat;

  return FORMATS[name];
}

/** `contest_format.choices()`: `[key, display name]` pairs, sorted by key. */
export function formatChoices(): [ContestFormatName, string][] {
  const choices: [ContestFormatName, string][] = [];

  for (const [name, format] of Object.entries(FORMATS)) {
    if (isContestFormatName(name)) choices.push([name, format.displayName]);
  }

  return choices.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}
