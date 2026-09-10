/// <reference types="vite/client" />
/**
 * Fixtures for the contest tests: the smallest set of rows each table needs so
 * a contest, its problems, its participations and its submissions exist.
 *
 * The filename carries two dots on purpose: Convex's bundler skips any file
 * under `convex/` whose basename has more than one, so nothing in here is ever
 * pushed to a deployment.
 */

import type { GenericDatabaseWriter } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";

export type Writer = GenericDatabaseWriter<DataModel>;

export const HOUR = 3_600_000;
export const MINUTE = 60_000;

export async function insertProfile(
  db: Writer,
  username: string,
  overrides: Partial<Doc<"profiles">> = {},
): Promise<Id<"profiles">> {
  return await db.insert("profiles", {
    userId: `user_${username}`,
    username,
    about: "",
    timezone: "UTC",
    points: 0,
    performancePoints: 0,
    problemCount: 0,
    displayRank: "user",
    mute: false,
    isUnlisted: false,
    isBannedFromProblemVoting: false,
    mathEngine: "katex",
    siteTheme: "auto",
    editorTheme: "default",
    notes: "",
    isStaff: false,
    isSuperuser: false,
    permissions: [],
    groups: [],
    joinDate: Date.now(),
    ...overrides,
  });
}

export async function insertLanguage(db: Writer): Promise<Id<"languages">> {
  return await db.insert("languages", {
    key: "PY3",
    name: "Python 3",
    shortName: "PY3",
    commonName: "Python",
    editorMode: "python",
    shikiLang: "python",
    template: "",
    info: "",
    description: "",
    extension: "py",
  });
}

export async function insertGroup(db: Writer): Promise<Id<"problemGroups">> {
  return await db.insert("problemGroups", { name: "uncategorized", fullName: "Uncategorized" });
}

export async function insertProblem(
  db: Writer,
  code: string,
  groupId: Id<"problemGroups">,
  overrides: Partial<Doc<"problems">> = {},
): Promise<Id<"problems">> {
  return await db.insert("problems", {
    code,
    name: code.toUpperCase(),
    description: "",
    authorProfileIds: [],
    curatorProfileIds: [],
    testerProfileIds: [],
    typeIds: [],
    groupId,
    timeLimit: 1,
    memoryLimit: 65536,
    shortCircuit: false,
    points: 100,
    partial: false,
    allowedLanguageIds: [],
    isPublic: true,
    isManuallyManaged: false,
    date: Date.now(),
    bannedProfileIds: [],
    userCount: 0,
    acRate: 0,
    isFullMarkup: false,
    submissionSourceVisibility: "F",
    organizationIds: [],
    isOrganizationPrivate: false,
    ...overrides,
  });
}

export async function insertContest(
  db: Writer,
  key: string,
  overrides: Partial<Doc<"contests">> = {},
): Promise<Id<"contests">> {
  const now = Date.now();
  return await db.insert("contests", {
    key,
    name: `Contest ${key}`,
    authorProfileIds: [],
    curatorProfileIds: [],
    testerProfileIds: [],
    spectatorProfileIds: [],
    testerSeeScoreboard: false,
    testerSeeSubmissions: false,
    description: "",
    startTime: now - HOUR,
    endTime: now + HOUR,
    isVisible: true,
    isRated: false,
    viewContestScoreboardProfileIds: [],
    viewContestSubmissionsProfileIds: [],
    scoreboardVisibility: "V",
    useClarifications: true,
    rateAll: false,
    rateExcludeProfileIds: [],
    isPrivate: false,
    privateContestantProfileIds: [],
    hideProblemTags: false,
    hideProblemAuthors: false,
    runPretestsOnly: false,
    showShortDisplay: false,
    isOrganizationPrivate: false,
    organizationIds: [],
    limitJoinOrganizations: false,
    joinOrganizationIds: [],
    classIds: [],
    tagIds: [],
    userCount: 0,
    bannedProfileIds: [],
    formatName: "default",
    formatConfig: null,
    labelScheme: "letters",
    customLabels: [],
    pointsPrecision: 3,
    freezeMinutes: 0,
    blindDuringFreeze: false,
    ...overrides,
  });
}

export async function insertContestProblem(
  db: Writer,
  contestId: Id<"contests">,
  problemId: Id<"problems">,
  order: number,
  overrides: Partial<Doc<"contestProblems">> = {},
): Promise<Id<"contestProblems">> {
  return await db.insert("contestProblems", {
    contestId,
    problemId,
    points: 1,
    partial: false,
    isPretested: false,
    order,
    ...overrides,
  });
}

export async function insertParticipation(
  db: Writer,
  contestId: Id<"contests">,
  profileId: Id<"profiles">,
  overrides: Partial<Doc<"contestParticipations">> = {},
): Promise<Id<"contestParticipations">> {
  return await db.insert("contestParticipations", {
    contestId,
    profileId,
    realStart: Date.now(),
    score: 0,
    cumtime: 0,
    isDisqualified: false,
    tiebreaker: 0,
    virtual: 0,
    formatData: {},
    ...overrides,
  });
}

export type SubmissionInput = {
  profileId: Id<"profiles">;
  problemId: Id<"problems">;
  languageId: Id<"languages">;
  contestId?: Id<"contests">;
  contestProblemId?: Id<"contestProblems">;
  participationId?: Id<"contestParticipations">;
  date: number;
  result?: Doc<"submissions">["result"];
  points?: number;
  contestPoints?: number;
  casePoints?: number;
  caseTotal?: number;
  status?: Doc<"submissions">["status"];
  time?: number;
};

export async function insertSubmission(db: Writer, input: SubmissionInput): Promise<Id<"submissions">> {
  const points = input.points ?? (input.result === "AC" ? 100 : 0);
  return await db.insert("submissions", {
    profileId: input.profileId,
    problemId: input.problemId,
    languageId: input.languageId,
    date: input.date,
    status: input.status ?? "D",
    result: input.result,
    currentTestcase: 0,
    batch: false,
    casePoints: input.casePoints ?? (input.result === "AC" ? 1 : 0),
    caseTotal: input.caseTotal ?? 1,
    points,
    time: input.time ?? 0.1,
    memory: 1024,
    isPretested: false,
    contestId: input.contestId,
    contestProblemId: input.contestProblemId,
    participationId: input.participationId,
    contestPoints: input.contestPoints ?? (input.result === "AC" ? 1 : 0),
    isArchived: false,
    priority: 0,
    retryCount: 0,
  });
}

export async function insertOrganization(
  db: Writer,
  slug: string,
  overrides: Partial<Doc<"organizations">> = {},
): Promise<Id<"organizations">> {
  return await db.insert("organizations", {
    name: slug,
    slug,
    shortName: slug,
    about: "",
    adminProfileIds: [],
    isOpen: true,
    classRequired: false,
    memberCount: 0,
    ...overrides,
  });
}

export async function joinOrganization(
  db: Writer,
  organizationId: Id<"organizations">,
  profileId: Id<"profiles">,
): Promise<void> {
  await db.insert("organizationMemberships", { organizationId, profileId, order: 0 });
}

export function identityOf(username: string): { subject: string; issuer: string } {
  return { subject: `user_${username}`, issuer: "https://test" };
}
