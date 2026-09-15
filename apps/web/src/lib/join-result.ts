import type { JoinResult } from "@/app/contest/actions";

/**
 * The sentence in a join/leave result, if it carries one.
 *
 * A join can come back asking to be confirmed rather than refused, so the result
 * is a union and reading `.error` off it no longer type-checks.
 */
export function joinErrorOf(state: JoinResult | null): string | undefined {
  return state && "error" in state ? state.error : undefined;
}
