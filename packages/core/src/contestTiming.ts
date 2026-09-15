/**
 * Contest and participation clock rules.
 *
 * Source: judge/models/contest.py (`Contest.started`, `Contest.ended`,
 * `ContestParticipation.start`, `.end_time`, `.ended`, `.time_remaining`) and
 * `ContestJoin.join_contest` in judge/views/contests.py.
 *
 * `timeLimit` is in seconds (DMOJ stores a `DurationField`); `null` or
 * `undefined` means "the whole contest window".
 */

import {
  contestIsAccessibleBy,
  contestIsLiveJoinableBy,
  contestIsSpectatableBy,
  hasPerm,
  isAuthenticated,
  isSuperuser,
} from "./permissions";
import {
  type ContestParticipationRow,
  type ContestRow,
  type Id,
  PARTICIPATION_LIVE,
  PARTICIPATION_SPECTATE,
  type Viewer,
} from "./types";

/** `ContestParticipation.live`. */
export function participationIsLive(participation: ContestParticipationRow): boolean {
  return participation.virtual === PARTICIPATION_LIVE;
}

/** `ContestParticipation.spectate`. */
export function participationIsSpectating(participation: ContestParticipationRow): boolean {
  return participation.virtual === PARTICIPATION_SPECTATE;
}

/** `ContestParticipation.virtual > 0`. */
export function participationIsVirtual(participation: ContestParticipationRow): boolean {
  return participation.virtual > 0;
}

function hasTimeLimit(contest: ContestRow): contest is ContestRow & { readonly timeLimit: number } {
  // Python treats a zero timedelta as falsy, and so does DMOJ here.
  return contest.timeLimit != null && contest.timeLimit !== 0;
}

/**
 * `ContestParticipation.start` (contest.py:561).
 *
 * Live and spectating participations of an untimed contest start when the
 * contest does; everything else starts when the participation was created.
 */
export function participationStart(participation: ContestParticipationRow, contest: ContestRow): number {
  const untimed = contest.timeLimit == null;

  if (untimed && (participationIsLive(participation) || participationIsSpectating(participation))) {
    return contest.startTime;
  }

  return participation.realStart;
}

/**
 * `ContestParticipation.end_time` (contest.py:566).
 *
 * - spectating: the contest end
 * - virtual: real start plus the time limit, or plus the whole window
 * - live: the contest end, or the earlier of (real start + limit) and the end
 */
export function participationEndTime(participation: ContestParticipationRow, contest: ContestRow): number {
  if (participationIsSpectating(participation)) return contest.endTime;

  if (participation.virtual !== PARTICIPATION_LIVE) {
    if (hasTimeLimit(contest)) return participation.realStart + contest.timeLimit * 1000;

    return participation.realStart + (contest.endTime - contest.startTime);
  }

  if (contest.timeLimit == null) return contest.endTime;

  return Math.min(participation.realStart + contest.timeLimit * 1000, contest.endTime);
}

/** `ContestParticipation.ended` (contest.py:584). */
export function participationHasEnded(
  participation: ContestParticipationRow,
  contest: ContestRow,
  now: number = Date.now(),
): boolean {
  return participationEndTime(participation, contest) < now;
}

/** `ContestParticipation.time_remaining` (contest.py:588), in milliseconds, or null. */
export function participationTimeRemaining(
  participation: ContestParticipationRow,
  contest: ContestRow,
  now: number = Date.now(),
): number | null {
  const end = participationEndTime(participation, contest);

  return end >= now ? end - now : null;
}

/** `Contest.contest_window_length` (contest.py:272), in milliseconds. */
export function contestWindowLength(contest: ContestRow): number {
  return contest.endTime - contest.startTime;
}

/** `Contest.time_before_start` (contest.py:285), in milliseconds, or null. */
export function contestTimeBeforeStart(contest: ContestRow, now: number = Date.now()): number | null {
  return contest.startTime >= now ? contest.startTime - now : null;
}

/** `Contest.time_before_end` (contest.py:292), in milliseconds, or null. */
export function contestTimeBeforeEnd(contest: ContestRow, now: number = Date.now()): number | null {
  return contest.endTime >= now ? contest.endTime - now : null;
}

