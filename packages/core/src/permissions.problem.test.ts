/**
 * judge/models/tests/test_problem.py, ported.
 *
 * `_test_object_methods_with_users` becomes a table of
 * `{ user: { method: expected } }` checked with `expect(...).toBe(expected)`.
 */

import { describe, expect, it } from "vitest";
import {
  getVisibleProblems,
  problemIsAccessibleBy,
  problemIsEditableBy,
  problemIsEditor,
  problemIsSubsManageableBy,
  problemIsVisibleTo,
  solutionIsAccessibleBy,
  voteCanView,
  voteCanVote,
  votePermissionForUser,
} from "./permissions";
import {
  commonUsers,
  createProblem,
  createSolution,
  createUser,
  DAY,
  NOW,
  withOrganizationAdmin,
  withOrganizations,
} from "./test.fixtures";
import type { ProblemRow, ProfileRow, Viewer } from "./types";

type Matrix = Record<
  string,
  Partial<Record<"is_accessible_by" | "is_editable_by" | "is_subs_manageable_by", boolean>>
>;

function buildUsers(): Record<string, Viewer> {
  const users = commonUsers();
  users.staff_problem_edit_only_all = createUser("staff_problem_edit_only_all", {
    isStaff: true,
    permissions: ["edit_all_problem"],
  });

  // create_organization('problem organization', admins=('normal', 'staff_problem_edit_public'))
  users.normal = withOrganizationAdmin(users.normal as ProfileRow, ["problem organization"]);
  users.staff_problem_edit_public = withOrganizationAdmin(users.staff_problem_edit_public as ProfileRow, [
    "problem organization",
  ]);
  return users;
}

function checkMatrix(problem: ProblemRow, users: Record<string, Viewer>, matrix: Matrix): void {
  for (const [username, methods] of Object.entries(matrix)) {
    const viewer = users[username] as Viewer;
    if (methods.is_accessible_by !== undefined) {
      expect(problemIsAccessibleBy(problem, viewer), `is_accessible_by/${username}`).toBe(
        methods.is_accessible_by,
      );
    }
    if (methods.is_editable_by !== undefined) {
      expect(problemIsEditableBy(problem, viewer), `is_editable_by/${username}`).toBe(methods.is_editable_by);
    }
    if (methods.is_subs_manageable_by !== undefined) {
      expect(problemIsSubsManageableBy(problem, viewer), `is_subs_manageable_by/${username}`).toBe(
        methods.is_subs_manageable_by,
      );
    }
  }
}

