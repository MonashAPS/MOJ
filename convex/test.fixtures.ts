/**
 * The rows the Convex function tests are built from.
 *
 * `<table>Row(overrides)` returns a complete row with every schema field filled
 * in, and `insert<Table>(target, overrides)` writes one and hands back its id.
 * A target is either a `MutationCtx` — inside `t.run` or a mutation under test —
 * or the `setupTest()` harness itself.
 *
 * The filename carries two dots on purpose: Convex's bundler skips any file
 * under `convex/` whose basename has more than one, so nothing in here is ever
 * pushed to a deployment.
 */

import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { sha256Hex } from "./lib/hash";
import { insertProfileAggregates } from "./rankings";
import { judgeKey, type T } from "./test.setup";

export const MINUTE = 60_000;

export const HOUR = 3_600_000;

type Row<Table extends TableNames> = WithoutSystemFields<Doc<Table>>;

/** Any subset of a row's own fields. */
export type Overrides<Table extends TableNames> = Partial<Row<Table>>;

/** Where a row goes: a mutation context, or the harness that opens one. */
export type Target = MutationCtx | T;

async function write<Output>(target: Target, fn: (ctx: MutationCtx) => Promise<Output>): Promise<Output> {
  return "db" in target ? await fn(target) : await target.run(fn);
}

let profileCount = 0;

let judgeCount = 0;

/** The name an unnamed profile gets, unique within the test file. */
function nextUsername(): string {
  profileCount += 1;

  return `user${profileCount}`;
}

