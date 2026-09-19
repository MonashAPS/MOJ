/**
 * judge/models/tests/test_contest.py, ported.
 */

import { describe, expect, it } from "vitest";
import {
  contestTimeBeforeEnd,
  contestTimeBeforeStart,
  contestWindowLength,
  participationEndTime,
  participationHasEnded,
  participationIsLive,
  participationIsSpectating,
  participationStart,
  participationTimeRemaining,
} from "./contestTiming";
import { getContestLabelForProblem } from "./formats/index";
import {
  contestAccessCheck,
  contestCanSeeFullScoreboard,
  contestCanSeeOwnScoreboard,
  contestEnded,
  contestHasCompletedContest,
  contestIsAccessibleBy,
  contestIsEditableBy,
  contestIsInContest,
  contestIsLiveJoinableBy,
  contestIsSpectatableBy,
  contestIsVisibleTo,
  contestScoreboardIsPublic,
  contestStarted,
} from "./permissions";
import type { CommonUsers } from "./test.fixtures";
import {
  commonUsers,
  createContest,
  createParticipation,
  createUser,
  DAY,
  defined,
  HOUR,
  NOW,
  withOrganizations,
} from "./test.fixtures";
import {
  type ContestParticipationRow,
  type ContestRow,
  type Id,
  PARTICIPATION_SPECTATE,
  type Viewer,
} from "./types";

const METHODS = [
  "can_see_own_scoreboard",
  "can_see_full_scoreboard",
  "is_live_joinable_by",
  "is_spectatable_by",
  "is_accessible_by",
  "is_editable_by",
  "is_in_contest",
  "has_completed_contest",
] as const;

type Method = (typeof METHODS)[number];

type Matrix = Record<string, Partial<Record<Method, boolean>>>;

function buildUsers(): CommonUsers {
  const users = commonUsers();
  Object.assign(users, {
    staff_contest_edit_own: createUser("staff_contest_edit_own", {
      isStaff: true,
      permissions: ["edit_own_contest"],
    }),
    staff_contest_see_all: createUser("staff_contest_see_all", {
      permissions: ["see_private_contest"],
    }),
    staff_contest_edit_all: createUser("staff_contest_edit_all", {
      isStaff: true,
      permissions: ["edit_own_contest", "edit_all_contest"],
    }),
    normal_during_window: createUser("normal_during_window"),
    normal_after_window: createUser("normal_after_window"),
    normal_before_window: createUser("normal_before_window"),
    non_staff_author: createUser("non_staff_author"),
    non_staff_tester: createUser("non_staff_tester"),
    normal_open_org: withOrganizations(createUser("normal_open_org"), ["open"]),
    non_staff_spectator: createUser("non_staff_spectator"),
  });
  // The `normal` user is in a contest: profile.current_contest points at their
  // live participation in `hidden_scoreboard`.
  users.normal = createUser("normal", {
    currentParticipationId: "hidden_scoreboard:normal:0",
    currentContestId: "hidden_scoreboard",
  });

  return users;
}

const users = buildUsers();

