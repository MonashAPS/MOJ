/**
 * Fixture builders for the Convex function tests.
 *
 * Two dots in the filename keep this out of the deployed function set, like
 * convexTest.setup.ts.
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { insertProfileAggregates } from "../rankings";

export type ProfileOverrides = {
  points?: number;
  performancePoints?: number;
  problemCount?: number;
  rating?: number;
  isUnlisted?: boolean;
  isStaff?: boolean;
  isSuperuser?: boolean;
  permissions?: string[];
  legacyUserId?: number;
  legacyApiTokenHash?: string;
  mute?: boolean;
  isActive?: boolean;
  legacyId?: number;
};

export async function makeProfile(
  ctx: MutationCtx,
  username: string,
  overrides: ProfileOverrides = {},
): Promise<Id<"profiles">> {
  const profileId = await ctx.db.insert("profiles", {
    userId: `user_${username}`,
    username,
    about: "",
    timezone: "Australia/Melbourne",
    points: overrides.points ?? 0,
    performancePoints: overrides.performancePoints ?? 0,
    problemCount: overrides.problemCount ?? 0,
    rating: overrides.rating,
    displayRank: "user",
    mute: overrides.mute ?? false,
    isUnlisted: overrides.isUnlisted ?? false,
    isBannedFromProblemVoting: false,
    mathEngine: "auto",
    siteTheme: "auto",
    editorTheme: "github",
    notes: "",
    isStaff: overrides.isStaff ?? false,
    isSuperuser: overrides.isSuperuser ?? false,
    isActive: overrides.isActive ?? true,
    permissions: overrides.permissions ?? [],
    groups: [],
    joinDate: Date.UTC(2024, 0, 1),
    legacyUserId: overrides.legacyUserId,
    legacyApiTokenHash: overrides.legacyApiTokenHash,
    legacyId: overrides.legacyId,
  });
  const inserted = await ctx.db.get(profileId);
  if (inserted) await insertProfileAggregates(ctx, inserted);
  return profileId;
}

export async function makeLanguage(
  ctx: MutationCtx,
  key = "PY3",
  overrides: Partial<{ extension: string; shortName: string; legacyId: number }> = {},
): Promise<Id<"languages">> {
  return await ctx.db.insert("languages", {
    key,
    name: key,
    shortName: overrides.shortName ?? "py3",
    commonName: "Python",
    editorMode: "python",
    shikiLang: "python",
    template: "",
    info: "",
    description: "",
    extension: overrides.extension ?? "py",
    legacyId: overrides.legacyId,
  });
}

export async function makeGroup(ctx: MutationCtx, name = "uncategorized"): Promise<Id<"problemGroups">> {
  return await ctx.db.insert("problemGroups", { name, fullName: name });
}

export async function makeProblem(
  ctx: MutationCtx,
  code: string,
  groupId: Id<"problemGroups">,
  overrides: Partial<{
    name: string;
    points: number;
    isPublic: boolean;
    isOrganizationPrivate: boolean;
    partial: boolean;
    organizationIds: Id<"organizations">[];
    authorProfileIds: Id<"profiles">[];
    typeIds: Id<"problemTypes">[];
    allowedLanguageIds: Id<"languages">[];
    date: number;
  }> = {},
): Promise<Id<"problems">> {
  return await ctx.db.insert("problems", {
    code,
    name: overrides.name ?? code.toUpperCase(),
    description: "",
    authorProfileIds: overrides.authorProfileIds ?? [],
    curatorProfileIds: [],
    testerProfileIds: [],
    typeIds: overrides.typeIds ?? [],
    groupId,
    timeLimit: 1,
    memoryLimit: 65536,
    shortCircuit: false,
    points: overrides.points ?? 100,
    partial: overrides.partial ?? false,
    allowedLanguageIds: overrides.allowedLanguageIds ?? [],
    isPublic: overrides.isPublic ?? true,
    isManuallyManaged: false,
    date: overrides.date ?? Date.UTC(2024, 0, 1),
    bannedProfileIds: [],
    userCount: 0,
    acRate: 0,
    isFullMarkup: false,
    submissionSourceVisibility: "F",
    organizationIds: overrides.organizationIds ?? [],
    isOrganizationPrivate: overrides.isOrganizationPrivate ?? false,
  });
}

export async function makeSubmission(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  problemId: Id<"problems">,
  languageId: Id<"languages">,
  overrides: Partial<{
    date: number;
    points: number;
    result: "AC" | "WA" | "TLE" | "MLE" | "OLE" | "IR" | "RTE" | "CE" | "IE" | "SC" | "AB";
    casePoints: number;
    caseTotal: number;
    isArchived: boolean;
    time: number;
    memory: number;
    legacyId: number;
  }> = {},
): Promise<Id<"submissions">> {
  return await ctx.db.insert("submissions", {
    profileId,
    problemId,
    date: overrides.date ?? Date.UTC(2024, 5, 1),
    time: overrides.time ?? 0.1,
    memory: overrides.memory ?? 1024,
    points: overrides.points,
    languageId,
    status: "D",
    result: overrides.result ?? "AC",
    currentTestcase: 0,
    batch: false,
    casePoints: overrides.casePoints ?? 1,
    caseTotal: overrides.caseTotal ?? 1,
    isPretested: false,
    isArchived: overrides.isArchived ?? false,
    priority: 1,
    retryCount: 0,
    legacyId: overrides.legacyId,
  });
}

export async function makeOrganization(
  ctx: MutationCtx,
  slug: string,
  overrides: Partial<{
    name: string;
    shortName: string;
    isOpen: boolean;
    slots: number;
    accessCode: string;
    classRequired: boolean;
    adminProfileIds: Id<"profiles">[];
    legacyId: number;
  }> = {},
): Promise<Id<"organizations">> {
  return await ctx.db.insert("organizations", {
    name: overrides.name ?? slug,
    slug,
    shortName: overrides.shortName ?? slug.slice(0, 20),
    about: "",
    adminProfileIds: overrides.adminProfileIds ?? [],
    isOpen: overrides.isOpen ?? true,
    slots: overrides.slots,
    accessCode: overrides.accessCode,
    classRequired: overrides.classRequired ?? false,
    memberCount: 0,
    legacyId: overrides.legacyId,
  });
}

export async function makeContest(
  ctx: MutationCtx,
  key: string,
  overrides: Partial<{
    name: string;
    startTime: number;
    endTime: number;
    isVisible: boolean;
    isRated: boolean;
    isPrivate: boolean;
    formatName: string;
    scoreboardVisibility: "V" | "C" | "P" | "H";
    tagIds: Id<"contestTags">[];
    legacyId: number;
  }> = {},
): Promise<Id<"contests">> {
  return await ctx.db.insert("contests", {
    key,
    name: overrides.name ?? key,
    authorProfileIds: [],
    curatorProfileIds: [],
    testerProfileIds: [],
    spectatorProfileIds: [],
    testerSeeScoreboard: false,
    testerSeeSubmissions: false,
    description: "",
    startTime: overrides.startTime ?? Date.UTC(2024, 0, 1),
    endTime: overrides.endTime ?? Date.UTC(2024, 0, 2),
    isVisible: overrides.isVisible ?? true,
    isRated: overrides.isRated ?? false,
    viewContestScoreboardProfileIds: [],
    viewContestSubmissionsProfileIds: [],
    scoreboardVisibility: overrides.scoreboardVisibility ?? "V",
    useClarifications: false,
    rateAll: false,
    rateExcludeProfileIds: [],
    isPrivate: overrides.isPrivate ?? false,
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
    tagIds: overrides.tagIds ?? [],
    userCount: 0,
    bannedProfileIds: [],
    formatName: overrides.formatName ?? "default",
    formatConfig: {},
    labelScheme: "letters",
    customLabels: [],
    pointsPrecision: 3,
    freezeMinutes: 0,
    blindDuringFreeze: false,
    legacyId: overrides.legacyId,
  });
}
