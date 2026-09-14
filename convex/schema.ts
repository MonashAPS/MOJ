import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const displayRank = v.union(v.literal("user"), v.literal("setter"), v.literal("admin"));
export const siteTheme = v.union(v.literal("auto"), v.literal("light"), v.literal("dark"));
/** The theme a visitor with no stored preference gets (SPEC section 24). */
export const themeDefault = v.union(v.literal("system"), v.literal("light"), v.literal("dark"));
export const submissionStatus = v.union(
  v.literal("QU"),
  v.literal("P"),
  v.literal("G"),
  v.literal("D"),
  v.literal("IE"),
  v.literal("CE"),
  v.literal("AB"),
);
export const submissionResult = v.union(
  v.literal("AC"),
  v.literal("WA"),
  v.literal("TLE"),
  v.literal("MLE"),
  v.literal("OLE"),
  v.literal("IR"),
  v.literal("RTE"),
  v.literal("CE"),
  v.literal("IE"),
  v.literal("SC"),
  v.literal("AB"),
);
export const testCaseType = v.union(v.literal("C"), v.literal("S"), v.literal("E"));
export const sourceVisibility = v.union(v.literal("A"), v.literal("S"), v.literal("O"), v.literal("F"));
export const globalSourceVisibility = v.union(
  v.literal("all"),
  v.literal("all-solved"),
  v.literal("only-own"),
);
export const scoreboardVisibility = v.union(v.literal("V"), v.literal("C"), v.literal("P"), v.literal("H"));
export const labelScheme = v.union(v.literal("letters"), v.literal("numbers"), v.literal("custom"));
export const requestState = v.union(v.literal("P"), v.literal("A"), v.literal("R"));
export const commentTarget = v.union(
  v.literal("problem"),
  v.literal("contest"),
  v.literal("blog"),
  v.literal("solution"),
);
export const jobStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
);
export const uploadKind = v.union(
  v.literal("statement-image"),
  v.literal("export"),
  v.literal("pdf"),
  v.literal("logo"),
);