/** The name an unnamed judge gets, unique within the test file. */
function nextJudgeName(): string {
  judgeCount += 1;

  return `judge${judgeCount}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** The identity `t.withIdentity` wants for the profile of this username. */
type TestIdentity = {
  subject: string;
  issuer: string;
};

export function identityOf(username: string): TestIdentity {
  return { subject: `user_${username}`, issuer: "https://test" };
}

/** The harness, signed in as the profile of this username. */
export function asUser(t: T, username: string): ReturnType<T["withIdentity"]> {
  return t.withIdentity(identityOf(username));
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

export function profileRow(overrides: Overrides<"profiles"> = {}): Row<"profiles"> {
  const username = overrides.username ?? nextUsername();

  return {
    userId: identityOf(username).subject,
    about: "",
    timezone: "Australia/Melbourne",
    points: 0,
    performancePoints: 0,
    problemCount: 0,
    displayRank: "user",
    mute: false,
    isUnlisted: false,
    isBannedFromProblemVoting: false,
    mathEngine: "katex",
    siteTheme: "auto",
    editorTheme: "auto",
    notes: "",
    isStaff: false,
    isSuperuser: false,
    isActive: true,
    permissions: [],
    groups: [],
    joinDate: Date.now(),
    ...overrides,
    username,
  };
}

export function languageRow(overrides: Overrides<"languages"> = {}): Row<"languages"> {
  const key = overrides.key ?? "PY3";

  return {
    name: key,
    shortName: key.toLowerCase(),
    commonName: key,
    editorMode: "python",
    shikiLang: "python",
    template: "",
    info: "",
    description: "",
    extension: "py",
    ...overrides,
    key,
  };
}

export function problemGroupRow(overrides: Overrides<"problemGroups"> = {}): Row<"problemGroups"> {
  const name = overrides.name ?? "uncategorized";

  return { fullName: capitalize(name), ...overrides, name };
}

export function problemTypeRow(overrides: Overrides<"problemTypes"> = {}): Row<"problemTypes"> {
  const name = overrides.name ?? "uncategorized";

  return { fullName: capitalize(name), ...overrides, name };
}

export function problemRow(
  overrides: Overrides<"problems"> & { groupId: Id<"problemGroups"> },
): Row<"problems"> {
  const code = overrides.code ?? "aplusb";

  return {
    name: code.toUpperCase(),
    description: `Statement for ${code}.`,
    authorProfileIds: [],
    curatorProfileIds: [],
    testerProfileIds: [],
    typeIds: [],
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
    code,
  };
}

export function submissionRow(
  overrides: Overrides<"submissions"> & {
    profileId: Id<"profiles">;
    problemId: Id<"problems">;
    languageId: Id<"languages">;
  },
): Row<"submissions"> {
  return {
    date: Date.now(),
    status: "D",
    currentTestcase: 0,
    batch: false,
    casePoints: 0,
    caseTotal: 1,
    isPretested: false,
    isArchived: false,
    priority: 1,
    retryCount: 0,
    ...overrides,
  };
}

export function organizationRow(overrides: Overrides<"organizations"> = {}): Row<"organizations"> {
  const slug = overrides.slug ?? "maps";

  return {
    name: slug,
    shortName: slug.slice(0, 20),
    about: "",
    adminProfileIds: [],
    isOpen: true,
    classRequired: false,
    memberCount: 0,
    ...overrides,
    slug,
  };
}

export function membershipRow(
  overrides: Overrides<"organizationMemberships"> & {
    organizationId: Id<"organizations">;
    profileId: Id<"profiles">;
  },
): Row<"organizationMemberships"> {
  return { order: 0, ...overrides };
}

export function contestRow(overrides: Overrides<"contests"> = {}): Row<"contests"> {
  const key = overrides.key ?? "test";
  const startTime = overrides.startTime ?? Date.now() - HOUR;

  return {
    name: key.toUpperCase(),
    authorProfileIds: [],
    curatorProfileIds: [],
    testerProfileIds: [],
    spectatorProfileIds: [],
    testerSeeScoreboard: false,
    testerSeeSubmissions: false,
    spectatorSeeScoreboard: true,
    spectatorSeeProblemsEarly: false,
    description: "",
    endTime: startTime + 2 * HOUR,
    isVisible: true,
    schedule: { kind: "together" },
    entry: { kind: "open" },
    labels: { kind: "letters" },
    alwaysAdmitProfileIds: [],
    viewContestSubmissionsProfileIds: [],
    scoreboard: { audiences: ["everyone"], from: "start" },
    useClarifications: true,
    hideProblemTags: false,
    hideProblemAuthors: false,
    runPretestsOnly: false,
    tagIds: [],
    userCount: 0,
    bannedProfileIds: [],
    formatName: "default",
    formatConfig: null,
    pointsPrecision: 3,
    ...overrides,
    key,
    startTime,
    isOpenEntry: (overrides.entry?.kind ?? "open") === "open",
  };
}

export function contestProblemRow(
  overrides: Overrides<"contestProblems"> & {
    contestId: Id<"contests">;
    problemId: Id<"problems">;
  },
): Row<"contestProblems"> {
  return { points: 100, partial: false, isPretested: false, order: 1, ...overrides };
}

export function participationRow(
  overrides: Overrides<"contestParticipations"> & {
    contestId: Id<"contests">;
    profileId: Id<"profiles">;
  },
): Row<"contestParticipations"> {
  return {
    realStart: Date.now(),
    score: 0,
    cumtime: 0,
    isDisqualified: false,
    tiebreaker: 0,
    virtual: 0,
    formatData: {},
    ...overrides,
  };
}

export function judgeRow(overrides: Overrides<"judges"> & { authKeyHash: string }): Row<"judges"> {
  const name = overrides.name ?? nextJudgeName();

  return {
    isBlocked: false,
    isDisabled: false,
    tier: 0,
    online: true,
    description: "",
    runtimeKeys: ["PY3"],
    lastSeen: Date.now(),
    startTime: Date.now(),
    ...overrides,
    name,
  };
}

export function blogPostRow(overrides: Overrides<"blogPosts"> = {}): Row<"blogPosts"> {
  const title = overrides.title ?? "Announcement";

  return {
    authorProfileIds: [],
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    visible: true,
    sticky: false,
    publishOn: Date.now() - 1000,
    content: `Body of ${title}.`,
    summary: "",
    ...overrides,
    title,
  };
}

export function siteSettingsRow(overrides: Overrides<"siteSettings"> = {}): Row<"siteSettings"> {
  return {
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
    singleton: "site",
  };
}

/* -------------------------------------------------------------------------- */
/* Inserts                                                                    */
/* -------------------------------------------------------------------------- */

export async function insertProfile(
  target: Target,
  overrides: Overrides<"profiles"> = {},
): Promise<Id<"profiles">> {
  return await write(target, async (ctx) => {
    const profileId = await ctx.db.insert("profiles", profileRow(overrides));
    const profile = await ctx.db.get(profileId);

    if (profile) await insertProfileAggregates(ctx, profile);

    return profileId;
  });
}

export async function insertLanguage(
  target: Target,
  overrides: Overrides<"languages"> = {},
): Promise<Id<"languages">> {
  return await write(target, async (ctx) => ctx.db.insert("languages", languageRow(overrides)));
}

export async function insertProblemGroup(
  target: Target,
  overrides: Overrides<"problemGroups"> = {},
): Promise<Id<"problemGroups">> {
  return await write(target, async (ctx) => ctx.db.insert("problemGroups", problemGroupRow(overrides)));
}

export async function insertProblemType(
  target: Target,
  overrides: Overrides<"problemTypes"> = {},
): Promise<Id<"problemTypes">> {
  return await write(target, async (ctx) => ctx.db.insert("problemTypes", problemTypeRow(overrides)));
}

/** The group is whichever one already exists, so a test only names one when it matters. */
export async function insertProblem(
  target: Target,
  overrides: Overrides<"problems"> = {},
): Promise<Id<"problems">> {
  return await write(target, async (ctx) => {
    const groupId =
      overrides.groupId ??
      (await ctx.db.query("problemGroups").first())?._id ??
      (await ctx.db.insert("problemGroups", problemGroupRow()));

    return await ctx.db.insert("problems", problemRow({ ...overrides, groupId }));
  });
}

/** Writes the source row alongside the submission, as `submissions.submit` does. */
export async function insertSubmission(
  target: Target,
  overrides: Overrides<"submissions"> & {
    profileId: Id<"profiles">;
    problemId: Id<"problems">;
    languageId: Id<"languages">;
    source?: string;
  },
): Promise<Id<"submissions">> {
  const { source, ...fields } = overrides;

  return await write(target, async (ctx) => {
    const submissionId = await ctx.db.insert("submissions", submissionRow(fields));
    await ctx.db.insert("submissionSources", { submissionId, source: source ?? "print(1)" });

    return submissionId;
  });
}

export async function insertOrganization(
  target: Target,
  overrides: Overrides<"organizations"> = {},
): Promise<Id<"organizations">> {
  return await write(target, async (ctx) => ctx.db.insert("organizations", organizationRow(overrides)));
}

export async function insertMembership(
  target: Target,
  overrides: Overrides<"organizationMemberships"> & {
    organizationId: Id<"organizations">;
    profileId: Id<"profiles">;
  },
): Promise<Id<"organizationMemberships">> {
  return await write(target, async (ctx) =>
    ctx.db.insert("organizationMemberships", membershipRow(overrides)),
  );
}

export async function insertContest(
  target: Target,
  overrides: Overrides<"contests"> = {},
): Promise<Id<"contests">> {
  return await write(target, async (ctx) => ctx.db.insert("contests", contestRow(overrides)));
}

export async function insertContestProblem(
  target: Target,
  overrides: Overrides<"contestProblems"> & {
    contestId: Id<"contests">;
    problemId: Id<"problems">;
  },
): Promise<Id<"contestProblems">> {
  return await write(target, async (ctx) => ctx.db.insert("contestProblems", contestProblemRow(overrides)));
}

export async function insertParticipation(
  target: Target,
  overrides: Overrides<"contestParticipations"> & {
    contestId: Id<"contests">;
    profileId: Id<"profiles">;
  },
): Promise<Id<"contestParticipations">> {
  return await write(target, async (ctx) =>
    ctx.db.insert("contestParticipations", participationRow(overrides)),
  );
}

/** `key` is what `judgeClient` sends; only its sha256 reaches the row. */
export async function insertJudge(
  target: Target,
  overrides: Overrides<"judges"> & { key?: string } = {},
): Promise<Id<"judges">> {
  const { key, ...fields } = overrides;
  const name = fields.name ?? nextJudgeName();
  const authKeyHash = await sha256Hex(key ?? judgeKey(name));

  return await write(target, async (ctx) =>
    ctx.db.insert("judges", judgeRow({ ...fields, name, authKeyHash })),
  );
}

export async function insertBlogPost(
  target: Target,
  overrides: Overrides<"blogPosts"> = {},
): Promise<Id<"blogPosts">> {
  return await write(target, async (ctx) => ctx.db.insert("blogPosts", blogPostRow(overrides)));
}

export async function insertSiteSettings(
  target: Target,
  overrides: Overrides<"siteSettings"> = {},
): Promise<Id<"siteSettings">> {
  return await write(target, async (ctx) => ctx.db.insert("siteSettings", siteSettingsRow(overrides)));
}

/** The group, the two types and the two languages the problem tests share. */
export async function insertTaxonomy(target: Target): Promise<{
  groupId: Id<"problemGroups">;
  typeId: Id<"problemTypes">;
  graphsTypeId: Id<"problemTypes">;
  languageId: Id<"languages">;
  cppId: Id<"languages">;
}> {
  return await write(target, async (ctx) => ({
    groupId: await insertProblemGroup(ctx),
    typeId: await insertProblemType(ctx),
    graphsTypeId: await insertProblemType(ctx, { name: "graphs", fullName: "Graphs" }),
    languageId: await insertLanguage(ctx, {
      name: "Python 3",
      shortName: "PY3",
      commonName: "Python",
      template: "# your code here\n",
    }),
    cppId: await insertLanguage(ctx, {
      key: "CPP20",
      name: "C++20",
      shortName: "C++20",
      commonName: "C++",
      editorMode: "c_cpp",
      shikiLang: "cpp",
      template: "int main() {}\n",
      extension: "cpp",
    }),
  }));
}