describe("ProblemTestCase", () => {
  const users = buildUsers();

  const basicProblem = createProblem("basic", {
    authorProfileIds: ["normal"],
    testerProfileIds: ["staff_problem_edit_public"],
  });

  const organizationPrivateProblem = createProblem("organization_private", {
    isPublic: true,
    isOrganizationPrivate: true,
    curatorProfileIds: ["staff_problem_edit_own", "staff_problem_edit_own_no_staff"],
  });

  const organizationAdminPrivateProblem = createProblem("org_admin_private", {
    isOrganizationPrivate: true,
    organizationIds: ["problem organization"],
  });

  const organizationAdminProblem = createProblem("organization_admin", {
    organizationIds: ["problem organization"],
  });

  it("test_basic_problem", () => {
    expect(problemIsEditor(basicProblem, "normal")).toBe(true);
  });

  it("test_basic_problem_methods", () => {
    checkMatrix(basicProblem, users, {
      superuser: { is_accessible_by: true, is_editable_by: true },
      staff_problem_edit_own: { is_accessible_by: false, is_editable_by: false },
      staff_problem_see_all: { is_accessible_by: true, is_editable_by: false },
      staff_problem_edit_all: { is_accessible_by: true, is_editable_by: true },
      staff_problem_edit_public: { is_accessible_by: true, is_editable_by: false },
      staff_problem_see_organization: { is_accessible_by: false, is_editable_by: false },
      normal: { is_accessible_by: true, is_editable_by: false },
      anonymous: { is_accessible_by: false, is_editable_by: false },
    });
  });

  it("test_organization_private_problem_methods", () => {
    // The Python walks through three states before the matrix.
    expect(problemIsAccessibleBy(organizationPrivateProblem, users.normal)).toBe(false);

    const normalInOpen = withOrganizations(users.normal as ProfileRow, ["open"]);
    expect(problemIsAccessibleBy(organizationPrivateProblem, normalInOpen)).toBe(false);

    const problem = { ...organizationPrivateProblem, organizationIds: ["open"] };
    checkMatrix(
      problem,
      { ...users, normal: normalInOpen },
      {
        staff_problem_edit_own: {
          is_accessible_by: true,
          is_editable_by: true,
          is_subs_manageable_by: true,
        },
        staff_problem_see_all: {
          is_accessible_by: true,
          is_editable_by: false,
          is_subs_manageable_by: false,
        },
        staff_problem_edit_all: { is_accessible_by: true, is_editable_by: true },
        staff_problem_edit_public: { is_accessible_by: true, is_editable_by: true },
        staff_problem_see_organization: { is_accessible_by: true, is_editable_by: false },
        staff_problem_edit_all_with_rejudge: { is_editable_by: true, is_subs_manageable_by: true },
        staff_problem_edit_own_no_staff: { is_editable_by: true, is_subs_manageable_by: false },
        normal: { is_accessible_by: true, is_editable_by: false },
        anonymous: { is_accessible_by: false, is_editable_by: false },
      },
    );
  });

  it("test_organization_admin_private_problem_methods", () => {
    checkMatrix(organizationAdminPrivateProblem, users, {
      staff_problem_edit_own: {
        is_accessible_by: false,
        is_editable_by: false,
        is_subs_manageable_by: false,
      },
      staff_problem_see_all: {
        is_accessible_by: true,
        is_editable_by: false,
        is_subs_manageable_by: false,
      },
      staff_problem_edit_all: { is_accessible_by: true, is_editable_by: true },
      staff_problem_edit_public: { is_accessible_by: true, is_editable_by: true },
      staff_problem_see_organization: { is_accessible_by: false, is_editable_by: false },
      staff_organization_admin: { is_accessible_by: false, is_editable_by: false },
      normal: { is_accessible_by: false, is_editable_by: false },
      anonymous: { is_accessible_by: false, is_editable_by: false },
    });
  });

  it("test_organization_admin_problem_methods", () => {
    checkMatrix(organizationAdminProblem, users, {
      staff_problem_edit_all: { is_accessible_by: true, is_editable_by: true },
      staff_problem_edit_public: { is_accessible_by: false, is_editable_by: false },
      staff_organization_admin: { is_accessible_by: false, is_editable_by: false },
      normal: { is_accessible_by: false, is_editable_by: false },
      anonymous: { is_accessible_by: false, is_editable_by: false },
    });
  });

  it("test_problems_list: is_accessible_by and get_visible_problems agree", () => {
    const problems = [
      basicProblem,
      organizationPrivateProblem,
      organizationAdminPrivateProblem,
      organizationAdminProblem,
    ];

    for (const [username, viewer] of Object.entries(users)) {
      const accessible = problems
        .filter((problem) => problemIsAccessibleBy(problem, viewer))
        .map((problem) => problem.code)
        .sort();
      const visible = getVisibleProblems(problems, viewer)
        .map((problem) => problem.code)
        .sort();
      expect(visible, `visible problems for ${username}`).toEqual(accessible);
    }
  });

  it("problemIsVisibleTo matches the queryset for organization members", () => {
    const problem = { ...organizationPrivateProblem, organizationIds: ["open"] };
    const outsider = createUser("outsider");
    const insider = createUser("insider", { organizationIds: ["open"] });
    expect(problemIsVisibleTo(problem, outsider)).toBe(false);
    expect(problemIsVisibleTo(problem, insider)).toBe(true);
  });
});

