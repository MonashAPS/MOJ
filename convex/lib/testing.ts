// Row builders for the Convex test suites. Every field the schema requires has
// a sensible default so a test only states what it cares about.

import type { Id } from "../_generated/dataModel";

type Overrides<T> = Partial<T>;

export function profileRow(
  username: string,
  overrides: Overrides<{
    userId: string;
    isStaff: boolean;
    isSuperuser: boolean;
    permissions: string[];
    mute: boolean;
    isUnlisted: boolean;
    rating: number;
    currentParticipationId: Id<"contestParticipations">;
  }> = {},
) {
  return {
    userId: overrides.userId ?? `user-${username}`,
    username,
    about: "",
    timezone: "Australia/Melbourne",
    points: 0,
    performancePoints: 0,
    problemCount: 0,
    rating: overrides.rating,
    displayRank: "user" as const,
    mute: overrides.mute ?? false,
    isUnlisted: overrides.isUnlisted ?? false,
    isBannedFromProblemVoting: false,
    currentParticipationId: overrides.currentParticipationId,
    mathEngine: "katex",
    siteTheme: "auto" as const,
    editorTheme: "auto",
    notes: "",
    isStaff: overrides.isStaff ?? false,
    isSuperuser: overrides.isSuperuser ?? false,
    permissions: overrides.permissions ?? [],
    groups: [],
    joinDate: Date.now(),
  };
}

export function languageRow(key = "PY3", name = "Python 3") {
  return {
    key,
    name,
    shortName: key,
    commonName: name,
    editorMode: "python",
    shikiLang: "python",
    template: "",
    info: "",
    description: "",
    extension: "py",
  };
}

export function problemRow(
  code: string,
  groupId: Id<"problemGroups">,
  overrides: Overrides<{
    name: string;
    isPublic: boolean;
    isOrganizationPrivate: boolean;
    authorProfileIds: Id<"profiles">[];
    date: number;
    description: string;
  }> = {},
) {
  return {
    code,
    name: overrides.name ?? code.toUpperCase(),
    description: overrides.description ?? `Statement for ${code}.`,
    authorProfileIds: overrides.authorProfileIds ?? [],
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
    isPublic: overrides.isPublic ?? true,
    isManuallyManaged: false,
    date: overrides.date ?? Date.now(),
    bannedProfileIds: [],
    userCount: 0,
    acRate: 0,
    isFullMarkup: false,
    submissionSourceVisibility: "F" as const,
    organizationIds: [],
    isOrganizationPrivate: overrides.isOrganizationPrivate ?? false,
  };
}

export function blogPostRow(
  title: string,
  overrides: Overrides<{
    slug: string;
    visible: boolean;
    sticky: boolean;
    publishOn: number;
    content: string;
    summary: string;
    authorProfileIds: Id<"profiles">[];
  }> = {},
) {
  return {
    title,
    authorProfileIds: overrides.authorProfileIds ?? [],
    slug: overrides.slug ?? title.toLowerCase().replace(/\s+/g, "-"),
    visible: overrides.visible ?? true,
    sticky: overrides.sticky ?? false,
    publishOn: overrides.publishOn ?? Date.now() - 1000,
    content: overrides.content ?? `Body of ${title}.`,
    summary: overrides.summary ?? "",
  };
}

export function contestRow(
  key: string,
  overrides: Overrides<{
    name: string;
    isVisible: boolean;
    isPrivate: boolean;
    isOrganizationPrivate: boolean;
    startTime: number;
    endTime: number;
  }> = {},
) {
  const start = overrides.startTime ?? Date.now() - 3_600_000;
  return {
    key,
    name: overrides.name ?? key.toUpperCase(),
    authorProfileIds: [],
    curatorProfileIds: [],
    testerProfileIds: [],
    spectatorProfileIds: [],
    testerSeeScoreboard: false,
    testerSeeSubmissions: false,
    description: "",
    startTime: start,
    endTime: overrides.endTime ?? start + 7_200_000,
    isVisible: overrides.isVisible ?? true,
    isRated: false,
    viewContestScoreboardProfileIds: [],
    viewContestSubmissionsProfileIds: [],
    scoreboardVisibility: "V" as const,
    useClarifications: true,
    rateAll: false,
    rateExcludeProfileIds: [],
    isPrivate: overrides.isPrivate ?? false,
    privateContestantProfileIds: [],
    hideProblemTags: false,
    hideProblemAuthors: false,
    runPretestsOnly: false,
    showShortDisplay: false,
    isOrganizationPrivate: overrides.isOrganizationPrivate ?? false,
    organizationIds: [],
    limitJoinOrganizations: false,
    joinOrganizationIds: [],
    classIds: [],
    tagIds: [],
    userCount: 0,
    bannedProfileIds: [],
    formatName: "default",
    formatConfig: null,
    labelScheme: "letters" as const,
    customLabels: [],
    pointsPrecision: 2,
    freezeMinutes: 0,
    blindDuringFreeze: false,
  };
}

export function solvedSubmissionRow(
  profileId: Id<"profiles">,
  problemId: Id<"problems">,
  languageId: Id<"languages">,
) {
  return {
    profileId,
    problemId,
    date: Date.now(),
    languageId,
    status: "D" as const,
    result: "AC" as const,
    currentTestcase: 0,
    batch: false,
    casePoints: 100,
    caseTotal: 100,
    isPretested: false,
    isArchived: false,
    priority: 0,
    retryCount: 0,
    points: 100,
  };
}

export function siteSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    singleton: "site" as const,
    siteName: "MOJ",
    siteLongName: "MOJ, the MAPS Online Judge",
    siteAdminEmail: "admin@example.com",
    registrationOpen: true,
    defaultUserTimezone: "Australia/Melbourne",
    defaultUserLanguageKey: "PY3",
    problemsPerPage: 50,
    commentsPerPage: 50,
    submissionsPerPage: 50,
    userRankingsPerPage: 100,
    blogPostsPerPage: 10,
    ratingRatios: [0.05, 0.15, 0.4, 0.7],
    requireStaffTwoFactor: true,
    pdfEnabled: false,
    ...overrides,
  };
}

export function judgeRow(name: string, authKeyHash: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    authKeyHash,
    isBlocked: false,
    isDisabled: false,
    tier: 1,
    online: false,
    description: "",
    problemCodes: [],
    runtimeKeys: [],
    ...overrides,
  };
}
