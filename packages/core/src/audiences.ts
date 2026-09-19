/**
 * Audiences: the one vocabulary for who may see something on a contest or a
 * problem, so a file, the scoreboard and the People tab all mean the same
 * people by the same names.
 */

import type { Audience, AudiencePolicy, Moment } from "./types";

export const AUDIENCES: readonly Audience[] = ["staff", "testers", "spectators", "contestants", "everyone"];

/** A problem has nobody to join or watch it, so it offers fewer. */
export const PROBLEM_AUDIENCES: readonly Audience[] = ["staff", "testers", "everyone"];

export const MOMENTS: readonly Moment[] = ["start", "ownEnd", "end"];

/** A file cannot wait for a window it knows nothing about. */
export const FILE_MOMENTS: readonly Moment[] = ["start", "end"];

/** Which audiences a viewer is in, decided by whoever holds the data. */
export type AudienceMembership = Readonly<Record<Audience, boolean>>;

/** Where the clocks stand for this viewer. */
export interface PolicyClock {
  /** The contest has ended; a problem never has. */
  readonly ended: boolean;
  /** The viewer's own window has ended, which the contest ending implies. */
  readonly ownEnded: boolean;
}

/** Whether a policy admits a viewer now. Staff are always admitted. */
export function policyAdmits(
  policy: AudiencePolicy,
  viewer: AudienceMembership,
  clock: PolicyClock,
): boolean {
  if (viewer.staff) return true;

  if (!policy.audiences.some((audience) => viewer[audience])) return false;

  switch (policy.from) {
    case "start":
      return true;
    case "ownEnd":
      return clock.ended || clock.ownEnded;
    case "end":
      return clock.ended;
  }
}

/** Whether a policy admits a member of the public now, with no standing of their own. */
export function policyIsPublic(policy: AudiencePolicy, ended: boolean): boolean {
  return policyAdmits(
    policy,
    { staff: false, testers: false, spectators: false, contestants: false, everyone: true },
    { ended, ownEnded: ended },
  );
}
