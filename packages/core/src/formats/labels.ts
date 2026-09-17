/**
 * Contest problem labels.
 *
 * DMOJ lets a contest carry a Lua function (`Contest.problem_label_script`)
 * that turns a zero-based index into a label, and its `default` format numbers
 * its problems. Ours letters them — A, B, C — whatever format a contest runs
 * under, because that is how a contest problem is named out loud and in every
 * scoreboard anybody here has read.
 *
 * A contest naming its own problems still wins, through `customLabels`. The
 * `numbers` scheme stays in the union so no stored row has to be rewritten to
 * deploy this, but nothing renders it any more.
 */

import type { ContestRow, LabelScheme } from "../types";
import { letterLabel } from "./base";

export interface LabelOptions {
  readonly scheme?: LabelScheme;
  readonly customLabels?: readonly string[];
}

/** The label for a zero-based contest problem index. */
export function getLabelForProblem(index: number, options: LabelOptions = {}): string {
  if (options.scheme === "custom") {
    const labels = options.customLabels ?? [];

    // Past the end of the list, fall back to letters so a short list never
    // renders blank headers.
    return labels[index] ?? letterLabel(index);
  }

  return letterLabel(index);
}

/** `Contest.get_label_for_problem` for a contest row. */
export function getContestLabelForProblem(contest: ContestRow, index: number): string {
  return getLabelForProblem(index, { scheme: contest.labelScheme, customLabels: contest.customLabels });
}

/** Labels for a whole contest, in problem order. */
export function getContestLabels(contest: ContestRow, count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => getContestLabelForProblem(contest, index));
}