const contests = {
  basic: createContest("basic", {
    startTime: NOW - DAY,
    endTime: NOW + 100 * DAY,
    authorProfileIds: ["superuser", "staff_contest_edit_own"],
    testerProfileIds: ["non_staff_tester"],
  }),
  hidden_scoreboard: createContest("hidden_scoreboard", {
    startTime: NOW - DAY,
    endTime: NOW + 100 * DAY,
    isVisible: true,
    scoreboard: { audiences: ["everyone"], from: "end" },
    labels: { kind: "custom", labels: ["0", "1", "2"] },
    spectatorProfileIds: ["non_staff_spectator"],
  }),
  non_staff_author: createContest("non_staff_author", {
    startTime: NOW - DAY,
    endTime: NOW + 100 * DAY,
    isVisible: true,
    scoreboard: { audiences: ["everyone"], from: "end" },
    authorProfileIds: ["non_staff_author"],
    curatorProfileIds: ["staff_contest_edit_own"],
  }),
  contest_scoreboard: createContest("contest_scoreboard", {
    startTime: NOW - 10 * DAY,
    endTime: NOW + 100 * DAY,
    schedule: { kind: "window", seconds: DAY / 1000 },
    isVisible: true,
    scoreboard: { audiences: ["everyone"], from: "end" },
    testerProfileIds: ["non_staff_tester"],
  }),
  particip_scoreboard: createContest("particip_scoreboard", {
    startTime: NOW - 10 * DAY,
    endTime: NOW + 100 * DAY,
    schedule: { kind: "window", seconds: DAY / 1000 },
    isVisible: true,
    scoreboard: { audiences: ["everyone"], from: "ownEnd" },
    testerProfileIds: ["non_staff_tester"],
  }),
  visible_scoreboard: createContest("visible_scoreboard", {
    startTime: NOW - 10 * DAY,
    endTime: NOW + 100 * DAY,
    schedule: { kind: "window", seconds: DAY / 1000 },
    isVisible: true,
    scoreboard: { audiences: ["everyone"], from: "start" },
    testerProfileIds: ["non_staff_tester"],
  }),
  full_hidden_board: createContest("full_hidden_board", {
    startTime: NOW - 100 * DAY,
    endTime: NOW - DAY,
    schedule: { kind: "window", seconds: DAY / 1000 },
    isVisible: true,
    scoreboard: { audiences: [], from: "start" },
    authorProfileIds: ["non_staff_author"],
    curatorProfileIds: ["staff_contest_edit_own"],
    testerProfileIds: ["non_staff_tester"],
    spectatorProfileIds: ["non_staff_spectator"],
  }),
  future_contest: createContest("future_contest", {
    startTime: NOW + 3 * DAY,
    endTime: NOW + 5 * DAY,
    schedule: { kind: "window", seconds: DAY / 1000 },
    isVisible: true,
    scoreboard: { audiences: ["everyone"], from: "end" },
    authorProfileIds: ["non_staff_author"],
    curatorProfileIds: ["staff_contest_edit_own"],
    testerProfileIds: ["non_staff_tester"],
    spectatorProfileIds: ["non_staff_spectator"],
  }),
  tester_see_board: createContest("tester_see_board", {
    startTime: NOW - 100 * DAY,
    endTime: NOW + 100 * DAY,
    schedule: { kind: "window", seconds: DAY / 1000 },
    isVisible: true,
    scoreboard: { audiences: [], from: "start" },
    testerProfileIds: ["non_staff_tester"],
    testerSeeScoreboard: true,
  }),
  limit_org_join: createContest("limit_org_join", {
    startTime: NOW - 2 * DAY,
    endTime: NOW + 2 * DAY,
    schedule: { kind: "window", seconds: DAY / 1000 },
    isVisible: true,
    joinLimit: { organizationIds: ["open"] },
    scoreboard: { audiences: ["everyone"], from: "start" },
    authorProfileIds: ["non_staff_author"],
    curatorProfileIds: ["staff_contest_edit_own"],
    testerProfileIds: ["non_staff_tester"],
  }),
  private: createContest("private", {
    startTime: NOW - 5 * DAY,
    endTime: NOW - 3 * DAY,
    isVisible: true,
    entry: {
      kind: "restricted",
      match: "all",
      organizationIds: [],
      classIds: [],
      profileIds: ["staff_contest_edit_own"],
    },
    testerProfileIds: ["non_staff_tester"],
  }),
  organization_private: createContest("organization_private", {
    startTime: NOW - 5 * DAY,
    endTime: NOW + 6 * DAY,
    isVisible: true,
    entry: { kind: "restricted", match: "all", organizationIds: ["open"], classIds: [], profileIds: [] },
    alwaysAdmitProfileIds: ["normal"],
    testerProfileIds: ["non_staff_tester"],
  }),
  future_org_private: createContest("future_org_private", {
    startTime: NOW + 3 * DAY,
    endTime: NOW + 6 * DAY,
    isVisible: true,
    entry: { kind: "restricted", match: "all", organizationIds: ["open"], classIds: [], profileIds: [] },
    alwaysAdmitProfileIds: ["normal"],
    testerProfileIds: ["non_staff_tester"],
  }),
  private_user: createContest("private_user", {
    startTime: NOW - 3 * DAY,
    endTime: NOW + 6 * DAY,
    isVisible: true,
    entry: { kind: "restricted", match: "all", organizationIds: [], classIds: [], profileIds: [] },
    testerProfileIds: ["non_staff_tester"],
  }),
  non_visible_contest: createContest("non_visible_contest", {
    startTime: NOW - 3 * DAY,
    endTime: NOW + 6 * DAY,
    isVisible: false,
  }),
  non_visible_w_tester: createContest("non_visible_w_tester", {
    startTime: NOW - 3 * DAY,
    endTime: NOW + 6 * DAY,
    isVisible: false,
    testerProfileIds: ["non_staff_tester"],
  }),
} satisfies Record<string, ContestRow>;