export default defineSchema({
  profiles: defineTable({
    userId: v.string(),
    username: v.string(),
    legacyUserId: v.optional(v.number()),
    about: v.string(),
    timezone: v.string(),
    languageId: v.optional(v.id("languages")),
    points: v.number(),
    performancePoints: v.number(),
    problemCount: v.number(),
    rating: v.optional(v.number()),
    displayRank,
    mute: v.boolean(),
    isUnlisted: v.boolean(),
    isBannedFromProblemVoting: v.boolean(),
    currentParticipationId: v.optional(v.id("contestParticipations")),
    mathEngine: v.string(),
    siteTheme,
    editorTheme: v.string(),
    lastAccess: v.optional(v.number()),
    ip: v.optional(v.string()),
    notes: v.string(),
    legacyApiTokenHash: v.optional(v.string()),
    dataLastDownloaded: v.optional(v.number()),
    usernameDisplayOverride: v.optional(v.string()),
    isStaff: v.boolean(),
    isSuperuser: v.boolean(),
    permissions: v.array(v.string()),
    groups: v.array(v.string()),
    joinDate: v.number(),
    isActive: v.optional(v.boolean()),
    legacyId: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_username", ["username"])
    .index("by_legacyUserId", ["legacyUserId"])
    .index("by_legacyId", ["legacyId"])
    .index("by_listed_pp", ["isUnlisted", "performancePoints"])
    .index("by_listed_points", ["isUnlisted", "points"])
    .index("by_listed_rating", ["isUnlisted", "rating"])
    .index("by_listed_problemCount", ["isUnlisted", "problemCount"])
    .searchIndex("search_username", {
      searchField: "username",
      filterFields: ["isUnlisted"],
    }),

  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    shortName: v.string(),
    about: v.string(),
    adminProfileIds: v.array(v.id("profiles")),
    isOpen: v.boolean(),
    slots: v.optional(v.number()),
    accessCode: v.optional(v.string()),
    logoOverrideImage: v.optional(v.string()),
    classRequired: v.boolean(),
    memberCount: v.number(),
    legacyId: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_legacyId", ["legacyId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["isOpen"],
    }),

  organizationMemberships: defineTable({
    organizationId: v.id("organizations"),
    profileId: v.id("profiles"),
    order: v.number(),
    legacyId: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_profile", ["profileId"])
    .index("by_legacyId", ["legacyId"]),

  classes: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    accessCode: v.optional(v.string()),
    adminProfileIds: v.array(v.id("profiles")),
    memberProfileIds: v.array(v.id("profiles")),
    legacyId: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_slug", ["organizationId", "slug"])
    .index("by_legacyId", ["legacyId"]),

  organizationRequests: defineTable({
    profileId: v.id("profiles"),
    organizationId: v.id("organizations"),
    classId: v.optional(v.id("classes")),
    time: v.number(),
    state: requestState,
    reason: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_organization_state", ["organizationId", "state"])
    .index("by_profile", ["profileId"])
    .index("by_profile_state", ["profileId", "state"])
    .index("by_legacyId", ["legacyId"]),

  problemTypes: defineTable({
    name: v.string(),
    fullName: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_legacyId", ["legacyId"]),

  problemGroups: defineTable({
    name: v.string(),
    fullName: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_legacyId", ["legacyId"]),

  licenses: defineTable({
    key: v.string(),
    link: v.string(),
    name: v.string(),
    display: v.string(),
    icon: v.string(),
    text: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_legacyId", ["legacyId"]),

  problems: defineTable({
    code: v.string(),
    name: v.string(),
    description: v.string(),
    authorProfileIds: v.array(v.id("profiles")),
    curatorProfileIds: v.array(v.id("profiles")),
    testerProfileIds: v.array(v.id("profiles")),
    typeIds: v.array(v.id("problemTypes")),
    groupId: v.id("problemGroups"),
    timeLimit: v.number(),
    memoryLimit: v.number(),
    shortCircuit: v.boolean(),
    points: v.number(),
    partial: v.boolean(),
    allowedLanguageIds: v.array(v.id("languages")),
    isPublic: v.boolean(),
    isManuallyManaged: v.boolean(),
    date: v.number(),
    bannedProfileIds: v.array(v.id("profiles")),
    licenseId: v.optional(v.id("licenses")),
    ogImage: v.optional(v.string()),
    summary: v.optional(v.string()),
    userCount: v.number(),
    acRate: v.number(),
    isFullMarkup: v.boolean(),
    submissionSourceVisibility: sourceVisibility,
    organizationIds: v.array(v.id("organizations")),
    isOrganizationPrivate: v.boolean(),
    legacyId: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_legacyId", ["legacyId"])
    .index("by_public_date", ["isPublic", "date"])
    .index("by_public_points", ["isPublic", "points"])
    .index("by_group", ["groupId"])
    .searchIndex("search_name_desc", {
      searchField: "name",
      filterFields: ["isPublic", "isOrganizationPrivate"],
    })
    .searchIndex("search_description", {
      searchField: "description",
      filterFields: ["isPublic", "isOrganizationPrivate"],
    }),

  /**
   * The keys a SEB-locked contest accepts. Secret, and deliberately in its own
   * table so that no query returning a contest can leak them.
   *
   * A Config Key is derived from the SEB settings alone, so one value covers
   * every platform and every SEB release. A Browser Exam Key additionally folds
   * in the client's code signature, so it differs per build and the list has to
   * be maintained by hand; it is there for operators who want to pin versions.
   */
  contestSebKeys: defineTable({
    contestId: v.id("contests"),
    configKeys: v.array(v.string()),
    browserExamKeys: v.array(v.string()),
    /**
     * The Config Key of the configuration MOJ generates and serves for this
     * contest, and the origin it was generated against. The file itself is not
     * stored: it is a pure function of those two, so regenerating it byte for
     * byte is cheaper than keeping a copy that could drift from the key.
     */
    generatedKey: v.optional(v.string()),
    generatedOrigin: v.optional(v.string()),
  }).index("by_contest", ["contestId"]),

  /**
   * When a viewer last proved, on a real HTTP request, that they were in Safe
   * Exam Browser for a given contest.
   *
   * Its own table rather than a field on `contestParticipations` because it is
   * rewritten as people browse, and a write to a participation invalidates
   * every query watching one — the scoreboard among them.
   */
  sebVerifications: defineTable({
    profileId: v.id("profiles"),
    contestId: v.id("contests"),
    verifiedUntil: v.number(),
  }).index("by_profile_contest", ["profileId", "contestId"]),

  problemTranslations: defineTable({
    problemId: v.id("problems"),
    language: v.string(),
    name: v.string(),
    description: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_problem_language", ["problemId", "language"])
    .index("by_legacyId", ["legacyId"]),

  problemClarifications: defineTable({
    problemId: v.id("problems"),
    description: v.string(),
    date: v.number(),
    legacyId: v.optional(v.number()),
  })
    .index("by_problem", ["problemId"])
    .index("by_legacyId", ["legacyId"]),

  languageLimits: defineTable({
    problemId: v.id("problems"),
    languageId: v.id("languages"),
    timeLimit: v.number(),
    memoryLimit: v.number(),
    legacyId: v.optional(v.number()),
  })
    .index("by_problem", ["problemId"])
    .index("by_legacyId", ["legacyId"]),

  solutions: defineTable({
    problemId: v.id("problems"),
    isPublic: v.boolean(),
    publishOn: v.number(),
    authorProfileIds: v.array(v.id("profiles")),
    content: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_problem", ["problemId"])
    .index("by_legacyId", ["legacyId"]),

  problemPointsVotes: defineTable({
    points: v.number(),
    voterProfileId: v.id("profiles"),
    problemId: v.id("problems"),
    voteTime: v.number(),
    note: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_problem", ["problemId"])
    .index("by_voter_problem", ["voterProfileId", "problemId"])
    .index("by_legacyId", ["legacyId"]),

  problemData: defineTable({
    problemId: v.id("problems"),
    zipfile: v.optional(v.string()),
    zipfileStorageId: v.optional(v.id("_storage")),
    generator: v.optional(v.string()),
    generatorStorageId: v.optional(v.id("_storage")),
    outputPrefix: v.optional(v.number()),
    outputLimit: v.optional(v.number()),
    feedback: v.string(),
    checker: v.optional(v.string()),
    checkerArgs: v.optional(v.string()),
    unicode: v.boolean(),
    nobigmath: v.boolean(),
    legacyId: v.optional(v.number()),
  })
    .index("by_problem", ["problemId"])
    .index("by_legacyId", ["legacyId"]),

  /**
   * Site-owned grading data: one zip archive per problem, published by a
   * problem repository or uploaded in the test data editor, fetched by judges
   * over `GET /judge/data`. The archive's root holds `init.yml` and everything
   * it references; statements and metadata travel through the problems API
   * instead.
   */
  problemTestData: defineTable({
    problemId: v.id("problems"),
    storageId: v.id("_storage"),
    /** sha256 of the archive bytes, lowercase hex, as the publisher reported it. */
    hash: v.string(),
    size: v.number(),
    fileCount: v.number(),
    uploadedByProfileId: v.optional(v.id("profiles")),
    uploadedAt: v.number(),
  }).index("by_problem", ["problemId"]),

  problemTestCases: defineTable({
    problemId: v.id("problems"),
    order: v.number(),
    type: testCaseType,
    inputFile: v.string(),
    outputFile: v.string(),
    generatorArgs: v.string(),
    // DMOJ's ProblemTestCase.points is nullable: a case inside a batch carries
    // no points of its own.
    points: v.union(v.number(), v.null()),
    isPretest: v.boolean(),
    outputPrefix: v.optional(v.number()),
    outputLimit: v.optional(v.number()),
    checker: v.optional(v.string()),
    checkerArgs: v.optional(v.string()),
    batchDependencies: v.array(v.number()),
    legacyId: v.optional(v.number()),
  })
    .index("by_problem_order", ["problemId", "order"])
    .index("by_legacyId", ["legacyId"]),

  languages: defineTable({
    key: v.string(),
    name: v.string(),
    shortName: v.string(),
    commonName: v.string(),
    editorMode: v.string(),
    shikiLang: v.string(),
    template: v.string(),
    info: v.string(),
    description: v.string(),
    extension: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_legacyId", ["legacyId"]),

  judges: defineTable({
    name: v.string(),
    authKeyHash: v.string(),
    isBlocked: v.boolean(),
    isDisabled: v.boolean(),
    tier: v.number(),
    online: v.boolean(),
    startTime: v.optional(v.number()),
    ping: v.optional(v.number()),
    load: v.optional(v.number()),
    description: v.string(),
    lastIp: v.optional(v.string()),
    problemCodes: v.array(v.string()),
    runtimeKeys: v.array(v.string()),
    lastSeen: v.optional(v.number()),
    currentSubmissionId: v.optional(v.id("submissions")),
    createdAt: v.optional(v.number()),
    disconnectRequestedAt: v.optional(v.number()),
    disconnectForce: v.optional(v.boolean()),
    legacyId: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_online_tier", ["online", "tier"])
    .index("by_legacyId", ["legacyId"]),

  runtimeVersions: defineTable({
    languageId: v.id("languages"),
    judgeId: v.id("judges"),
    name: v.string(),
    version: v.string(),
    priority: v.number(),
    legacyId: v.optional(v.number()),
  })
    .index("by_judge", ["judgeId"])
    .index("by_language", ["languageId"])
    .index("by_legacyId", ["legacyId"]),

  submissions: defineTable({
    profileId: v.id("profiles"),
    problemId: v.id("problems"),
    date: v.number(),
    time: v.optional(v.number()),
    memory: v.optional(v.number()),
    points: v.optional(v.number()),
    languageId: v.id("languages"),
    status: submissionStatus,
    result: v.optional(submissionResult),
    error: v.optional(v.string()),
    currentTestcase: v.number(),
    batch: v.boolean(),
    casePoints: v.number(),
    caseTotal: v.number(),
    judgedOnJudgeId: v.optional(v.id("judges")),
    judgedDate: v.optional(v.number()),
    rejudgedDate: v.optional(v.number()),
    isPretested: v.boolean(),
    contestId: v.optional(v.id("contests")),
    contestProblemId: v.optional(v.id("contestProblems")),
    participationId: v.optional(v.id("contestParticipations")),
    contestPoints: v.optional(v.number()),
    isContestPretest: v.optional(v.boolean()),
    lockedAfter: v.optional(v.number()),
    isArchived: v.boolean(),
    priority: v.number(),
    judgePin: v.optional(v.id("judges")),
    claimedByJudgeId: v.optional(v.id("judges")),
    claimedAt: v.optional(v.number()),
    retryCount: v.number(),
    // Set by submissions.abort while the judge already holds the submission;
    // the judge polls GET /judge/abort and clears it by terminating.
    abortRequested: v.optional(v.boolean()),
    // The judge's batch counter lives on the submission because the judge API
    // is stateless: batch-begin increments it and batch-end leaves the batch.
    currentBatch: v.optional(v.number()),
    inBatch: v.optional(v.boolean()),
    legacyId: v.optional(v.number()),
  })
    .index("by_date", ["date"])
    .index("by_profile_date", ["profileId", "date"])
    .index("by_problem_date", ["problemId", "date"])
    .index("by_contest_date", ["contestId", "date"])
    .index("by_profile_problem", ["profileId", "problemId"])
    .index("by_problem_profile", ["problemId", "profileId"])
    .index("by_status_priority", ["status", "priority", "date"])
    .index("by_participation", ["participationId"])
    .index("by_problem_status", ["problemId", "status"])
    .index("by_profile_status", ["profileId", "status"])
    .index("by_language_date", ["languageId", "date"])
    .index("by_legacyId", ["legacyId"]),

  submissionSources: defineTable({
    submissionId: v.id("submissions"),
    source: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_submission", ["submissionId"])
    .index("by_legacyId", ["legacyId"]),

  submissionTestCases: defineTable({
    submissionId: v.id("submissions"),
    case: v.number(),
    status: v.string(),
    time: v.number(),
    memory: v.number(),
    points: v.number(),
    total: v.number(),
    batch: v.optional(v.number()),
    feedback: v.string(),
    extendedFeedback: v.string(),
    output: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_submission_case", ["submissionId", "case"])
    .index("by_legacyId", ["legacyId"]),

  contests: defineTable({
    key: v.string(),
    name: v.string(),
    authorProfileIds: v.array(v.id("profiles")),
    curatorProfileIds: v.array(v.id("profiles")),
    testerProfileIds: v.array(v.id("profiles")),
    spectatorProfileIds: v.array(v.id("profiles")),
    testerSeeScoreboard: v.boolean(),
    testerSeeSubmissions: v.boolean(),
    description: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    timeLimit: v.optional(v.number()),
    isVisible: v.boolean(),
    isRated: v.boolean(),
    viewContestScoreboardProfileIds: v.array(v.id("profiles")),
    viewContestSubmissionsProfileIds: v.array(v.id("profiles")),
    scoreboardVisibility,
    useClarifications: v.boolean(),
    ratingFloor: v.optional(v.number()),
    ratingCeiling: v.optional(v.number()),
    performanceCeilingOverride: v.optional(v.number()),
    rateAll: v.boolean(),
    rateExcludeProfileIds: v.array(v.id("profiles")),
    isPrivate: v.boolean(),
    privateContestantProfileIds: v.array(v.id("profiles")),
    hideProblemTags: v.boolean(),
    hideProblemAuthors: v.boolean(),
    runPretestsOnly: v.boolean(),
    showShortDisplay: v.boolean(),
    isOrganizationPrivate: v.boolean(),
    organizationIds: v.array(v.id("organizations")),
    limitJoinOrganizations: v.boolean(),
    joinOrganizationIds: v.array(v.id("organizations")),
    classIds: v.array(v.id("classes")),
    ogImage: v.optional(v.string()),
    logoOverrideImage: v.optional(v.string()),
    tagIds: v.array(v.id("contestTags")),
    userCount: v.number(),
    summary: v.optional(v.string()),
    accessCode: v.optional(v.string()),
    bannedProfileIds: v.array(v.id("profiles")),
    formatName: v.string(),
    formatConfig: v.any(),
    labelScheme,
    customLabels: v.array(v.string()),
    lockedAfter: v.optional(v.number()),
    pointsPrecision: v.number(),
    freezeMinutes: v.number(),
    blindDuringFreeze: v.boolean(),
    revealedUntilRank: v.optional(v.number()),
    isUnfrozen: v.optional(v.boolean()),
    freezeRevealed: v.optional(v.boolean()),
    revealState: v.optional(v.any()),
    // Safe Exam Browser. The keys themselves live in `contestSebKeys` rather
    // than here: anyone holding a Config Key can compute the header for any URL
    // and walk straight past the check, and this row is returned whole by
    // `viewer.current` and the contest pages.
    sebRequired: v.optional(v.boolean()),
    sebLaunchUrl: v.optional(v.string()),
    legacyId: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_visible_start", ["isVisible", "startTime"])
    .index("by_end", ["endTime"])
    .index("by_legacyId", ["legacyId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["isVisible", "isPrivate", "isOrganizationPrivate"],
    }),

  contestProblems: defineTable({
    contestId: v.id("contests"),
    problemId: v.id("problems"),
    points: v.number(),
    partial: v.boolean(),
    isPretested: v.boolean(),
    order: v.number(),
    outputPrefixOverride: v.optional(v.number()),
    maxSubmissions: v.optional(v.number()),
    legacyId: v.optional(v.number()),
  })
    .index("by_contest_order", ["contestId", "order"])
    .index("by_problem", ["problemId"])
    .index("by_legacyId", ["legacyId"]),

  contestParticipations: defineTable({
    contestId: v.id("contests"),
    profileId: v.id("profiles"),
    realStart: v.number(),
    score: v.number(),
    cumtime: v.number(),
    isDisqualified: v.boolean(),
    tiebreaker: v.number(),
    virtual: v.number(),
    formatData: v.any(),
    legacyId: v.optional(v.number()),
  })
    .index("by_contest_virtual_score", ["contestId", "virtual", "score"])
    .index("by_profile_contest", ["profileId", "contestId"])
    .index("by_contest_profile", ["contestId", "profileId"])
    .index("by_legacyId", ["legacyId"]),

  ratings: defineTable({
    profileId: v.id("profiles"),
    contestId: v.id("contests"),
    participationId: v.id("contestParticipations"),
    rank: v.number(),
    rating: v.number(),
    mean: v.number(),
    performance: v.number(),
    lastRated: v.number(),
    legacyId: v.optional(v.number()),
  })
    .index("by_profile", ["profileId"])
    .index("by_contest", ["contestId"])
    .index("by_legacyId", ["legacyId"]),

  contestTags: defineTable({
    name: v.string(),
    color: v.string(),
    description: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_legacyId", ["legacyId"]),

  contestMoss: defineTable({
    contestId: v.id("contests"),
    problemId: v.id("problems"),
    languageKey: v.string(),
    submissionCount: v.number(),
    url: v.optional(v.string()),
    legacyId: v.optional(v.number()),
  })
    .index("by_contest", ["contestId"])
    .index("by_legacyId", ["legacyId"]),

  comments: defineTable({
    targetType: commentTarget,
    targetKey: v.string(),
    parentId: v.optional(v.id("comments")),
    authorProfileId: v.id("profiles"),
    time: v.number(),
    score: v.number(),
    body: v.string(),
    hidden: v.boolean(),
    revisions: v.number(),
    legacyId: v.optional(v.number()),
  })
    .index("by_target_time", ["targetType", "targetKey", "time"])
    .index("by_parent", ["parentId"])
    .index("by_author", ["authorProfileId"])
    .index("by_legacyId", ["legacyId"]),

  commentVotes: defineTable({
    voterProfileId: v.id("profiles"),
    commentId: v.id("comments"),
    score: v.number(),
    legacyId: v.optional(v.number()),
  })
    .index("by_voter_comment", ["voterProfileId", "commentId"])
    .index("by_comment", ["commentId"])
    .index("by_legacyId", ["legacyId"]),

  commentLocks: defineTable({
    targetType: commentTarget,
    targetKey: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_target", ["targetType", "targetKey"])
    .index("by_legacyId", ["legacyId"]),

  blogPosts: defineTable({
    title: v.string(),
    authorProfileIds: v.array(v.id("profiles")),
    slug: v.string(),
    visible: v.boolean(),
    sticky: v.boolean(),
    publishOn: v.number(),
    content: v.string(),
    summary: v.string(),
    ogImage: v.optional(v.string()),
    legacyId: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_visible_publishOn", ["visible", "publishOn"])
    .index("by_visible_sticky_publishOn", ["visible", "sticky", "publishOn"])
    .index("by_legacyId", ["legacyId"]),

  tickets: defineTable({
    title: v.string(),
    profileId: v.id("profiles"),
    time: v.number(),
    assigneeProfileIds: v.array(v.id("profiles")),
    notes: v.string(),
    linkedType: v.optional(v.string()),
    linkedKey: v.optional(v.string()),
    isOpen: v.boolean(),
    legacyId: v.optional(v.number()),
  })
    .index("by_open_time", ["isOpen", "time"])
    .index("by_linked", ["linkedType", "linkedKey"])
    .index("by_profile", ["profileId"])
    .index("by_time", ["time"])
    .index("by_legacyId", ["legacyId"]),

  ticketMessages: defineTable({
    ticketId: v.id("tickets"),
    profileId: v.id("profiles"),
    body: v.string(),
    time: v.number(),
    legacyId: v.optional(v.number()),
  })
    .index("by_ticket_time", ["ticketId", "time"])
    .index("by_legacyId", ["legacyId"]),

  navigationBar: defineTable({
    order: v.number(),
    key: v.string(),
    label: v.string(),
    path: v.string(),
    regex: v.string(),
    parentId: v.optional(v.id("navigationBar")),
    legacyId: v.optional(v.number()),
  })
    .index("by_order", ["order"])
    .index("by_key", ["key"])
    .index("by_parent", ["parentId"])
    .index("by_legacyId", ["legacyId"]),

  miscConfig: defineTable({
    key: v.string(),
    value: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_legacyId", ["legacyId"]),

  flatPages: defineTable({
    url: v.string(),
    title: v.string(),
    content: v.string(),
    enableComments: v.optional(v.boolean()),
    legacyId: v.optional(v.number()),
  })
    .index("by_url", ["url"])
    .index("by_legacyId", ["legacyId"]),

  siteSettings: defineTable({
    singleton: v.literal("site"),
    siteName: v.string(),
    siteLongName: v.string(),
    siteAdminEmail: v.string(),
    registrationOpen: v.boolean(),
    defaultUserTimezone: v.string(),
    defaultUserLanguageKey: v.string(),
    problemsPerPage: v.number(),
    commentsPerPage: v.number(),
    submissionsPerPage: v.number(),
    userRankingsPerPage: v.number(),
    blogPostsPerPage: v.number(),
    ratingRatios: v.array(v.number()),
    requireStaffTwoFactor: v.boolean(),
    pdfEnabled: v.boolean(),
    mossApiKey: v.optional(v.string()),
    analytics: v.optional(v.string()),
    ticketsPerPage: v.optional(v.number()),
    enableComments: v.optional(v.boolean()),
    commentVoteHideThreshold: v.optional(v.number()),
    commentReplyTimeframeDays: v.optional(v.number()),
    commentMaxBodyLength: v.optional(v.number()),
    blogNewProblemCount: v.optional(v.number()),
    statsLanguageThreshold: v.optional(v.number()),
    submissionSourceVisibility: v.optional(globalSourceVisibility),
    submissionLimitPerMinute: v.optional(v.number()),
    maxSubmissionsPerProblem: v.optional(v.number()),
    ppStep: v.optional(v.number()),
    ppEntries: v.optional(v.number()),
    // Branding (SPEC section 24). All optional: an unset field falls back to
    // the token file, which stays the single source of the defaults.
    logoStorageId: v.optional(v.id("_storage")),
    faviconStorageId: v.optional(v.id("_storage")),
    accentColor: v.optional(v.string()),
    navColor: v.optional(v.string()),
    customCss: v.optional(v.string()),
    themeDefault: v.optional(themeDefault),
    /** Whether contests may be locked to Safe Exam Browser at all. Off leaves
     *  the feature out of the admin entirely. */
    sebEnabled: v.optional(v.boolean()),
  }).index("by_singleton", ["singleton"]),

  statsSnapshots: defineTable({
    key: v.string(),
    computedAt: v.number(),
    data: v.any(),
  }).index("by_key", ["key"]),

  revisions: defineTable({
    entityType: v.string(),
    entityId: v.string(),
    snapshot: v.any(),
    authorProfileId: v.optional(v.id("profiles")),
    reason: v.string(),
    createdAt: v.number(),
  }).index("by_entity", ["entityType", "entityId", "createdAt"]),

  jobs: defineTable({
    type: v.string(),
    status: jobStatus,
    progress: v.object({ done: v.number(), total: v.number(), stage: v.string() }),
    args: v.any(),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    createdByProfileId: v.optional(v.id("profiles")),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_type_createdAt", ["type", "createdAt"])
    .index("by_creator_type_createdAt", ["createdByProfileId", "type", "createdAt"]),

  scoreboardEvents: defineTable({
    key: v.string(),
    name: v.string(),
    contestIds: v.array(v.id("contests")),
    theme: v.string(),
    flagUrlTemplate: v.optional(v.string()),
    badgeOrganizationSlugs: v.array(v.string()),
    inPersonOrganizationSlug: v.optional(v.string()),
    freezeMinutes: v.number(),
    isPublic: v.boolean(),
    legacyId: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_legacyId", ["legacyId"]),

  uploads: defineTable({
    storageId: v.id("_storage"),
    uploaderProfileId: v.optional(v.id("profiles")),
    kind: uploadKind,
    name: v.string(),
    createdAt: v.number(),
    cacheKey: v.optional(v.string()),
  })
    .index("by_cacheKey", ["cacheKey"])
    .index("by_uploader", ["uploaderProfileId"]),

  pdfCache: defineTable({
    problemCode: v.string(),
    language: v.string(),
    storageId: v.id("_storage"),
    renderedAt: v.number(),
    sourceHash: v.string(),
  })
    .index("by_problem_language", ["problemCode", "language"])
    .index("by_sourceHash", ["sourceHash"]),

  apiKeys: defineTable({
    keyHash: v.string(),
    prefix: v.optional(v.string()),
    name: v.string(),
    profileId: v.id("profiles"),
    scopes: v.array(v.string()),
    enabled: v.boolean(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    legacyId: v.optional(v.number()),
  })
    .index("by_keyHash", ["keyHash"])
    .index("by_profile", ["profileId"])
    .index("by_legacyId", ["legacyId"]),
});
