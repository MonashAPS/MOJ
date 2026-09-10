/**
 * Contest problem labels.
 *
 * DMOJ lets a contest carry a Lua function (`Contest.problem_label_script`)
 * that turns a zero-based index into a label. MOJ replaces the sandboxed Lua
 * with three schemes on the contest row (SPEC section 4): `letters`, `numbers`
 * and `custom` with an explicit `customLabels` array. When the contest does not
 * pick a scheme the format's own default applies, which is DMOJ's behaviour
 * (`default` numbers its problems, `icpc` letters them).
 */

import type { ContestRow, LabelScheme } from '../types';
import { letterLabel, numberLabel } from './base';
import { getFormatOrDefault } from './registry';

export interface LabelOptions {
  readonly scheme?: LabelScheme;
  readonly customLabels?: readonly string[];
  /** Used when `scheme` is absent: the format decides. */
  readonly formatName?: string;
}

/** The label for a zero-based contest problem index. */
export function getLabelForProblem(index: number, options: LabelOptions = {}): string {
  const scheme = options.scheme ?? getFormatOrDefault(options.formatName).defaultLabelScheme;
  switch (scheme) {
    case 'letters':
      return letterLabel(index);
    case 'custom': {
      const labels = options.customLabels ?? [];
      // Past the end of the list, fall back to letters so a short list never
      // renders blank headers.
      return labels[index] ?? letterLabel(index);
    }
    default:
      return numberLabel(index);
  }
}

/** `Contest.get_label_for_problem` for a contest row. */
export function getContestLabelForProblem(contest: ContestRow, index: number): string {
  return getLabelForProblem(index, {
    scheme: contest.labelScheme,
    customLabels: contest.customLabels,
    formatName: contest.formatName,
  });
}

/** Labels for a whole contest, in problem order. */
export function getContestLabels(contest: ContestRow, count: number): string[] {
  return Array.from({ length: count }, (_unused, index) =>
    getContestLabelForProblem(contest, index),
  );
}
