/**
 * Thin wrappers over `@moj/core`'s contest formats (SPEC section 5), plus the
 * adapters that turn Convex documents into the plain rows `packages/core`
 * takes. Every contest module goes through these so a rule is only ever
 * written once.
 */

import {
  type ContestFormat,
  type ContestParticipationRow,
  type ContestProblemRow,
  type ContestRow,
  type ContestSubmissionRow,
  FormatConfigError,
  formatChoices,
  getContestLabelForProblem,
  getFormatOrDefault,
  type ProfileRow,
  type ScoringLine,
  type SubmissionTestCaseRow,
  UnknownContestFormatError,
} from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { query } from "../_generated/server";

export type AnyCtx = QueryCtx | MutationCtx;

/** `Contest.key`: DMOJ's slug field, lowercase letters and digits. */
export const CONTEST_KEY_PATTERN = /^[a-z0-9]+$/;

/* -------------------------------------------------------------------------- */
/* Row adapters                                                               */
/* -------------------------------------------------------------------------- */

export function toContestRow(contest: Doc<"contests">): ContestRow {
  return {
    id: contest._id,
    key: contest.key,
    name: contest.name,
    startTime: contest.startTime,
    endTime: contest.endTime,
    schedule: contest.schedule,
    isVisible: contest.isVisible,
    entry: contest.entry,
    joinLimit: contest.joinLimit,
    freeze: contest.freeze,
    rating: contest.rating,
    labels: contest.labels,
    authorProfileIds: contest.authorProfileIds,
    curatorProfileIds: contest.curatorProfileIds,
    testerProfileIds: contest.testerProfileIds,
    spectatorProfileIds: contest.spectatorProfileIds,
    testerSeeScoreboard: contest.testerSeeScoreboard,
    testerSeeSubmissions: contest.testerSeeSubmissions,
    spectatorSeeScoreboard: contest.spectatorSeeScoreboard,
    spectatorSeeProblemsEarly: contest.spectatorSeeProblemsEarly,
    alwaysAdmitProfileIds: contest.alwaysAdmitProfileIds,
    viewContestSubmissionsProfileIds: contest.viewContestSubmissionsProfileIds,
    bannedProfileIds: contest.bannedProfileIds,
    accessCode: contest.accessCode ?? null,
    scoreboard: contest.scoreboard,
    formatName: contest.formatName,
    formatConfig: contest.formatConfig,
    pointsPrecision: contest.pointsPrecision,
    runPretestsOnly: contest.runPretestsOnly,
    lockedAfter: contest.lockedAfter ?? null,
    publishProblemsAt: contest.publishProblemsAt,
    problemsPublishedAt: contest.problemsPublishedAt,
  };
}

export function toContestProblemRow(
  contestProblem: Doc<"contestProblems">,
  problemCode?: string,
): ContestProblemRow {
  return {
    id: contestProblem._id,
    contestId: contestProblem.contestId,
    problemId: contestProblem.problemId,
    problemCode,
    points: contestProblem.points,
    partial: contestProblem.partial,
    isPretested: contestProblem.isPretested,
    order: contestProblem.order,
    maxSubmissions: contestProblem.maxSubmissions ?? null,
  };
}

export function toParticipationRow(participation: Doc<"contestParticipations">): ContestParticipationRow {
  return {
    id: participation._id,
    contestId: participation.contestId,
    profileId: participation.profileId,
    realStart: participation.realStart,
    score: participation.score,
    cumtime: participation.cumtime,
    tiebreaker: participation.tiebreaker,
    isDisqualified: participation.isDisqualified,
    virtual: participation.virtual,
    formatData: participation.formatData ?? {},
  };
}

/**
 * A submission as DMOJ's `ContestSubmission` sees it. Submissions with no
 * `contestProblemId` never took part in a contest and are skipped by the
 * callers rather than shaped here.
 */
export function toContestSubmissionRow(
  submission: Doc<"submissions">,
  contestProblemId: Id<"contestProblems">,
  testCases?: readonly SubmissionTestCaseRow[],
): ContestSubmissionRow {
  return {
    id: submission._id,
    contestProblemId,
    participationId: submission.participationId ?? undefined,
    contestPoints: submission.contestPoints ?? 0,
    casePoints: submission.casePoints,
    caseTotal: submission.caseTotal,
    result: submission.result ?? null,
    status: submission.status,
    date: submission.date,
    isPretest: submission.isContestPretest ?? false,
    testCases,
  };
}

/**
 * The viewer as the pure rules see them, with the organisation and class
 * memberships `contestAccessCheck` needs. `null` is Django's `AnonymousUser`.
 */
export async function toViewerRow(ctx: AnyCtx, profile: Doc<"profiles"> | null): Promise<ProfileRow | null> {
  if (!profile) return null;

  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
    .collect();

  const organizationIds = memberships.map((row) => row.organizationId);

  const classIds: string[] = [];
  const adminOfOrganizationIds: string[] = [];

  for (const membership of memberships) {
    const organization = await ctx.db.get(membership.organizationId);

    if (organization?.adminProfileIds.includes(profile._id)) {
      adminOfOrganizationIds.push(organization._id);
    }

    const classes = await ctx.db
      .query("classes")
      .withIndex("by_organization", (q) => q.eq("organizationId", membership.organizationId))
      .collect();

    for (const row of classes) {
      if (row.memberProfileIds.includes(profile._id)) classIds.push(row._id);
    }
  }

  return {
    id: profile._id,
    username: profile.username,
    isStaff: profile.isStaff,
    isSuperuser: profile.isSuperuser,
    permissions: profile.permissions,
    organizationIds,
    classIds,
    adminOfOrganizationIds,
    isUnlisted: profile.isUnlisted,
    isBannedFromProblemVoting: profile.isBannedFromProblemVoting,
    mute: profile.mute,
    currentParticipationId: profile.currentParticipationId ?? null,
    rating: profile.rating ?? null,
    displayRank: profile.displayRank,
    points: profile.points,
    performancePoints: profile.performancePoints,
    problemCount: profile.problemCount,
  };
}

