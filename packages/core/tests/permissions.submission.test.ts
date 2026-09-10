/**
 * judge/models/tests/test_submission.py, ported.
 */

import { describe, expect, it } from "vitest";
import { computeContestSubmissionPoints } from "../src/judging";
import { canSeeSubmissionDetail, resolveSubmissionSourceVisibility } from "../src/permissions";
import type { ProblemRow, Viewer } from "../src/types";
import { isGraded, isLocked, longStatus, resultClass, shortStatus } from "../src/verdicts";
import {
  commonUsers,
  createContest,
  createContestProblem,
  createProblem,
  createUser,
  DAY,
  NOW,
} from "./fixtures";

const users = commonUsers();
users.staff_submission_view_all = createUser("staff_submission_view_all", {
  isStaff: true,
  permissions: ["view_all_submission"],
});

const basicProblem = createProblem("basic");
const _fullAcProblem = createProblem("full_ac");
const _lockedProblem = createProblem("locked");
const _futureLockedProblem = createProblem("future_locked");
const ieProblem = createProblem("ie", { isPublic: true });
const queuedProblem = createProblem("queued");

const basicSubmission = {
  id: "1",
  profileId: "normal",
  problemId: "basic",
  date: NOW,
  status: "D" as const,
  result: "AC" as const,
  casePoints: 99,
  caseTotal: 100,
  memory: 20,
  lockedAfter: null,
};

const fullAcSubmission = {
  ...basicSubmission,
  id: "2",
  problemId: "full_ac",
  casePoints: 1,
  caseTotal: 1,
};

const lockedSubmission = {
  ...basicSubmission,
  id: "3",
  problemId: "locked",
  result: "WA" as const,
  casePoints: 1,
  caseTotal: 1,
  lockedAfter: NOW - 100 * DAY,
};

const futureLockedSubmission = { ...lockedSubmission, id: "4", lockedAfter: NOW + 100 * DAY };

const ieSubmission = {
  id: "5",
  profileId: "superuser",
  problemId: "ie",
  date: NOW,
  status: "IE" as const,
  result: "IE" as const,
  casePoints: 0,
  caseTotal: 0,
  lockedAfter: null,
};

const queuedSubmission = {
  id: "6",
  profileId: "superuser",
  problemId: "queued",
  date: NOW,
  status: "QU" as const,
  result: null,
  casePoints: 50,
  caseTotal: 100,
  lockedAfter: null,
};

function check(
  submission: { profileId: string },
  problem: ProblemRow,
  expectations: Record<string, boolean>,
): void {
  for (const [username, expected] of Object.entries(expectations)) {
    expect(
      canSeeSubmissionDetail(submission, users[username] as Viewer, { problem }),
      `can_see_detail/${username}`,
    ).toBe(expected);
  }
}

