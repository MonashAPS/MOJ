/**
 * Audiences: the fixed vocabulary for "who" on a contest or a problem.
 *
 * Everything that chooses who may see something picks from these, so the word
 * on a file, on the scoreboard setting and on the People tab is the same word
 * meaning the same people.
 */

/**
 * - `staff`: the editors, and always in on everything.
 * - `testers`, `spectators`: the People tab's lists.
 * - `contestants`: anyone who has joined the contest.
 * - `everyone`: anyone who can see the contest or the problem at all.
 */
export type Audience = "staff" | "testers" | "spectators" | "contestants" | "everyone";

export const AUDIENCES: readonly Audience[] = ["staff", "testers", "spectators", "contestants", "everyone"];

/** A problem has no contest to join or watch, so it offers fewer. */
export const PROBLEM_AUDIENCES: readonly Audience[] = ["staff", "testers", "everyone"];

/** Which audiences a viewer is in, decided by whoever holds the data. */
export type AudienceMembership = Readonly<Record<Audience, boolean>>;

/** A file's audience: who, and from when. Staff need no listing. */
export interface FileAudience {
  readonly audiences: readonly Audience[];
  /** `end` holds the file until the contest is over; a problem's file is always `now`. */
  readonly from: "now" | "end";
}

/** Whether a viewer may download a file. */
export function artefactIsVisible(file: FileAudience, viewer: AudienceMembership, ended: boolean): boolean {
  if (viewer.staff) return true;

  if (file.from === "end" && !ended) return false;

  return file.audiences.some((audience) => viewer[audience]);
}