/**
 * `toViewerRow` with `currentContestId` filled in, which the contest-mode rules
 * (`Contest.is_in_contest`) read.
 */
export async function toViewerRowInContest(
  ctx: AnyCtx,
  profile: Doc<"profiles"> | null,
): Promise<ProfileRow | null> {
  const viewer = await toViewerRow(ctx, profile);

  if (!viewer || !profile?.currentParticipationId) return viewer;
  const participation = await ctx.db.get(profile.currentParticipationId);

  return { ...viewer, currentContestId: participation?.contestId ?? null };
}

/* -------------------------------------------------------------------------- */
/* Loading helpers                                                            */
/* -------------------------------------------------------------------------- */

export async function contestByKey(ctx: AnyCtx, key: string): Promise<Doc<"contests"> | null> {
  return await ctx.db
    .query("contests")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

export async function loadContestProblems(
  ctx: AnyCtx,
  contestId: Id<"contests">,
): Promise<Doc<"contestProblems">[]> {
  const rows = await ctx.db
    .query("contestProblems")
    .withIndex("by_contest_order", (q) => q.eq("contestId", contestId))
    .collect();

  return rows.sort((a, b) => a.order - b.order);
}

export async function loadParticipationSubmissions(
  ctx: AnyCtx,
  participationId: Id<"contestParticipations">,
): Promise<Doc<"submissions">[]> {
  return await ctx.db
    .query("submissions")
    .withIndex("by_participation", (q) => q.eq("participationId", participationId))
    .collect();
}

/** The contest submissions of one participation, ready for the formats. */
export async function contestSubmissionRows(
  ctx: AnyCtx,
  participationId: Id<"contestParticipations">,
  formatName?: string,
): Promise<ContestSubmissionRow[]> {
  const submissions = await loadParticipationSubmissions(ctx, participationId);
  const rows: ContestSubmissionRow[] = [];

  for (const submission of submissions) {
    const contestProblemId = submission.contestProblemId;

    if (!contestProblemId) continue;
    // Only ioi16 reads per-case rows, so nothing else pays for the query.
    let testCases: SubmissionTestCaseRow[] | undefined;

    if (formatName === "ioi16") {
      const cases = await ctx.db
        .query("submissionTestCases")
        .withIndex("by_submission_case", (q) => q.eq("submissionId", submission._id))
        .collect();

      testCases = cases.map((row) => ({
        case: row.case,
        // SAFETY: `submissionTestCases.status` is only ever written by `decodeCaseStatus`,
        // whose return type is `SubmissionResult`; the column itself is a plain string.
        status: row.status as SubmissionTestCaseRow["status"],
        time: row.time,
        memory: row.memory,
        points: row.points,
        total: row.total,
        batch: row.batch ?? null,
      }));
    }

    rows.push(toContestSubmissionRow(submission, contestProblemId, testCases));
  }

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Format wrappers                                                            */
/* -------------------------------------------------------------------------- */

export function formatFor(contest: Doc<"contests"> | ContestRow): ContestFormat {
  return getFormatOrDefault(contest.formatName);
}

/** `Contest.get_label_for_problem(index)`. */
export function labelForProblem(contest: Doc<"contests">, index: number): string {
  return getContestLabelForProblem(toContestRow(contest), index);
}

export function labelsForContest(contest: Doc<"contests">, count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => labelForProblem(contest, index));
}

export type FormatChoice = {
  name: string;
  displayName: string;
  configDefaults: ContestFormat["configDefaults"];
};

/** The choices the contest editor offers, with their defaults. */
export const list = query({
  args: {},
  handler: async (): Promise<FormatChoice[]> => {
    return formatChoices().map(([name, displayName]) => {
      const format = getFormatOrDefault(name);

      return {
        name,
        displayName,
        configDefaults: { ...format.configDefaults },
      };
    });
  },
});

/** `ContestFormat.get_short_form_display()`: message keys about the scoring. */
export const describe = query({
  args: { name: v.string(), config: v.optional(v.any()) },
  handler: async (_ctx, { name, config }): Promise<{ lines: ScoringLine[]; error: string | null }> => {
    try {
      const format = getFormatOrDefault(name);

      return { lines: format.getShortFormDisplay(config), error: null };
    } catch (error) {
      return { lines: [], error: describeFormatError(error) };
    }
  },
});

/** `ContestFormat.validate(config)` for the admin form. */
export const validate = query({
  args: { name: v.string(), config: v.optional(v.any()) },
  handler: async (_ctx, { name, config }): Promise<{ ok: boolean; error: string | null }> => {
    try {
      getFormatOrDefault(name).validate(config);

      return { ok: true, error: null };
    } catch (error) {
      return { ok: false, error: describeFormatError(error) };
    }
  },
});

export function describeFormatError(cause: unknown): string {
  if (cause instanceof FormatConfigError || cause instanceof UnknownContestFormatError) {
    return cause.message;
  }

  return "Invalid contest format configuration.";
}
