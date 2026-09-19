/**
 * Participation windows and the join decision, plus the verdict tables.
 */

import { describe, expect, it } from "vitest";
import {
  contestJoinDecision,
  participationEndTime,
  participationHasEnded,
  participationIsVirtual,
  participationStart,
  participationTimeRemaining,
} from "./contestTiming";
import { createContest, createParticipation, createUser, DAY, HOUR, MINUTE, NOW } from "./test.fixtures";
import { PARTICIPATION_SPECTATE } from "./types";
import {
  IN_PROGRESS_GRADING_STATUS,
  RESULT_NAMES,
  resultClassFromCode,
  SUBMISSION_RESULTS,
  SUBMISSION_STATUSES,
  USER_DISPLAY_CODES,
  verdictClassName,
  verdictName,
  verdictTone,
} from "./verdicts";

const contest = createContest("c", {
  startTime: NOW - HOUR,
  endTime: NOW + HOUR,
  isVisible: true,
});

const timed = { ...contest, timeLimit: 30 * 60 };

describe("participation windows", () => {
  it("an untimed live participation runs to the contest end", () => {
    const participation = createParticipation("c", "u", { realStart: NOW - HOUR });
    expect(participationStart(participation, contest)).toBe(contest.startTime);
    expect(participationEndTime(participation, contest)).toBe(contest.endTime);
  });

  it("a timed live participation ends at the earlier of the window and the contest", () => {
    const early = createParticipation("c", "u", { realStart: NOW - 45 * MINUTE });
    expect(participationStart(early, timed)).toBe(early.realStart);
    expect(participationEndTime(early, timed)).toBe(early.realStart + 30 * MINUTE);
    expect(participationHasEnded(early, timed, NOW)).toBe(true);

    const late = createParticipation("c", "u", { realStart: NOW + 50 * MINUTE });
    // The contest end wins when the personal window would run past it.
    expect(participationEndTime(late, timed)).toBe(timed.endTime);
  });

  it("a spectator follows the contest clock", () => {
    const spectator = createParticipation("c", "u", {
      realStart: NOW,
      virtual: PARTICIPATION_SPECTATE,
    });

    expect(participationStart(spectator, contest)).toBe(contest.startTime);
    expect(participationStart(spectator, timed)).toBe(spectator.realStart);
    expect(participationEndTime(spectator, contest)).toBe(contest.endTime);
    expect(participationEndTime(spectator, timed)).toBe(timed.endTime);
  });

  it("a virtual participation gets the time limit, or the whole window", () => {
    const virtual = createParticipation("c", "u", { realStart: NOW, virtual: 2 });
    expect(participationIsVirtual(virtual)).toBe(true);
    expect(participationStart(virtual, contest)).toBe(virtual.realStart);
    expect(participationEndTime(virtual, timed)).toBe(virtual.realStart + 30 * MINUTE);
    expect(participationEndTime(virtual, contest)).toBe(virtual.realStart + 2 * HOUR);
    expect(participationTimeRemaining(virtual, contest, NOW)).toBe(2 * HOUR);
  });

  it("a zero time limit is treated as no limit", () => {
    const zero = { ...contest, timeLimit: 0 };
    const virtual = createParticipation("c", "u", { realStart: NOW, virtual: 1 });
    expect(participationEndTime(virtual, zero)).toBe(virtual.realStart + 2 * HOUR);
  });

  it("a zero time limit is no limit for a live participation too", () => {
    // Reading zero as a limit made this `min(realStart + 0, endTime)`, so the
    // window closed the moment the competitor joined.
    const zero = { ...contest, timeLimit: 0 };
    const live = createParticipation("c", "u", { realStart: NOW, virtual: 0 });

    expect(participationEndTime(live, zero)).toBe(contest.endTime);
    expect(participationHasEnded(live, zero, NOW)).toBe(false);
  });

  it("reports no remaining time once the window closes", () => {
    const done = createParticipation("c", "u", { realStart: NOW - 45 * MINUTE });
    expect(participationTimeRemaining(done, timed, NOW)).toBeNull();
  });
});

