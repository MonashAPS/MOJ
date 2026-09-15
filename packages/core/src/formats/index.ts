/**
 * Contest formats: the registry plus the participation update entry point.
 */

import type { ContestRow } from "../types";
import type { ParticipationUpdate, UpdateParticipationInput } from "./base";
import { getFormatOrDefault } from "./registry";

/** The format a contest row uses. */
export function getContestFormat(contest: Pick<ContestRow, "formatName">) {
  return getFormatOrDefault(contest.formatName);
}

/** `Contest.format.validate(config)` for a contest row. */
export function validateContestFormatConfig(formatName: string | null | undefined, config: unknown): void {
  getFormatOrDefault(formatName).validate(config);
}

/**
 * `ContestParticipation.recompute_results()`: run the contest's format, then
 * apply the disqualification override (judge/models/contest.py:529).
 */
export function updateParticipation(input: UpdateParticipationInput): ParticipationUpdate {
  const format = getContestFormat(input.contest);
  const update = format.updateParticipation(input);

  if (input.participation.isDisqualified) {
    return { score: -9999, cumtime: 0, tiebreaker: 0, formatData: update.formatData };
  }

  return update;
}

export { ATCODER_DEFAULTS, atcoderFormat, resolveAtcoderConfig, validateAtcoderConfig } from "./atcoder";

export * from "./base";

export { defaultFormat, validateDefaultConfig } from "./default";

export { ECOO_DEFAULTS, ecooFormat, resolveEcooConfig, validateEcooConfig } from "./ecoo";

export { ICPC_DEFAULTS, icpcFormat, resolveIcpcConfig, validateIcpcConfig } from "./icpc";

export { IOI16_DEFAULTS, ioi16Format } from "./ioi16";

export * from "./labels";

export {
  LEGACY_IOI_DEFAULTS,
  legacyIoiFormat,
  resolveLegacyIoiConfig,
  validateLegacyIoiConfig,
} from "./legacyIoi";

export type { MaxPointsRow } from "./penalty";

export { computeMaxPointsRows, PENALTY_IGNORED_RESULTS } from "./penalty";

export * from "./registry";