export type ContestJoinDecision =
  /** Join (or resume) the live participation. */
  | { readonly kind: "live"; readonly participationId?: Id }
  /** Join (or resume) the spectating participation. */
  | { readonly kind: "spectate"; readonly participationId?: Id }
  /** The contest is over: joining creates the n-th virtual participation. */
  | { readonly kind: "virtual"; readonly virtualId: number }
  | { readonly kind: "notStarted" }
  | { readonly kind: "banned" }
  | { readonly kind: "accessCodeRequired" }
  | { readonly kind: "cannotEnter" }
  | { readonly kind: "loginRequired" };

export interface ContestJoinOptions {
  readonly now?: number;
  /** Every participation the viewer already has in this contest. */
  readonly participations?: readonly ContestParticipationRow[];
  /** The access code the user supplied, if any. */
  readonly accessCode?: string | null;
}

/**
 * `ContestJoin.join_contest` (judge/views/contests.py:384) as a pure decision.
 *
 * Assumes the contest is accessible (the view has already run the access check
 * through `ContestMixin`). An access code is only demanded when a *new*
 * participation would be created, exactly as DMOJ does it.
 */
export function contestJoinDecision(
  contest: ContestRow,
  viewer: Viewer,
  options: ContestJoinOptions = {},
): ContestJoinDecision {
  if (!isAuthenticated(viewer)) return { kind: "loginRequired" };

  const now = options.now ?? Date.now();
  const participations = options.participations ?? [];

  const liveParticipation =
    participations.find((p) => p.virtual === PARTICIPATION_LIVE && p.profileId === viewer.id) ?? null;

  const context = { now, liveParticipation };

  const isEditor =
    (contest.authorProfileIds ?? []).includes(viewer.id) ||
    (contest.curatorProfileIds ?? []).includes(viewer.id);

  const isTester = (contest.testerProfileIds ?? []).includes(viewer.id);

  if (contest.startTime > now && !(isEditor || isTester)) return { kind: "notStarted" };

  if (!isSuperuser(viewer) && (contest.bannedProfileIds ?? []).includes(viewer.id)) {
    return { kind: "banned" };
  }

  const canEdit =
    hasPerm(viewer, "judge.edit_all_contest") || (hasPerm(viewer, "judge.edit_own_contest") && isEditor);

  const requiresAccessCode = !canEdit && !!contest.accessCode && options.accessCode !== contest.accessCode;

  if (contest.endTime < now) {
    if (requiresAccessCode) return { kind: "accessCodeRequired" };
    const highest = participations.reduce((max, p) => Math.max(max, p.virtual), 0);

    return { kind: "virtual", virtualId: Math.max(highest + 1, 1) };
  }

  let type: number;

  if (contestIsLiveJoinableBy(contest, viewer, context)) type = PARTICIPATION_LIVE;
  else if (contestIsSpectatableBy(contest, viewer)) type = PARTICIPATION_SPECTATE;
  else return { kind: "cannotEnter" };

  const existing = participations.find((p) => p.virtual === type) ?? null;

  if (!existing) {
    if (requiresAccessCode) return { kind: "accessCodeRequired" };

    return type === PARTICIPATION_LIVE ? { kind: "live" } : { kind: "spectate" };
  }

  if (participationHasEnded(existing, contest, now)) {
    // A finished window drops the user into spectating.
    const spectating = participations.find((p) => p.virtual === PARTICIPATION_SPECTATE) ?? null;

    return spectating ? { kind: "spectate", participationId: spectating.id } : { kind: "spectate" };
  }

  return type === PARTICIPATION_LIVE
    ? { kind: "live", participationId: existing.id }
    : { kind: "spectate", participationId: existing.id };
}

/**
 * `Profile.update_contest()` (judge/models/profile.py:294): whether contest
 * mode should be dropped, because the participation window closed or the
 * contest stopped being accessible to the user.
 */
export function shouldLeaveContest(
  participation: ContestParticipationRow | null | undefined,
  contest: ContestRow | null | undefined,
  viewer: Viewer,
  now: number = Date.now(),
): boolean {
  if (!participation || !contest) return false;

  return participationHasEnded(participation, contest, now) || !contestIsAccessibleBy(contest, viewer);
}
