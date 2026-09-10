/**
 * The fixtures from judge/models/tests/util.py, as plain objects.
 *
 * DMOJ's `CreateModel` helpers fill in defaults and wire up many-to-many
 * relations; here the same defaults are applied and the relations are id
 * arrays. Ids are the natural keys (username, problem code, contest key) so the
 * expectation tables read the same as the Python ones.
 */

import type {
  BlogPostRow,
  ContestParticipationRow,
  ContestProblemRow,
  ContestRow,
  Id,
  OrganizationRow,
  ProblemRow,
  ProfileRow,
  SolutionRow,
  Viewer,
} from '../src/types.js';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** A fixed "now" so the fixtures never race the clock. */
export const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

export interface UserSpec {
  readonly isStaff?: boolean;
  readonly isSuperuser?: boolean;
  readonly permissions?: readonly string[];
  readonly organizationIds?: readonly Id[];
  readonly adminOfOrganizationIds?: readonly Id[];
  readonly classIds?: readonly Id[];
  readonly currentParticipationId?: Id | null;
  readonly currentContestId?: Id | null;
  readonly isUnlisted?: boolean;
  readonly isBannedFromProblemVoting?: boolean;
}

export function createUser(username: string, spec: UserSpec = {}): ProfileRow {
  return {
    id: username,
    username,
    isStaff: spec.isStaff ?? false,
    isSuperuser: spec.isSuperuser ?? false,
    permissions: (spec.permissions ?? []).map((code) =>
      code.includes('.') ? code : `judge.${code}`,
    ),
    organizationIds: spec.organizationIds ?? [],
    adminOfOrganizationIds: spec.adminOfOrganizationIds ?? [],
    classIds: spec.classIds ?? [],
    currentParticipationId: spec.currentParticipationId ?? null,
    currentContestId: spec.currentContestId ?? null,
    isUnlisted: spec.isUnlisted ?? false,
    isBannedFromProblemVoting: spec.isBannedFromProblemVoting ?? false,
  };
}

export function createOrganization(
  name: string,
  spec: { readonly adminProfileIds?: readonly Id[]; readonly isOpen?: boolean } = {},
): OrganizationRow {
  return {
    id: name,
    name,
    slug: name,
    adminProfileIds: spec.adminProfileIds ?? [],
    isOpen: spec.isOpen ?? true,
  };
}

export function createProblem(code: string, spec: Partial<ProblemRow> = {}): ProblemRow {
  return {
    id: code,
    code,
    name: code,
    isPublic: false,
    isOrganizationPrivate: false,
    organizationIds: [],
    authorProfileIds: [],
    curatorProfileIds: [],
    testerProfileIds: [],
    bannedProfileIds: [],
    points: 1,
    partial: false,
    submissionSourceVisibility: 'F',
    ...spec,
  };
}

export function createSolution(problemId: Id, spec: Partial<SolutionRow> = {}): SolutionRow {
  return {
    problemId,
    isPublic: true,
    publishOn: NOW - 4 * DAY,
    authorProfileIds: [],
    ...spec,
  };
}

export function createContest(key: string, spec: Partial<ContestRow> = {}): ContestRow {
  return {
    id: key,
    key,
    name: key,
    startTime: NOW - 100 * DAY,
    endTime: NOW + 100 * DAY,
    timeLimit: null,
    isVisible: false,
    isPrivate: false,
    isOrganizationPrivate: false,
    authorProfileIds: [],
    curatorProfileIds: [],
    testerProfileIds: [],
    spectatorProfileIds: [],
    testerSeeScoreboard: false,
    testerSeeSubmissions: false,
    viewContestScoreboardProfileIds: [],
    viewContestSubmissionsProfileIds: [],
    privateContestantProfileIds: [],
    organizationIds: [],
    classIds: [],
    limitJoinOrganizations: false,
    joinOrganizationIds: [],
    bannedProfileIds: [],
    scoreboardVisibility: 'V',
    formatName: 'default',
    formatConfig: null,
    pointsPrecision: 3,
    runPretestsOnly: false,
    ...spec,
  };
}

export function createParticipation(
  contestId: Id,
  profileId: Id,
  spec: Partial<ContestParticipationRow> = {},
): ContestParticipationRow {
  return {
    id: `${contestId}:${profileId}:${spec.virtual ?? 0}`,
    contestId,
    profileId,
    realStart: NOW,
    score: 0,
    cumtime: 0,
    tiebreaker: 0,
    isDisqualified: false,
    virtual: 0,
    formatData: null,
    ...spec,
  };
}

export function createContestProblem(
  contestId: Id,
  problemId: Id,
  spec: Partial<ContestProblemRow> = {},
): ContestProblemRow {
  return {
    id: `${contestId}:${problemId}`,
    contestId,
    problemId,
    problemCode: problemId,
    points: 100,
    partial: true,
    isPretested: false,
    order: 1,
    ...spec,
  };
}

export function createBlogPost(title: string, spec: Partial<BlogPostRow> = {}): BlogPostRow {
  return {
    id: title,
    title,
    slug: title,
    visible: false,
    publishOn: NOW - 100 * DAY,
    authorProfileIds: [],
    ...spec,
  };
}

/** `CommonDataMixin.setUpTestData`. */
export function commonUsers(): Record<string, Viewer> {
  return {
    superuser: createUser('superuser', { isSuperuser: true, isStaff: true }),
    staff_problem_edit_own: createUser('staff_problem_edit_own', {
      isStaff: true,
      permissions: ['edit_own_problem', 'rejudge_submission'],
    }),
    staff_problem_see_all: createUser('staff_problem_see_all', {
      permissions: ['see_private_problem'],
    }),
    staff_problem_edit_all: createUser('staff_problem_edit_all', {
      isStaff: true,
      permissions: ['edit_own_problem', 'edit_all_problem'],
    }),
    staff_problem_edit_public: createUser('staff_problem_edit_public', {
      isStaff: true,
      permissions: ['edit_own_problem', 'edit_public_problem'],
    }),
    staff_problem_see_organization: createUser('staff_problem_see_organization', {
      permissions: ['see_organization_problem'],
    }),
    staff_problem_edit_all_with_rejudge: createUser('staff_problem_edit_all_with_rejudge', {
      isStaff: true,
      permissions: ['edit_own_problem', 'edit_all_problem', 'rejudge_submission'],
    }),
    staff_problem_edit_own_no_staff: createUser('staff_problem_edit_own_no_staff', {
      permissions: ['edit_own_problem', 'rejudge_submission'],
    }),
    staff_organization_admin: createUser('staff_organization_admin', {
      isStaff: true,
      permissions: ['organization_admin'],
      adminOfOrganizationIds: ['open'],
    }),
    normal: createUser('normal'),
    anonymous: null,
  };
}

export const OPEN_ORGANIZATION = createOrganization('open', {
  adminProfileIds: ['staff_organization_admin'],
});

/** Add an organization membership to a profile, returning a new row. */
export function withOrganizations(profile: ProfileRow, organizationIds: readonly Id[]): ProfileRow {
  return { ...profile, organizationIds: [...(profile.organizationIds ?? []), ...organizationIds] };
}

/** Add organization admin rights to a profile, returning a new row. */
export function withOrganizationAdmin(
  profile: ProfileRow,
  organizationIds: readonly Id[],
): ProfileRow {
  return {
    ...profile,
    adminOfOrganizationIds: [...(profile.adminOfOrganizationIds ?? []), ...organizationIds],
  };
}