const participations: ContestParticipationRow[] = [];

for (const key of ["contest_scoreboard", "particip_scoreboard", "visible_scoreboard"] as const) {
  participations.push(
    createParticipation(key, "normal_during_window", { realStart: NOW - HOUR }),
    createParticipation(key, "normal_after_window", { realStart: NOW - 3 * DAY }),
  );
}

participations.push(
  createParticipation("particip_scoreboard", "normal", { realStart: NOW - 3 * DAY }),
  createParticipation("particip_scoreboard", "normal", {
    realStart: NOW + 101 * DAY,
    virtual: PARTICIPATION_SPECTATE,
  }),
  createParticipation("full_hidden_board", "normal_after_window", { realStart: NOW - 5 * DAY }),
  createParticipation("hidden_scoreboard", "normal"),
);

function liveParticipation(contestId: Id, profileId: Id): ContestParticipationRow | null {
  return (
    participations.find(
      (participation) =>
        participation.contestId === contestId &&
        participation.profileId === profileId &&
        participation.virtual === 0,
    ) ?? null
  );
}

function context(contest: ContestRow, viewer: Viewer) {
  return {
    now: NOW,
    liveParticipation: viewer ? liveParticipation(contest.id, viewer.id) : null,
  };
}

function checkMatrix(contest: ContestRow, matrix: Matrix): void {
  for (const [username, methods] of Object.entries(matrix)) {
    const viewer = users[username];
    const ctx = context(contest, viewer);

    const run: Record<Method, () => boolean> = {
      can_see_own_scoreboard: () => contestCanSeeOwnScoreboard(contest, viewer, ctx),
      can_see_full_scoreboard: () => contestCanSeeFullScoreboard(contest, viewer, ctx),
      is_live_joinable_by: () => contestIsLiveJoinableBy(contest, viewer, ctx),
      is_spectatable_by: () => contestIsSpectatableBy(contest, viewer),
      is_accessible_by: () => contestIsAccessibleBy(contest, viewer),
      is_editable_by: () => contestIsEditableBy(contest, viewer),
      is_in_contest: () => contestIsInContest(contest, viewer),
      has_completed_contest: () => contestHasCompletedContest(contest, viewer, ctx),
    };

    for (const method of METHODS) {
      const expected = methods[method];

      if (expected === undefined) continue;

      expect(run[method](), `${method}/${username}/${contest.key}`).toBe(expected);
    }
  }
}