describe("contestJoinDecision", () => {
  const user = createUser("u");
  const open = { ...contest, startTime: NOW - HOUR, endTime: NOW + HOUR };

  it("requires a login", () => {
    expect(contestJoinDecision(open, null, { now: NOW })).toEqual({ kind: "loginRequired" });
  });

  it("refuses before the start, unless you run the contest", () => {
    const future = { ...open, startTime: NOW + DAY, endTime: NOW + 2 * DAY };
    expect(contestJoinDecision(future, user, { now: NOW })).toEqual({ kind: "notStarted" });

    const tester = createUser("tester");
    const withTester = { ...future, testerProfileIds: ["tester"] };
    expect(contestJoinDecision(withTester, tester, { now: NOW }).kind).not.toBe("notStarted");
  });

  it("refuses a banned user, but never a superuser", () => {
    const banned = { ...open, bannedProfileIds: ["u", "superuser"] };
    expect(contestJoinDecision(banned, user, { now: NOW })).toEqual({ kind: "banned" });
    const superuser = createUser("superuser", { isSuperuser: true, isStaff: true });
    expect(contestJoinDecision(banned, superuser, { now: NOW }).kind).not.toBe("banned");
  });

  it("joins live, and resumes an existing participation", () => {
    expect(contestJoinDecision(open, user, { now: NOW })).toEqual({ kind: "live" });

    const existing = createParticipation("c", "u", { realStart: NOW - MINUTE });
    expect(contestJoinDecision(open, user, { now: NOW, participations: [existing] })).toEqual({
      kind: "live",
      participationId: existing.id,
    });
  });

  it("drops a finished window into spectating", () => {
    const finished = createParticipation("c", "u", { realStart: NOW - 45 * MINUTE });
    const decision = contestJoinDecision(timed, user, { now: NOW, participations: [finished] });
    expect(decision).toEqual({ kind: "spectate" });

    const spectating = createParticipation("c", "u", {
      realStart: NOW,
      virtual: PARTICIPATION_SPECTATE,
    });

    expect(contestJoinDecision(timed, user, { now: NOW, participations: [finished, spectating] })).toEqual({
      kind: "spectate",
      participationId: spectating.id,
    });
  });

  it("spectates when live joining is closed off", () => {
    const editorOnly = { ...open, testerProfileIds: ["u"] };
    expect(contestJoinDecision(editorOnly, user, { now: NOW })).toEqual({ kind: "spectate" });
  });

  it("cannot enter a contest limited to organizations you are not in", () => {
    const limited = { ...open, limitJoinOrganizations: true, joinOrganizationIds: ["open"] };
    expect(contestJoinDecision(limited, user, { now: NOW })).toEqual({ kind: "cannotEnter" });
  });

  it("creates the next virtual participation once the contest is over", () => {
    const over = { ...open, startTime: NOW - 2 * DAY, endTime: NOW - DAY };
    expect(contestJoinDecision(over, user, { now: NOW })).toEqual({ kind: "virtual", virtualId: 1 });

    const existing = [
      createParticipation("c", "u", { virtual: 0 }),
      createParticipation("c", "u", { virtual: 3 }),
    ];

    expect(contestJoinDecision(over, user, { now: NOW, participations: existing })).toEqual({
      kind: "virtual",
      virtualId: 4,
    });
  });

  it("asks for the access code only when a participation would be created", () => {
    const coded = { ...open, accessCode: "secret" };
    expect(contestJoinDecision(coded, user, { now: NOW })).toEqual({ kind: "accessCodeRequired" });
    expect(contestJoinDecision(coded, user, { now: NOW, accessCode: "wrong" })).toEqual({
      kind: "accessCodeRequired",
    });
    expect(contestJoinDecision(coded, user, { now: NOW, accessCode: "secret" })).toEqual({
      kind: "live",
    });

    const existing = createParticipation("c", "u", { realStart: NOW - MINUTE });
    expect(contestJoinDecision(coded, user, { now: NOW, participations: [existing] })).toEqual({
      kind: "live",
      participationId: existing.id,
    });

    // Contest staff never need the code.
    const editor = createUser("editor", { permissions: ["edit_own_contest"] });
    const staffCoded = { ...coded, curatorProfileIds: ["editor"] };
    expect(contestJoinDecision(staffCoded, editor, { now: NOW })).toEqual({ kind: "spectate" });
  });
});

describe("verdicts", () => {
  it("lists DMOJ result and status codes", () => {
    expect(SUBMISSION_RESULTS).toEqual([
      "AC",
      "WA",
      "TLE",
      "MLE",
      "OLE",
      "IR",
      "RTE",
      "CE",
      "IE",
      "SC",
      "AB",
    ]);
    expect(SUBMISSION_STATUSES).toEqual(["QU", "P", "G", "D", "IE", "CE", "AB"]);
    expect(IN_PROGRESS_GRADING_STATUS).toEqual(["QU", "P", "G"]);
    expect(RESULT_NAMES.AC).toBe("Accepted");
    expect(USER_DISPLAY_CODES.IE).toBe("Internal Error (judging server error)");
  });

  it("marks a partial accept", () => {
    expect(resultClassFromCode("AC", 10, 10)).toBe("AC");
    expect(resultClassFromCode("AC", 9, 10)).toBe("_AC");
    expect(resultClassFromCode("WA", 0, 10)).toBe("WA");
    expect(resultClassFromCode(null, 0, 0)).toBeNull();
  });

  it("assigns colour tones", () => {
    expect(verdictTone("AC")).toBe("accepted");
    expect(verdictTone("_AC")).toBe("partial");
    expect(verdictTone("WA")).toBe("wrong");
    expect(verdictTone("TLE")).toBe("neutral");
    expect(verdictTone("MLE")).toBe("neutral");
    expect(verdictTone("CE")).toBe("neutral");
    expect(verdictTone("AB")).toBe("neutral");
    expect(verdictTone("OLE")).toBe("warning");
    expect(verdictTone("IR")).toBe("warning");
    expect(verdictTone("RTE")).toBe("warning");
    expect(verdictTone("IE")).toBe("error");
    expect(verdictTone("QU")).toBe("pending");
    expect(verdictTone(null)).toBe("pending");
    expect(verdictTone("nonsense")).toBe("neutral");
  });

  it("names verdicts for display", () => {
    expect(verdictName("AC")).toBe("Accepted");
    expect(verdictName("_AC")).toBe("Accepted");
    expect(verdictName(null)).toBe("Queued");
    expect(verdictClassName("_AC")).toBe("_AC");
    expect(verdictClassName(null)).toBe("QU");
  });
});