describe("SubmissionTestCase", () => {
  it("test_basic_submission", () => {
    expect(resultClass(basicSubmission)).toBe("_AC");
    expect(shortStatus(basicSubmission)).toBe("AC");
    expect(longStatus(basicSubmission)).toBe("Accepted");
    expect(isGraded(basicSubmission)).toBe(true);
    expect(isLocked(basicSubmission, NOW)).toBe(false);
  });

  it("test_full_ac_submission", () => {
    expect(resultClass(fullAcSubmission)).toBe("AC");
    expect(shortStatus(fullAcSubmission)).toBe("AC");
  });

  it("test_submission_lock", () => {
    expect(isLocked(lockedSubmission, NOW)).toBe(true);
    expect(isLocked(futureLockedSubmission, NOW)).toBe(false);
  });

  it("test_ie_submission", () => {
    expect(resultClass(ieSubmission)).toBe("IE");
    expect(isGraded(ieSubmission)).toBe(true);
  });

  it("test_queued_submission", () => {
    expect(resultClass(queuedSubmission)).toBeNull();
    expect(shortStatus(queuedSubmission)).toBe("QU");
    expect(longStatus(queuedSubmission)).toBe("Queued");
    expect(isGraded(queuedSubmission)).toBe(false);

    // update_contest() zeroes a non-partial contest problem that fell short.
    const contest = createContest("queued");
    const contestProblem = createContestProblem(contest.id, queuedProblem.id, { partial: false });
    expect(computeContestSubmissionPoints(queuedSubmission, contestProblem)).toBe(0);
  });

  it("test_basic_submission_methods", () => {
    check(basicSubmission, basicProblem, {
      superuser: true,
      staff_problem_edit_own: false,
      staff_problem_edit_all: true,
      staff_problem_edit_public: false,
      staff_problem_see_organization: false,
      staff_submission_view_all: true,
      normal: true,
      anonymous: false,
    });
  });

  it("test_ie_submission_methods", () => {
    check(ieSubmission, ieProblem, {
      staff_problem_edit_own: false,
      staff_problem_edit_all: true,
      staff_problem_edit_public: true,
      staff_submission_view_all: true,
      normal: false,
    });
  });

  it("honours the source visibility modes", () => {
    const publicProblem = createProblem("src", { isPublic: true });
    const submission = { profileId: "someone_else" };

    // A: always visible.
    expect(
      canSeeSubmissionDetail(submission, users.normal, {
        problem: { ...publicProblem, submissionSourceVisibility: "A" },
      }),
    ).toBe(true);

    // S: visible on a public problem once solved.
    const solvedContext = {
      problem: { ...publicProblem, submissionSourceVisibility: "S" as const },
      hasSolvedProblem: true,
    };
    expect(canSeeSubmissionDetail(submission, users.normal, solvedContext)).toBe(true);
    expect(
      canSeeSubmissionDetail(submission, users.normal, { ...solvedContext, hasSolvedProblem: false }),
    ).toBe(false);

    // S on a private problem: only testers, and only once solved.
    const privateSolved = {
      problem: {
        ...createProblem("priv"),
        submissionSourceVisibility: "S" as const,
        testerProfileIds: ["normal"],
      },
      hasSolvedProblem: true,
    };
    expect(canSeeSubmissionDetail(submission, users.normal, privateSolved)).toBe(true);

    // O: only testers see others' submissions.
    const onlyOwn = { ...publicProblem, submissionSourceVisibility: "O" as const };
    expect(canSeeSubmissionDetail(submission, users.normal, { problem: onlyOwn })).toBe(false);
    expect(
      canSeeSubmissionDetail(submission, users.normal, {
        problem: { ...onlyOwn, testerProfileIds: ["normal"] },
      }),
    ).toBe(true);

    // F: follows the global default, which is all-solved.
    const follow = { ...publicProblem, submissionSourceVisibility: "F" as const };
    expect(resolveSubmissionSourceVisibility(follow)).toBe("S");
    expect(resolveSubmissionSourceVisibility(follow, "all")).toBe("A");
    expect(resolveSubmissionSourceVisibility(follow, "only-own")).toBe("O");
    expect(
      canSeeSubmissionDetail(submission, users.normal, { problem: follow, hasSolvedProblem: true }),
    ).toBe(true);
    expect(
      canSeeSubmissionDetail(submission, users.normal, {
        problem: follow,
        globalSubmissionSourceVisibility: "all",
      }),
    ).toBe(true);
  });

  it("lets contest staff see in-contest submissions", () => {
    const problem = createProblem("contest_problem");
    const submission = { profileId: "someone_else" };

    const contest = createContest("c", { curatorProfileIds: ["normal"] });
    expect(canSeeSubmissionDetail(submission, users.normal, { problem, contest })).toBe(true);

    const viewSubs = createContest("c", { viewContestSubmissionsProfileIds: ["normal"] });
    expect(canSeeSubmissionDetail(submission, users.normal, { problem, contest: viewSubs })).toBe(true);

    const testerSees = createContest("c", {
      testerProfileIds: ["normal"],
      testerSeeSubmissions: true,
    });
    expect(canSeeSubmissionDetail(submission, users.normal, { problem, contest: testerSees })).toBe(true);

    const testerBlind = createContest("c", {
      testerProfileIds: ["normal"],
      testerSeeSubmissions: false,
    });
    expect(canSeeSubmissionDetail(submission, users.normal, { problem, contest: testerBlind })).toBe(false);
  });
});