describe("ProblemTestCase.test_problem_voting_permissions", () => {
  const users = buildUsers();
  const basicProblem = createProblem("basic", {
    points: 1,
    authorProfileIds: ["normal"],
    bannedProfileIds: ["banned_from_problem"],
  });

  it("anonymous users cannot vote or view", () => {
    expect(votePermissionForUser(basicProblem, null)).toBe("NONE");
    expect(voteCanView("NONE")).toBe(false);
    expect(voteCanVote("NONE")).toBe(false);
  });

  it("users in a contest see nothing", () => {
    const inContest = createUser("in_contest", {
      currentParticipationId: "basic:in_contest:0",
      currentContestId: "basic",
    });
    expect(votePermissionForUser(basicProblem, inContest, { hasSolvedProblem: true })).toBe("NONE");
  });

  it("unlisted, vote-banned, problem-banned and unsolved users may only view", () => {
    const unlisted = createUser("unlisted", { isUnlisted: true });
    expect(votePermissionForUser(basicProblem, unlisted, { hasSolvedProblem: true })).toBe("VIEW");

    const bannedFromVoting = createUser("banned_from_voting", { isBannedFromProblemVoting: true });
    expect(votePermissionForUser(basicProblem, bannedFromVoting, { hasSolvedProblem: true })).toBe("VIEW");

    const bannedFromProblem = createUser("banned_from_problem");
    expect(votePermissionForUser(basicProblem, bannedFromProblem, { hasSolvedProblem: true })).toBe("VIEW");

    expect(votePermissionForUser(basicProblem, users.normal)).toBe("VIEW");
  });

  it("a full solve unlocks voting", () => {
    expect(votePermissionForUser(basicProblem, users.normal, { hasSolvedProblem: true })).toBe("VOTE");
    expect(voteCanView("VOTE")).toBe(true);
    expect(voteCanVote("VOTE")).toBe(true);
    // A partial solve is not a solve.
    expect(votePermissionForUser(basicProblem, users.normal, { hasSolvedProblem: false })).toBe("VIEW");
  });
});

describe("SolutionTestCase", () => {
  const users = commonUsers();
  users.staff_solution_see_all = createUser("staff_solution_see_all", {
    permissions: ["see_private_solution"],
  });

  const basicProblem = createProblem("basic");
  const basicSolution = createSolution("basic");

  const privateProblem = createProblem("private");
  const privateSolution = createSolution("private", {
    isPublic: false,
    publishOn: NOW - 100 * DAY,
  });

  const unpublishedProblem = createProblem("unpublished", {
    name: "Unpublished",
    authorProfileIds: ["staff_problem_edit_own"],
  });
  const unpublishedSolution = createSolution("unpublished", {
    isPublic: false,
    publishOn: NOW + 100 * DAY,
    authorProfileIds: ["normal"],
  });

  function check(
    solution: typeof basicSolution,
    problem: ProblemRow,
    expectations: Record<string, boolean>,
  ): void {
    for (const [username, expected] of Object.entries(expectations)) {
      expect(
        solutionIsAccessibleBy(solution, problem, users[username] as Viewer, NOW),
        `is_accessible_by/${username}`,
      ).toBe(expected);
    }
  }

  it("test_basic_solution_methods", () => {
    check(basicSolution, basicProblem, {
      superuser: true,
      staff_solution_see_all: true,
      normal: true,
      anonymous: true,
    });
  });

  it("test_private_solution_methods", () => {
    check(privateSolution, privateProblem, {
      superuser: true,
      staff_solution_see_all: true,
      staff_problem_edit_own: false,
      staff_problem_see_all: false,
      staff_problem_edit_all: true,
      staff_problem_edit_public: false,
      normal: false,
      anonymous: false,
    });
  });

  it("test_unpublished_solution_methods", () => {
    check(unpublishedSolution, unpublishedProblem, {
      staff_solution_see_all: true,
      staff_problem_edit_own: true,
      staff_problem_edit_all: true,
      staff_problem_edit_public: false,
      normal: false,
      anonymous: false,
    });
  });
});
