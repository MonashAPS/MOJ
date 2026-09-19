/**
 * Contest problem labels.
 *
 * DMOJ lets a contest carry a Lua function (`Contest.problem_label_script`)
 * that turns a zero-based index into a label, and its `default` format numbers
 * its problems. Ours letters them — A, B, C — whatever format a contest runs
 * under, because that is how a contest problem is named out loud and in every
 * scoreboard anybody here has read. A contest naming its own problems wins.
 */

import type { ContestLabels, ContestRow } from "../types";
import { letterLabel } from "./base";

/** The label for a zero-based contest problem index. */
export function getLabelForProblem(index: number, labels: ContestLabels): string {
  // Past the end of a custom list, fall back to letters so a short list never
  // renders blank headers.
  if (labels.kind === "custom") return labels.labels[index] ?? letterLabel(index);

  return letterLabel(index);
}

/** `Contest.get_label_for_problem` for a contest row. */
export function getContestLabelForProblem(contest: ContestRow, index: number): string {
  return getLabelForProblem(index, contest.labels);
}

/** Labels for a whole contest, in problem order. */
export function getContestLabels(contest: ContestRow, count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => getContestLabelForProblem(contest, index));
}
