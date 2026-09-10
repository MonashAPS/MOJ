/**
 * Contest formats: the registry plus the participation update entry point.
 */

import type { ParticipationUpdate, UpdateParticipationInput } from './base';
import { getFormatOrDefault } from './registry';
import type { ContestRow } from '../types';

/** The format a contest row uses. */
export function getContestFormat(contest: Pick<ContestRow, 'formatName'>) {
  return getFormatOrDefault(contest.formatName);
}

/** `Contest.format.validate(config)` for a contest row. */
export function validateContestFormatConfig(
  formatName: string | null | undefined,
  config: unknown,
): void {
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

export * from './base';
export * from './labels';
export * from './registry';
export { atcoderFormat, ATCODER_DEFAULTS, resolveAtcoderConfig, validateAtcoderConfig } from './atcoder';
export { defaultFormat, validateDefaultConfig } from './default';
export { ecooFormat, ECOO_DEFAULTS, resolveEcooConfig, validateEcooConfig } from './ecoo';
export { icpcFormat, ICPC_DEFAULTS, resolveIcpcConfig, validateIcpcConfig } from './icpc';
export { ioi16Format, IOI16_DEFAULTS } from './ioi16';
export {
  legacyIoiFormat,
  LEGACY_IOI_DEFAULTS,
  resolveLegacyIoiConfig,
  validateLegacyIoiConfig,
} from './legacyIoi';
export { computeMaxPointsRows, PENALTY_IGNORED_RESULTS } from './penalty';
export type { MaxPointsRow } from './penalty';
