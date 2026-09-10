import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Shared seeding for the problems tests. Not a test file itself. */

declare global {
  // Vite supplies `import.meta.glob`, which convex-test needs to find the
  // function modules. The convex tsconfig does not pull in `vite/client`.
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

export type SeedProfileOptions = {
  username: string;
  isStaff?: boolean;
  isSuperuser?: boolean;
  permissions?: string[];
  isUnlisted?: boolean;
  isBannedFromProblemVoting?: boolean;
};

export async function seedProfile(ctx: MutationCtx, options: SeedProfileOptions): Promise<Id<"profiles">> {
  return await ctx.db.insert("profiles", {
    userId: `user_${options.username}`,
    username: options.username,
    about: "",
    timezone: "Australia/Melbourne",
    points: 0,
    performancePoints: 0,
    problemCount: 0,
    displayRank: "user",
    mute: false,
    isUnlisted: options.isUnlisted ?? false,
    isBannedFromProblemVoting: options.isBannedFromProblemVoting ?? false,
    mathEngine: "katex",
    siteTheme: "auto",
    editorTheme: "github",
    notes: "",
    isStaff: options.isStaff ?? false,
    isSuperuser: options.isSuperuser ?? false,
    permissions: options.permissions ?? [],
    groups: [],
    joinDate: Date.now(),
  });
}

export async function seedTaxonomy(ctx: MutationCtx) {
  const groupId = await ctx.db.insert("problemGroups", {
    name: "uncategorized",
    fullName: "Uncategorized",
  });
  const typeId = await ctx.db.insert("problemTypes", {
    name: "uncategorized",
    fullName: "Uncategorized",
  });
  const graphsTypeId = await ctx.db.insert("problemTypes", { name: "graphs", fullName: "Graphs" });
  const languageId = await ctx.db.insert("languages", {
    key: "PY3",
    name: "Python 3",
    shortName: "PY3",
    commonName: "Python",
    editorMode: "python",
    shikiLang: "python",
    template: "# your code here\n",
    info: "",
    description: "",
    extension: "py",
  });
  const cppId = await ctx.db.insert("languages", {
    key: "CPP20",
    name: "C++20",
    shortName: "C++20",
    commonName: "C++",
    editorMode: "c_cpp",
    shikiLang: "cpp",
    template: "int main() {}\n",
    info: "",
    description: "",
    extension: "cpp",
  });
  return { groupId, typeId, graphsTypeId, languageId, cppId };
}

export type SeedProblemOptions = {
  code: string;
  name?: string;
  description?: string;
  groupId: Id<"problemGroups">;
  typeIds?: Id<"problemTypes">[];
  languageIds?: Id<"languages">[];
  points?: number;
  isPublic?: boolean;
  isOrganizationPrivate?: boolean;
  organizationIds?: Id<"organizations">[];
  authorProfileIds?: Id<"profiles">[];
  testerProfileIds?: Id<"profiles">[];
  bannedProfileIds?: Id<"profiles">[];
  date?: number;
  acRate?: number;
  userCount?: number;
  partial?: boolean;
};

export async function seedProblem(ctx: MutationCtx, options: SeedProblemOptions): Promise<Id<"problems">> {
  return await ctx.db.insert("problems", {
    code: options.code,
    name: options.name ?? options.code,
    description: options.description ?? `Statement for ${options.code}.`,
    authorProfileIds: options.authorProfileIds ?? [],
    curatorProfileIds: [],
    testerProfileIds: options.testerProfileIds ?? [],
    typeIds: options.typeIds ?? [],
    groupId: options.groupId,
    timeLimit: 1,
    memoryLimit: 262_144,
    shortCircuit: true,
    points: options.points ?? 100,
    partial: options.partial ?? false,
    allowedLanguageIds: options.languageIds ?? [],
    isPublic: options.isPublic ?? true,
    isManuallyManaged: false,
    date: options.date ?? Date.now(),
    bannedProfileIds: options.bannedProfileIds ?? [],
    userCount: options.userCount ?? 0,
    acRate: options.acRate ?? 0,
    isFullMarkup: false,
    submissionSourceVisibility: "F",
    organizationIds: options.organizationIds ?? [],
    isOrganizationPrivate: options.isOrganizationPrivate ?? false,
  });
}

export type SeedSubmissionOptions = {
  profileId: Id<"profiles">;
  problemId: Id<"problems">;
  languageId: Id<"languages">;
  result?: "AC" | "WA" | "TLE" | "MLE" | "OLE" | "IR" | "RTE" | "CE" | "IE" | "SC" | "AB";
  points?: number;
  casePoints?: number;
  caseTotal?: number;
  time?: number;
  memory?: number;
  date?: number;
  contestId?: Id<"contests">;
  contestProblemId?: Id<"contestProblems">;
  participationId?: Id<"contestParticipations">;
  contestPoints?: number;
};

export async function seedSubmission(
  ctx: MutationCtx,
  options: SeedSubmissionOptions,
): Promise<Id<"submissions">> {
  const casePoints = options.casePoints ?? (options.result === "AC" ? 1 : 0);
  const caseTotal = options.caseTotal ?? 1;
  return await ctx.db.insert("submissions", {
    profileId: options.profileId,
    problemId: options.problemId,
    date: options.date ?? Date.now(),
    time: options.time,
    memory: options.memory,
    points: options.points,
    languageId: options.languageId,
    status: "D",
    result: options.result ?? "AC",
    currentTestcase: caseTotal,
    batch: false,
    casePoints,
    caseTotal,
    isPretested: false,
    contestId: options.contestId,
    contestProblemId: options.contestProblemId,
    participationId: options.participationId,
    contestPoints: options.contestPoints,
    isArchived: false,
    priority: 1,
    retryCount: 0,
  });
}

export async function seedContest(
  ctx: MutationCtx,
  options: {
    key: string;
    name?: string;
    startTime?: number;
    endTime?: number;
    isVisible?: boolean;
    hideProblemTags?: boolean;
    labelScheme?: "letters" | "numbers" | "custom";
  },
): Promise<Id<"contests">> {
  const now = Date.now();
  return await ctx.db.insert("contests", {
    key: options.key,
    name: options.name ?? options.key,
    authorProfileIds: [],
    curatorProfileIds: [],
    testerProfileIds: [],
    spectatorProfileIds: [],
    testerSeeScoreboard: false,
    testerSeeSubmissions: false,
    description: "",
    startTime: options.startTime ?? now - 3_600_000,
    endTime: options.endTime ?? now + 3_600_000,
    isVisible: options.isVisible ?? true,
    isRated: false,
    viewContestScoreboardProfileIds: [],
    viewContestSubmissionsProfileIds: [],
    scoreboardVisibility: "V",
    useClarifications: true,
    rateAll: false,
    rateExcludeProfileIds: [],
    isPrivate: false,
    privateContestantProfileIds: [],
    hideProblemTags: options.hideProblemTags ?? false,
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
    labelScheme: options.labelScheme ?? "letters",
    customLabels: [],
    pointsPrecision: 2,
    freezeMinutes: 0,
    blindDuringFreeze: false,
  });
}

export async function seedContestProblem(
  ctx: MutationCtx,
  options: {
    contestId: Id<"contests">;
    problemId: Id<"problems">;
    order: number;
    points?: number;
  },
): Promise<Id<"contestProblems">> {
  return await ctx.db.insert("contestProblems", {
    contestId: options.contestId,
    problemId: options.problemId,
    points: options.points ?? 100,
    partial: false,
    isPretested: false,
    order: options.order,
  });
}

export async function seedParticipation(
  ctx: MutationCtx,
  options: { contestId: Id<"contests">; profileId: Id<"profiles">; virtual?: number },
): Promise<Id<"contestParticipations">> {
  return await ctx.db.insert("contestParticipations", {
    contestId: options.contestId,
    profileId: options.profileId,
    realStart: Date.now() - 600_000,
    score: 0,
    cumtime: 0,
    isDisqualified: false,
    tiebreaker: 0,
    virtual: options.virtual ?? 0,
    formatData: {},
  });
}