describe("ContestTestCase", () => {
  it("test_basic_contest", () => {
    const contest = contests.basic;
    expect(contestScoreboardIsPublic(contest, NOW)).toBe(true);
    expect(contestWindowLength(contest)).toBe(101 * DAY);
    expect(contestStarted(contest, NOW)).toBe(true);
    expect(contestTimeBeforeStart(contest, NOW)).toBeNull();
    expect(contestTimeBeforeEnd(contest, NOW)).toBeGreaterThan(0);
    expect(contestEnded(contest, NOW)).toBe(false);
    // DMOJ's default format numbers its problems; every contest here is
    // lettered, whatever format it runs under.
    expect(getContestLabelForProblem(contest, 0)).toBe("A");
  });

  it("test_hidden_scoreboard_contest", () => {
    const contest = contests.hidden_scoreboard;
    expect(contestScoreboardIsPublic(contest, NOW)).toBe(false);

    for (let i = 0; i < 3; i++) {
      expect(getContestLabelForProblem(contest, i)).toBe(String(i));
    }
  });

  it("test_private_contest", () => {
    const contest = contests.private;
    expect(contestStarted(contest, NOW)).toBe(true);
    expect(contestTimeBeforeStart(contest, NOW)).toBeNull();
    expect(contestTimeBeforeEnd(contest, NOW)).toBeNull();
  });

  it("test_organization_private_contest", () => {
    const contest = contests.organization_private;
    expect(contestStarted(contest, NOW)).toBe(true);
    expect(contestScoreboardIsPublic(contest, NOW)).toBe(true);
    expect(contestEnded(contest, NOW)).toBe(false);
    expect(contestTimeBeforeStart(contest, NOW)).toBeNull();
    expect(contestTimeBeforeEnd(contest, NOW)).toBeGreaterThan(0);
  });

  it("test_future_organization_private_contest", () => {
    const contest = contests.future_org_private;
    expect(contestStarted(contest, NOW)).toBe(false);
    expect(contestScoreboardIsPublic(contest, NOW)).toBe(false);
    expect(contestEnded(contest, NOW)).toBe(false);
    expect(contestTimeBeforeStart(contest, NOW)).toBeGreaterThan(0);
    expect(contestTimeBeforeEnd(contest, NOW)).toBeGreaterThan(0);
  });

  it("test_basic_contest_methods", () => {
    expect(contestAccessCheck(contests.basic, users.normal)).toEqual({ kind: "inaccessible" });

    checkMatrix(contests.basic, {
      superuser: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_live_joinable_by: false,
        is_spectatable_by: true,
        is_accessible_by: true,
        is_editable_by: true,
        is_in_contest: false,
      },
      staff_contest_edit_own: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_live_joinable_by: false,
        is_spectatable_by: true,
        is_accessible_by: true,
        is_editable_by: true,
        is_in_contest: false,
      },
      staff_contest_see_all: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_live_joinable_by: true,
        is_spectatable_by: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      staff_contest_edit_all: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_live_joinable_by: true,
        is_spectatable_by: true,
        is_accessible_by: true,
        is_editable_by: true,
        is_in_contest: false,
      },
      normal: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_live_joinable_by: true,
        is_spectatable_by: true,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
      non_staff_tester: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_live_joinable_by: false,
        is_spectatable_by: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      anonymous: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_live_joinable_by: false,
        is_spectatable_by: false,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
    });
  });

  it("test_hidden_scoreboard_contest_methods", () => {
    checkMatrix(contests.hidden_scoreboard, {
      staff_contest_edit_own: {
        can_see_own_scoreboard: false,
        can_see_full_scoreboard: false,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      staff_contest_see_all: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      staff_contest_edit_all: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: true,
        is_in_contest: false,
      },
      non_staff_spectator: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      normal: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: false,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: true,
      },
      anonymous: {
        can_see_own_scoreboard: false,
        can_see_full_scoreboard: false,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
    });
  });

  it("test_contest_hidden_scoreboard_non_staff_author_contest_methods", () => {
    checkMatrix(contests.non_staff_author, {
      staff_contest_edit_own: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: true,
        is_in_contest: false,
      },
      non_staff_author: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
    });
  });

  it("test_contest_hidden_scoreboard_contest_methods", () => {
    checkMatrix(contests.contest_scoreboard, {
      normal_before_window: {
        can_see_own_scoreboard: false,
        can_see_full_scoreboard: false,
        is_live_joinable_by: true,
        is_spectatable_by: true,
        has_completed_contest: false,
      },
      normal_during_window: {
        can_see_own_scoreboard: false,
        can_see_full_scoreboard: false,
        has_completed_contest: false,
      },
      normal_after_window: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: false,
        is_live_joinable_by: false,
        is_spectatable_by: true,
        has_completed_contest: true,
      },
      non_staff_tester: {
        can_see_own_scoreboard: false,
        can_see_full_scoreboard: false,
        is_live_joinable_by: false,
        is_spectatable_by: true,
        has_completed_contest: false,
      },
    });
  });

  it("test_particip_hidden_scoreboard_contest_methods", () => {
    checkMatrix(contests.particip_scoreboard, {
      normal_before_window: {
        can_see_own_scoreboard: false,
        can_see_full_scoreboard: false,
        has_completed_contest: false,
      },
      normal_during_window: {
        can_see_own_scoreboard: false,
        can_see_full_scoreboard: false,
        has_completed_contest: false,
      },
      normal_after_window: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        has_completed_contest: true,
      },
      normal: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        has_completed_contest: true,
      },
      non_staff_tester: {
        can_see_own_scoreboard: false,
        can_see_full_scoreboard: false,
        has_completed_contest: false,
      },
    });
  });

  it("test_visible_scoreboard_contest_methods", () => {
    checkMatrix(contests.visible_scoreboard, {
      normal_before_window: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        has_completed_contest: false,
      },
      normal_during_window: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        has_completed_contest: false,
      },
      normal_after_window: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        has_completed_contest: true,
      },
      non_staff_tester: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        has_completed_contest: false,
      },
    });
  });

  it("test_full_hidden_scoreboard_contest_methods", () => {
    checkMatrix(contests.full_hidden_board, {
      superuser: { can_see_own_scoreboard: true, can_see_full_scoreboard: true },
      non_staff_tester: { can_see_own_scoreboard: false, can_see_full_scoreboard: false },
      non_staff_author: { can_see_own_scoreboard: true, can_see_full_scoreboard: true },
      staff_contest_edit_own: { can_see_own_scoreboard: true, can_see_full_scoreboard: true },
      staff_contest_edit_all: { can_see_own_scoreboard: true, can_see_full_scoreboard: true },
      normal: { can_see_own_scoreboard: false, can_see_full_scoreboard: false },
      normal_after_window: { can_see_own_scoreboard: true, can_see_full_scoreboard: false },
    });
  });

  it("test_tester_see_scoreboard_contest_methods", () => {
    checkMatrix(contests.tester_see_board, {
      superuser: { can_see_own_scoreboard: true, can_see_full_scoreboard: true },
      non_staff_tester: { can_see_own_scoreboard: true, can_see_full_scoreboard: true },
      normal: { can_see_own_scoreboard: false, can_see_full_scoreboard: false },
    });
  });

  it("test_public_limit_organization_join_contest", () => {
    checkMatrix(contests.limit_org_join, {
      non_staff_tester: { is_live_joinable_by: false, is_spectatable_by: true },
      non_staff_author: { is_live_joinable_by: false, is_spectatable_by: true },
      staff_contest_edit_own: { is_live_joinable_by: false, is_spectatable_by: true },
      staff_contest_edit_all: { is_live_joinable_by: false, is_spectatable_by: false },
      normal: { is_live_joinable_by: false, is_spectatable_by: false },
      normal_open_org: { is_live_joinable_by: true, is_spectatable_by: true },
      normal_after_window: { is_live_joinable_by: false, is_spectatable_by: false },
    });
  });

  it("test_future_contest_methods", () => {
    checkMatrix(contests.future_contest, {
      non_staff_spectator: { can_see_own_scoreboard: false, can_see_full_scoreboard: false },
      non_staff_tester: { can_see_own_scoreboard: false, can_see_full_scoreboard: false },
      non_staff_author: { can_see_own_scoreboard: true, can_see_full_scoreboard: true },
      staff_contest_edit_own: { can_see_own_scoreboard: true, can_see_full_scoreboard: true },
      staff_contest_edit_all: { can_see_own_scoreboard: true, can_see_full_scoreboard: true },
      normal: { can_see_own_scoreboard: false, can_see_full_scoreboard: false },
    });
  });

  it("test_private_contest_methods", () => {
    // With both an organisation and a person named, and `match: "all"`, a
    // competitor has to be in the organisation and be named.
    const normalOpenOrg = users.normal_open_org;

    const entry = {
      kind: "restricted",
      match: "all",
      organizationIds: ["open"],
      classIds: [],
      profileIds: ["staff_contest_edit_own"],
    } as const;

    const withOrg = { ...contests.private, entry };

    expect(contestAccessCheck(withOrg, normalOpenOrg)).toEqual({
      kind: "privateContest",
      organizationIds: ["open"],
    });

    const withUser = { ...withOrg, entry: { ...entry, organizationIds: [] } };

    expect(contestAccessCheck(withUser, normalOpenOrg)).toEqual({
      kind: "privateContest",
      organizationIds: [],
    });

    const withBoth = {
      ...withOrg,
      entry: { ...entry, profileIds: [...entry.profileIds, "normal_open_org"] },
    };

    checkMatrix(withBoth, {
      normal_open_org: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_live_joinable_by: true,
        is_spectatable_by: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      staff_contest_see_all: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      anonymous: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
      non_staff_tester: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
    });
  });

  it("test_organization_private_contest_methods", () => {
    checkMatrix(contests.organization_private, {
      staff_contest_edit_own: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
      staff_contest_see_all: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      staff_contest_edit_all: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: true,
        is_in_contest: false,
      },
      normal: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_live_joinable_by: true,
        is_spectatable_by: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      non_staff_tester: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      anonymous: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
    });
  });

  it("test_future_organization_private_contest_methods", () => {
    checkMatrix(contests.future_org_private, {
      staff_contest_edit_own: {
        can_see_own_scoreboard: false,
        can_see_full_scoreboard: false,
        is_live_joinable_by: false,
        is_spectatable_by: true,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
      staff_contest_see_all: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_live_joinable_by: false,
        is_spectatable_by: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      staff_contest_edit_all: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_live_joinable_by: false,
        is_spectatable_by: true,
        is_accessible_by: true,
        is_editable_by: true,
        is_in_contest: false,
      },
      normal: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_live_joinable_by: false,
        is_spectatable_by: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      non_staff_tester: {
        can_see_own_scoreboard: false,
        can_see_full_scoreboard: false,
        is_live_joinable_by: false,
        is_spectatable_by: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      anonymous: {
        can_see_own_scoreboard: false,
        can_see_full_scoreboard: false,
        is_live_joinable_by: false,
        is_spectatable_by: false,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
    });
  });

  it("test_private_user_contest_methods", () => {
    checkMatrix(contests.private_user, {
      superuser: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: true,
        is_in_contest: false,
      },
      normal: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
      non_staff_tester: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      anonymous: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
    });
  });

  it("test_non_visible_contest_contest_methods", () => {
    checkMatrix(contests.non_visible_contest, {
      superuser: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: true,
        is_in_contest: false,
      },
      normal: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
      non_staff_tester: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
      anonymous: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
    });
  });

  it("test_non_visible_contest_with_tester_contest_methods", () => {
    checkMatrix(contests.non_visible_w_tester, {
      superuser: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: true,
        is_in_contest: false,
      },
      normal: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
      non_staff_tester: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: true,
        is_editable_by: false,
        is_in_contest: false,
      },
      anonymous: {
        can_see_own_scoreboard: true,
        can_see_full_scoreboard: true,
        is_accessible_by: false,
        is_editable_by: false,
        is_in_contest: false,
      },
    });
  });

  it("test_contests_list: is_accessible_by and get_visible_contests agree", () => {
    const all = Object.values(contests);

    for (const username of Object.keys(users)) {
      const viewer = users[username];

      const accessible = all
        .filter((contest) => contestIsAccessibleBy(contest, viewer))
        .map((contest) => contest.key)
        .sort();

      const visible = all
        .filter((contest) => contestIsVisibleTo(contest, viewer))
        .map((contest) => contest.key)
        .sort();

      expect(visible, `visible contests for ${username}`).toEqual(accessible);
    }
  });

  it("test_live_participation", () => {
    const participation = defined(liveParticipation("hidden_scoreboard", "normal"), "live participation");
    const contest = contests.hidden_scoreboard;
    expect(participationIsLive(participation)).toBe(true);
    expect(participationIsSpectating(participation)).toBe(false);
    expect(participationEndTime(participation, contest)).toBe(contest.endTime);
    expect(participationHasEnded(participation, contest, NOW)).toBe(false);
    expect(participationTimeRemaining(participation, contest, NOW)).toBeGreaterThan(0);
  });

  it("test_spectating_participation", () => {
    const contest = contests.hidden_scoreboard;

    const participation = createParticipation("hidden_scoreboard", "superuser", {
      virtual: PARTICIPATION_SPECTATE,
    });

    expect(participationIsLive(participation)).toBe(false);
    expect(participationIsSpectating(participation)).toBe(true);
    expect(participationStart(participation, contest)).toBe(contest.startTime);
    expect(participationEndTime(participation, contest)).toBe(contest.endTime);
  });

  it("test_virtual_participation", () => {
    const contest = contests.private;
    const participation = createParticipation("private", "superuser", { virtual: 1 });
    expect(participationIsLive(participation)).toBe(false);
    expect(participationIsSpectating(participation)).toBe(false);
    expect(participationStart(participation, contest)).toBe(participation.realStart);
    expect(participationEndTime(participation, contest)).toBe(
      participation.realStart + (contest.endTime - contest.startTime),
    );
  });
});
