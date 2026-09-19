/**
 * DMOJ's permission rules, ported one for one.
 *
 * Every function here is pure: it takes plain rows and a viewer and returns a
 * boolean (or a small union). Anything DMOJ answers with a database query is
 * either denormalised onto the row (id arrays) or passed in through an options
 * object, so the caller decides how to fetch it.
 *
 * Sources: judge/models/problem.py, judge/models/contest.py,
 * judge/models/submission.py, judge/models/comment.py,
 * judge/models/interface.py, judge/models/profile.py.
 */

import { type ContestEntry, entryOf, joinLimitOf } from "./contest/settings";
import { participationHasEnded } from "./contestTiming";
import type {
  BlogPostRow,
  ClassRow,
  ContestParticipationRow,
  ContestRow,
  GlobalSubmissionSourceVisibility,
  Id,
  OrganizationRow,
  ProblemRow,
  ProfileRow,
  SolutionRow,
  SubmissionSourceVisibility,
  Viewer,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Permission codes                                                           */
/* -------------------------------------------------------------------------- */

/** Django's `user.is_authenticated`. */
export function isAuthenticated(viewer: Viewer): viewer is ProfileRow {
  return viewer !== null && viewer !== undefined;
}

/** Django's `user.is_superuser`. */
export function isSuperuser(viewer: Viewer): boolean {
  return isAuthenticated(viewer) && viewer.isSuperuser === true;
}

/** Django's `user.is_staff`. */
export function isStaff(viewer: Viewer): boolean {
  return isAuthenticated(viewer) && viewer.isStaff === true;
}

function codename(code: string): string {
  const dot = code.indexOf(".");

  return dot === -1 ? code : code.slice(dot + 1);
}

/**
 * Django's `user.has_perm(code)`.
 *
 * Anonymous users have nothing; superusers have everything (Django's
 * `ModelBackend.has_perm` short circuit). Codes are matched either fully
 * qualified (`judge.edit_all_problem`) or bare (`edit_all_problem`), because
 * the import carries DMOJ's `auth_permission.codename` values while the site
 * asks with the app label attached.
 */
export function hasPerm(viewer: Viewer, code: string): boolean {
  if (!isAuthenticated(viewer)) return false;

  if (viewer.isSuperuser) return true;

  const permissions = viewer.permissions ?? [];

  if (permissions.includes(code)) return true;

  const bare = codename(code);

  for (const permission of permissions) {
    if (codename(permission) === bare) return true;
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/* Small set helpers                                                          */
/* -------------------------------------------------------------------------- */

function has(ids: readonly Id[] | undefined, id: Id | undefined): boolean {
  return id !== undefined && (ids?.includes(id) ?? false);
}

function intersects(a: readonly Id[] | undefined, b: readonly Id[] | undefined): boolean {
  if (!a || !b || a.length === 0 || b.length === 0) return false;
  const set = new Set(b);

  for (const id of a) if (set.has(id)) return true;

  return false;
}

/* -------------------------------------------------------------------------- */
/* Problems                                                                   */
/* -------------------------------------------------------------------------- */

/** `Problem.author_ids | Problem.curators` (`Problem.editor_ids`). */
export function problemEditorIds(problem: ProblemRow): readonly Id[] {
  return [...(problem.authorProfileIds ?? []), ...(problem.curatorProfileIds ?? [])];
}

/** `Problem.is_editor(profile)`. */
export function problemIsEditor(problem: ProblemRow, profileId: Id): boolean {
  return has(problem.authorProfileIds, profileId) || has(problem.curatorProfileIds, profileId);
}

/** `Problem.is_editable_by(user)` (judge/models/problem.py:199). */
export function problemIsEditableBy(problem: ProblemRow, viewer: Viewer): boolean {
  if (!isAuthenticated(viewer)) return false;

  if (!hasPerm(viewer, "judge.edit_own_problem")) return false;

  if (
    hasPerm(viewer, "judge.edit_all_problem") ||
    (hasPerm(viewer, "judge.edit_public_problem") && problem.isPublic)
  ) {
    return true;
  }

  if (problemIsEditor(problem, viewer.id)) return true;

  if (problem.isOrganizationPrivate && intersects(problem.organizationIds, viewer.adminOfOrganizationIds)) {
    return true;
  }

  return false;
}

export interface ProblemAccessOptions {
  /**
   * True when this problem is one of the problems of the contest the viewer is
   * currently in (`ContestProblem.objects.filter(problem=self,
   * contest__users__id=profile.current_contest_id).exists()`).
   */
  readonly inCurrentContest?: boolean;
  /** DMOJ's `skip_contest_problem_check`. */
  readonly skipContestProblemCheck?: boolean;
}

/** `Problem.is_accessible_by(user, skip_contest_problem_check)` (problem.py:212). */
export function problemIsAccessibleBy(
  problem: ProblemRow,
  viewer: Viewer,
  options: ProblemAccessOptions = {},
): boolean {
  const { inCurrentContest = false, skipContestProblemCheck = false } = options;

  // Currently in a contest containing that problem: nothing else matters.
  if (!skipContestProblemCheck && isAuthenticated(viewer)) {
    if (viewer.currentParticipationId != null && inCurrentContest) return true;
  }

  if (problem.isPublic) {
    if (!problem.isOrganizationPrivate) return true;

    if (hasPerm(viewer, "judge.see_organization_problem")) return true;

    if (isAuthenticated(viewer) && intersects(problem.organizationIds, viewer.organizationIds)) {
      return true;
    }
  }

  if (!isAuthenticated(viewer)) return false;

  if (hasPerm(viewer, "judge.see_private_problem")) return true;

  if (problemIsEditableBy(problem, viewer) || problemIsEditor(problem, viewer.id)) return true;

  if (has(problem.testerProfileIds, viewer.id)) return true;

  return false;
}

/** `Problem.is_subs_manageable_by(user)` (problem.py:255). */
export function problemIsSubsManageableBy(problem: ProblemRow, viewer: Viewer): boolean {
  return (
    isStaff(viewer) && hasPerm(viewer, "judge.rejudge_submission") && problemIsEditableBy(problem, viewer)
  );
}

/**
 * `Problem.get_visible_problems(user)` (problem.py:259) as a predicate.
 *
 * The queryset and `is_accessible_by` must agree; DMOJ has a test asserting
 * exactly that, and so does this package.
 */
export function problemIsVisibleTo(problem: ProblemRow, viewer: Viewer): boolean {
  if (!isAuthenticated(viewer)) {
    // get_public_problems()
    return problem.isPublic && !problem.isOrganizationPrivate;
  }

  const editOwnProblem = hasPerm(viewer, "judge.edit_own_problem");
  const editPublicProblem = editOwnProblem && hasPerm(viewer, "judge.edit_public_problem");
  const editAllProblem = editOwnProblem && hasPerm(viewer, "judge.edit_all_problem");

  if (hasPerm(viewer, "judge.see_private_problem") || editAllProblem) return true;

  let q = problem.isPublic;

  if (!(hasPerm(viewer, "judge.see_organization_problem") || editPublicProblem)) {
    q =
      q &&
      (!problem.isOrganizationPrivate ||
        (problem.isOrganizationPrivate && intersects(problem.organizationIds, viewer.organizationIds)));
  }

  if (editOwnProblem) {
    q =
      q ||
      (problem.isOrganizationPrivate && intersects(problem.organizationIds, viewer.adminOfOrganizationIds));
  }

  // Authors, curators and testers always have access.
  return q || problemIsEditor(problem, viewer.id) || has(problem.testerProfileIds, viewer.id);
}

/** `Problem.get_visible_problems(user)` applied to a list. */
export function getVisibleProblems<T extends ProblemRow>(problems: readonly T[], viewer: Viewer): T[] {
  return problems.filter((problem) => problemIsVisibleTo(problem, viewer));
}

/** `Problem.get_editable_problems(user)` (problem.py:319) as a predicate. */
export function problemIsInEditableSet(problem: ProblemRow, viewer: Viewer): boolean {
  if (!hasPerm(viewer, "judge.edit_own_problem")) return false;

  if (hasPerm(viewer, "judge.edit_all_problem")) return true;

  if (!isAuthenticated(viewer)) return false;

  if (problemIsEditor(problem, viewer.id)) return true;

  if (problem.isOrganizationPrivate && intersects(problem.organizationIds, viewer.adminOfOrganizationIds)) {
    return true;
  }

  if (hasPerm(viewer, "judge.edit_public_problem") && problem.isPublic) return true;

  return false;
}

/* -------------------------------------------------------------------------- */
/* Problem point voting                                                       */
/* -------------------------------------------------------------------------- */

export const VOTE_PERMISSION = {
  NONE: "NONE",
  VIEW: "VIEW",
  VOTE: "VOTE",
} as const;

export type VotePermission = (typeof VOTE_PERMISSION)[keyof typeof VOTE_PERMISSION];

const VOTE_ORDER: Record<VotePermission, number> = { NONE: 0, VIEW: 1, VOTE: 2 };

/** `VotePermission.can_view()`. */
export function voteCanView(permission: VotePermission): boolean {
  return VOTE_ORDER[permission] >= VOTE_ORDER.VIEW;
}

/** `VotePermission.can_vote()`. */
export function voteCanVote(permission: VotePermission): boolean {
  return VOTE_ORDER[permission] >= VOTE_ORDER.VOTE;
}

export interface VotePermissionOptions {
  /** `Problem.is_solved_by(user)`: a full-AC, non-archived submission exists. */
  readonly hasSolvedProblem?: boolean;
}

/** `Problem.vote_permission_for_user(user)` (problem.py:470). */
export function votePermissionForUser(
  problem: ProblemRow,
  viewer: Viewer,
  options: VotePermissionOptions = {},
): VotePermission {
  if (!isAuthenticated(viewer)) return VOTE_PERMISSION.NONE;

  // In contest, nothing should be shown.
  if (viewer.currentParticipationId != null) return VOTE_PERMISSION.NONE;

  if (viewer.isUnlisted || viewer.isBannedFromProblemVoting) return VOTE_PERMISSION.VIEW;

  if (has(problem.bannedProfileIds, viewer.id)) return VOTE_PERMISSION.VIEW;

  if (!options.hasSolvedProblem) return VOTE_PERMISSION.VIEW;

  return VOTE_PERMISSION.VOTE;
}

/* -------------------------------------------------------------------------- */
/* Solutions (editorials)                                                     */
/* -------------------------------------------------------------------------- */

/** `Solution.is_accessible_by(user)` (problem.py:568). */
export function solutionIsAccessibleBy(
  solution: SolutionRow,
  problem: ProblemRow,
  viewer: Viewer,
  now: number = Date.now(),
): boolean {
  if (solution.isPublic && solution.publishOn < now) return true;

  if (hasPerm(viewer, "judge.see_private_solution")) return true;

  if (problemIsEditableBy(problem, viewer)) return true;

  return false;
}

/* -------------------------------------------------------------------------- */
/* Contests                                                                   */
/* -------------------------------------------------------------------------- */

export const SCOREBOARD_VISIBLE = "V";

export const SCOREBOARD_AFTER_CONTEST = "C";

export const SCOREBOARD_AFTER_PARTICIPATION = "P";

export const SCOREBOARD_HIDDEN = "H";

export interface ContestViewerContext {
  readonly now?: number;
  /**
   * The viewer's live (`virtual === 0`) participation in this contest, if any.
   * Feeds `Contest.has_completed_contest`.
   */
  readonly liveParticipation?: ContestParticipationRow | null;
}

/** `Contest.author_ids | Contest.curators` (`Contest.editor_ids`). */
export function contestEditorIds(contest: ContestRow): readonly Id[] {
  return [...(contest.authorProfileIds ?? []), ...(contest.curatorProfileIds ?? [])];
}

function contestIsEditor(contest: ContestRow, profileId: Id): boolean {
  return has(contest.authorProfileIds, profileId) || has(contest.curatorProfileIds, profileId);
}

/** `Contest.started` (contest.py:281). */
export function contestStarted(contest: ContestRow, now: number = Date.now()): boolean {
  return contest.startTime <= now;
}

/** `Contest.ended` (contest.py:308). */
export function contestEnded(contest: ContestRow, now: number = Date.now()): boolean {
  return contest.endTime < now;
}

/** `Contest.is_in_contest(user)` (contest.py:221). */
export function contestIsInContest(contest: ContestRow, viewer: Viewer): boolean {
  if (!isAuthenticated(viewer)) return false;

  return viewer.currentParticipationId != null && viewer.currentContestId === contest.id;
}

/** `Contest.has_completed_contest(user)` (contest.py:255). */
export function contestHasCompletedContest(
  contest: ContestRow,
  viewer: Viewer,
  context: ContestViewerContext = {},
): boolean {
  if (!isAuthenticated(viewer)) return false;
  const participation = context.liveParticipation;

  if (!participation) return false;

  if (participation.profileId !== viewer.id) return false;

  if (participation.virtual !== 0) return false;

  return participationHasEnded(participation, contest, context.now ?? Date.now());
}

/** `Contest.show_scoreboard` (contest.py:263). */
export function contestShowScoreboard(contest: ContestRow, now: number = Date.now()): boolean {
  if (!contestStarted(contest, now)) return false;

  if (
    (contest.scoreboardVisibility === SCOREBOARD_AFTER_CONTEST ||
      contest.scoreboardVisibility === SCOREBOARD_AFTER_PARTICIPATION) &&
    !contestEnded(contest, now)
  ) {
    return false;
  }

  return contest.scoreboardVisibility !== SCOREBOARD_HIDDEN;
}

/** `Contest.can_see_full_scoreboard(user)` (contest.py:236). */
export function contestCanSeeFullScoreboard(
  contest: ContestRow,
  viewer: Viewer,
  context: ContestViewerContext = {},
): boolean {
  const now = context.now ?? Date.now();

  if (contestShowScoreboard(contest, now)) return true;

  if (!isAuthenticated(viewer)) return false;

  if (hasPerm(viewer, "judge.see_private_contest") || hasPerm(viewer, "judge.edit_all_contest")) {
    return true;
  }

  if (contestIsEditor(contest, viewer.id)) return true;

  if (contest.testerSeeScoreboard && has(contest.testerProfileIds, viewer.id)) return true;

  if (contestStarted(contest, now) && has(contest.spectatorProfileIds, viewer.id)) return true;

  if (has(contest.viewContestScoreboardProfileIds, viewer.id)) return true;

  if (
    contest.scoreboardVisibility === SCOREBOARD_AFTER_PARTICIPATION &&
    contestHasCompletedContest(contest, viewer, context)
  ) {
    return true;
  }

  return false;
}

/** `Contest.can_see_own_scoreboard(user)` (contest.py:227). */
export function contestCanSeeOwnScoreboard(
  contest: ContestRow,
  viewer: Viewer,
  context: ContestViewerContext = {},
): boolean {
  const now = context.now ?? Date.now();

  if (contestCanSeeFullScoreboard(contest, viewer, context)) return true;

  if (!contestStarted(contest, now)) return false;

  if (
    !contestShowScoreboard(contest, now) &&
    !contestIsInContest(contest, viewer) &&
    !contestHasCompletedContest(contest, viewer, context)
  ) {
    return false;
  }

  return true;
}

export type ContestAccess =
  | { readonly kind: "ok" }
  | { readonly kind: "inaccessible" }
  | { readonly kind: "privateContest"; readonly organizationIds: readonly Id[] };

const ACCESS_OK: ContestAccess = { kind: "ok" };

const ACCESS_INACCESSIBLE: ContestAccess = { kind: "inaccessible" };

function privateContest(contest: ContestRow): ContestAccess {
  return { kind: "privateContest", organizationIds: contest.organizationIds ?? [] };
}

/**
 * `Contest.access_check(user)` (contest.py:346).
 *
 * DMOJ raises `Contest.Inaccessible` / `Contest.PrivateContest`; here the two
 * exceptions become the two failure arms of the union, with the organizations
 * the private page needs to name.
 */
export function contestAccessCheck(contest: ContestRow, viewer: Viewer): ContestAccess {
  if (!isAuthenticated(viewer)) {
    if (!contest.isVisible) return ACCESS_INACCESSIBLE;

    if (contest.isPrivate || contest.isOrganizationPrivate) return privateContest(contest);

    return ACCESS_OK;
  }

  if (hasPerm(viewer, "judge.see_private_contest") || hasPerm(viewer, "judge.edit_all_contest")) {
    return ACCESS_OK;
  }

  if (contestIsEditor(contest, viewer.id)) return ACCESS_OK;

  if (has(contest.testerProfileIds, viewer.id)) return ACCESS_OK;

  if (has(contest.spectatorProfileIds, viewer.id)) return ACCESS_OK;

  if (!contest.isVisible) return ACCESS_INACCESSIBLE;
  const entry = entryOf(contest);

  if (entry.kind === "open") return ACCESS_OK;

  // Named "view the scoreboard", but it returns here, so it admits outright.
  if (has(contest.viewContestScoreboardProfileIds, viewer.id)) return ACCESS_OK;

  return entrySatisfiedBy(entry, viewer) ? ACCESS_OK : privateContest(contest);
}

/**
 * Whether a viewer clears a restricted contest's gates.
 *
 * An organisation gate is satisfied by an organisation *or* a class, and a
 * `match` of "all" means every populated gate has to be cleared — so a contest
 * with both an organisation gate and a named-people gate admits only the people
 * in both, which is why turning the second on for an organisation contest locks
 * out every member who is not also named.
 */
function entrySatisfiedBy(entry: Extract<ContestEntry, { kind: "restricted" }>, viewer: Viewer): boolean {
  if (!isAuthenticated(viewer)) return false;
  const gates: boolean[] = [];

  // Each gate that is on has to be cleared, and one naming nobody never is.
  if (entry.byOrganization) {
    gates.push(
      intersects(entry.organizationIds, viewer.organizationIds) ||
        intersects(entry.classIds, viewer.classIds),
    );
  }

  if (entry.byName) gates.push(has(entry.profileIds, viewer.id));

  if (gates.length === 0) return false;

  return entry.match === "all" ? gates.every(Boolean) : gates.some(Boolean);
}

/** `Contest.is_accessible_by(user)` (contest.py:441). */
export function contestIsAccessibleBy(contest: ContestRow, viewer: Viewer): boolean {
  return contestAccessCheck(contest, viewer).kind === "ok";
}

/** `Contest.is_editable_by(user)` (contest.py:449). */
export function contestIsEditableBy(contest: ContestRow, viewer: Viewer): boolean {
  if (hasPerm(viewer, "judge.edit_all_contest")) return true;

  if (
    isAuthenticated(viewer) &&
    hasPerm(viewer, "judge.edit_own_contest") &&
    contestIsEditor(contest, viewer.id)
  ) {
    return true;
  }

  return false;
}

/**
 * `Contest.is_live_joinable_by(user)` (contest.py:403).
 *
 * Assumes the user can access the contest, exactly as DMOJ does.
 */
export function contestIsLiveJoinableBy(
  contest: ContestRow,
  viewer: Viewer,
  context: ContestViewerContext = {},
): boolean {
  const now = context.now ?? Date.now();

  if (!contestStarted(contest, now)) return false;

  if (!isAuthenticated(viewer)) return false;

  if (contestIsEditor(contest, viewer.id) || has(contest.testerProfileIds, viewer.id)) return false;

  if (contestHasCompletedContest(contest, viewer, context)) return false;

  const joinLimit = joinLimitOf(contest);

  // Organisations only: a class that satisfies the entry gate does not satisfy
  // this one, so a class-gated contest with a join limit is unjoinable by
  // exactly the people it is for.
  if (joinLimit) return intersects(joinLimit.organizationIds, viewer.organizationIds);

  return true;
}

/** `Contest.is_spectatable_by(user)` (contest.py:430). Skips the access check. */
export function contestIsSpectatableBy(contest: ContestRow, viewer: Viewer): boolean {
  if (!isAuthenticated(viewer)) return false;

  if (contestIsEditor(contest, viewer.id) || has(contest.testerProfileIds, viewer.id)) return true;

  if (contest.limitJoinOrganizations) {
    return intersects(contest.joinOrganizationIds, viewer.organizationIds);
  }

  return true;
}

/** `Contest.get_visible_contests(user)` (contest.py:461) as a predicate. */
export function contestIsVisibleTo(contest: ContestRow, viewer: Viewer): boolean {
  if (!isAuthenticated(viewer)) {
    return contest.isVisible && !contest.isOrganizationPrivate && !contest.isPrivate;
  }

  if (hasPerm(viewer, "judge.see_private_contest") || hasPerm(viewer, "judge.edit_all_contest")) {
    return true;
  }

  const orgCheck =
    intersects(contest.organizationIds, viewer.organizationIds) ||
    intersects(contest.classIds, viewer.classIds);

  const inUsers = has(contest.privateContestantProfileIds, viewer.id);

  const visible =
    contest.isVisible &&
    (has(contest.viewContestScoreboardProfileIds, viewer.id) ||
      (!contest.isOrganizationPrivate && !contest.isPrivate) ||
      (!contest.isOrganizationPrivate && contest.isPrivate && inUsers) ||
      (contest.isOrganizationPrivate && !contest.isPrivate && orgCheck) ||
      (contest.isOrganizationPrivate && contest.isPrivate && inUsers && orgCheck));

  return (
    visible ||
    contestIsEditor(contest, viewer.id) ||
    has(contest.testerProfileIds, viewer.id) ||
    has(contest.spectatorProfileIds, viewer.id)
  );
}

/** `Contest.get_visible_contests(user)` applied to a list. */
export function getVisibleContests<T extends ContestRow>(contests: readonly T[], viewer: Viewer): T[] {
  return contests.filter((contest) => contestIsVisibleTo(contest, viewer));
}

/* -------------------------------------------------------------------------- */
/* Submissions                                                                */
/* -------------------------------------------------------------------------- */

/** The site default when a problem follows the global setting. */
export const DEFAULT_SUBMISSION_SOURCE_VISIBILITY: GlobalSubmissionSourceVisibility = "all-solved";

const GLOBAL_VISIBILITY_MAP: Record<
  GlobalSubmissionSourceVisibility,
  Exclude<SubmissionSourceVisibility, "F">
> = {
  all: "A",
  "all-solved": "S",
  "only-own": "O",
};

/** `Problem.submission_source_visibility` (problem.py:390). */
export function resolveSubmissionSourceVisibility(
  problem: ProblemRow,
  globalDefault: GlobalSubmissionSourceVisibility = DEFAULT_SUBMISSION_SOURCE_VISIBILITY,
): Exclude<SubmissionSourceVisibility, "F"> {
  const mode: SubmissionSourceVisibility = problem.submissionSourceVisibility ?? "F";

  if (mode === "F") return GLOBAL_VISIBILITY_MAP[globalDefault];

  return mode;
}

export interface SubmissionDetailContext {
  readonly problem: ProblemRow;
  /** The contest the submission was made in, if any (`Submission.contest_object`). */
  readonly contest?: ContestRow | null;
  /** `Problem.is_solved_by(user)` for the viewer. */
  readonly hasSolvedProblem?: boolean;
  readonly globalSubmissionSourceVisibility?: GlobalSubmissionSourceVisibility;
}

/**
 * `Submission.can_see_detail(user)` (judge/models/submission.py:147).
 *
 * Seven paths, in DMOJ's order: problem editor, `view_all_submission`, own
 * submission, source visibility A, source visibility S (public problem or
 * tester, and solved), source visibility O (tester only), and finally the
 * in-contest paths.
 */
export function canSeeSubmissionDetail(
  submission: { readonly profileId: Id },
  viewer: Viewer,
  context: SubmissionDetailContext,
): boolean {
  if (!isAuthenticated(viewer)) return false;

  const { problem, contest } = context;

  const sourceVisibility = resolveSubmissionSourceVisibility(
    problem,
    context.globalSubmissionSourceVisibility,
  );

  if (problemIsEditableBy(problem, viewer)) return true;

  if (hasPerm(viewer, "judge.view_all_submission")) return true;

  if (submission.profileId === viewer.id) return true;

  if (sourceVisibility === "A") return true;

  if (
    sourceVisibility === "S" &&
    (problem.isPublic || has(problem.testerProfileIds, viewer.id)) &&
    context.hasSolvedProblem === true
  ) {
    return true;
  }

  if (sourceVisibility === "O" && has(problem.testerProfileIds, viewer.id)) return true;

  if (contest) {
    if (
      contestIsEditor(contest, viewer.id) ||
      has(contest.viewContestSubmissionsProfileIds, viewer.id) ||
      (contest.testerSeeSubmissions === true && has(contest.testerProfileIds, viewer.id))
    ) {
      return true;
    }
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/* Blog posts                                                                 */
/* -------------------------------------------------------------------------- */

/** `BlogPost.is_editable_by(user)` (judge/models/interface.py:280). */
export function blogPostIsEditableBy(post: BlogPostRow, viewer: Viewer): boolean {
  if (!isAuthenticated(viewer)) return false;

  if (hasPerm(viewer, "judge.edit_all_post")) return true;

  return hasPerm(viewer, "judge.change_blogpost") && has(post.authorProfileIds, viewer.id);
}

/** `BlogPost.can_see(user)` (interface.py:275). */
export function blogPostCanSee(post: BlogPostRow, viewer: Viewer, now: number = Date.now()): boolean {
  if (post.visible && post.publishOn <= now) return true;

  return blogPostIsEditableBy(post, viewer);
}

/* -------------------------------------------------------------------------- */
/* Comments                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The object a comment hangs off, already fetched. `null` stands for DMOJ's
 * `ObjectDoesNotExist`, which makes the comment inaccessible.
 */
export type CommentTarget =
  | { readonly type: "problem"; readonly problem: ProblemRow | null }
  | {
      readonly type: "solution";
      readonly solution: SolutionRow | null;
      readonly problem: ProblemRow | null;
    }
  | { readonly type: "contest"; readonly contest: ContestRow | null }
  | { readonly type: "blog"; readonly post: BlogPostRow | null }
  | { readonly type: "other" };

export interface CommentAccessOptions {
  readonly now?: number;
  readonly problemAccess?: ProblemAccessOptions;
}

/** `Comment.is_accessible_by(user)` (judge/models/comment.py:136). */
export function commentIsAccessibleBy(
  target: CommentTarget,
  viewer: Viewer,
  options: CommentAccessOptions = {},
): boolean {
  const now = options.now ?? Date.now();

  switch (target.type) {
    case "problem":
      if (!target.problem) return false;

      return problemIsAccessibleBy(target.problem, viewer, options.problemAccess);
    case "solution":
      // DMOJ checks the solution only here; the "recent comments" widget also
      // requires problem access.
      if (!target.solution || !target.problem) return false;

      return solutionIsAccessibleBy(target.solution, target.problem, viewer, now);
    case "contest":
      if (!target.contest) return false;

      return contestIsAccessibleBy(target.contest, viewer);
    case "blog":
      if (!target.post) return false;

      return blogPostCanSee(target.post, viewer, now);
    default:
      return true;
  }
}

/* -------------------------------------------------------------------------- */
/* Organizations and classes                                                  */
/* -------------------------------------------------------------------------- */

/** Whether the viewer administers this organization. */
export function organizationIsAdmin(organization: OrganizationRow, viewer: Viewer): boolean {
  return isAuthenticated(viewer) && has(organization.adminProfileIds, viewer.id);
}

/** `OrganizationMixin.can_edit_organization` (judge/views/organization.py:59). */
export function organizationCanEdit(organization: OrganizationRow, viewer: Viewer): boolean {
  return organizationIsAdmin(organization, viewer);
}

/** The admin-site rule: `judge.change_organization` plus admin-of or `edit_all_organization`. */
export function organizationIsEditableBy(organization: OrganizationRow, viewer: Viewer): boolean {
  if (!hasPerm(viewer, "judge.change_organization")) return false;

  if (hasPerm(viewer, "judge.edit_all_organization")) return true;

  return organizationIsAdmin(organization, viewer);
}

/** `Organization.can_review_all_requests(profile)` (judge/models/profile.py:86). */
export function organizationCanReviewAllRequests(organization: OrganizationRow, viewer: Viewer): boolean {
  return organizationIsAdmin(organization, viewer);
}

/** `Organization.can_review_class_requests(profile)` (profile.py:89). */
export function organizationCanReviewClassRequests(classes: readonly ClassRow[], viewer: Viewer): boolean {
  if (!isAuthenticated(viewer)) return false;

  return classes.some((klass) => has(klass.adminProfileIds, viewer.id));
}

/** `OrganizationRequestDetail.get_object` (judge/views/organization.py:255). */
export function canViewOrganizationRequest(
  request: { readonly profileId: Id },
  organization: OrganizationRow,
  requestClass: ClassRow | null | undefined,
  viewer: Viewer,
): boolean {
  if (!isAuthenticated(viewer)) return false;

  if (request.profileId === viewer.id) return true;

  if (has(organization.adminProfileIds, viewer.id)) return true;

  return !!requestClass && has(requestClass.adminProfileIds, viewer.id);
}

/** `Class.get_visible_classes(user)` (judge/models/profile.py:117) as a predicate. */
export function classIsVisibleTo(
  klass: ClassRow,
  viewer: Viewer,
  options: { readonly organizationsAdministeredByViewer?: readonly Id[] } = {},
): boolean {
  if (!isAuthenticated(viewer)) return false;

  if (hasPerm(viewer, "judge.edit_all_organization")) return true;

  if (has(klass.adminProfileIds, viewer.id)) return true;

  // Classes of contests whose organizations the viewer administers.
  return has(
    options.organizationsAdministeredByViewer ?? viewer.adminOfOrganizationIds,
    klass.organizationId,
  );
}
