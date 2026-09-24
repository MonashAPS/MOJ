import type { ContestRow } from "../types";

/** Legacy rows default to start; null is an explicit Never choice. */
export function problemListReleasePolicy(
  contest: Pick<ContestRow, "problemListReleaseAt">,
): "start" | "end" | null {
  return contest.problemListReleaseAt === undefined ? "start" : contest.problemListReleaseAt;
}
