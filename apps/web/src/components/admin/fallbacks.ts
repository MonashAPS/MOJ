"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useConsoleQuery } from "./useConsoleQuery";

/**
 * One place for "what the console shows before `convex/pages/admin1.ts` reaches
 * the deployment". Each hook prefers the console's own read model and falls
 * back to the public and admin queries that are already deployed, so no screen
 * is blank while the branch waits to be integrated.
 *
 * `degraded` is what a screen checks when a fallback cannot supply a column or
 * a filter. Every one of these hooks collapses to a single `useConsoleQuery`
 * call once the module is deployed.
 */

const PERMISSION_CODES = [
  "judge.edit_own_problem",
  "judge.edit_all_problem",
  "judge.change_public_visibility",
  "judge.create_private_problem",
  "judge.change_manually_managed",
  "judge.problem_full_markup",
  "judge.clone_problem",
  "judge.rejudge_submission",
  "judge.rejudge_submission_lot",
  "judge.edit_own_contest",
  "judge.edit_all_contest",
  "judge.change_contest_visibility",
  "judge.create_private_contest",
  "judge.contest_rating",
  "judge.lock_contest",
  "judge.contest_access_code",
  "judge.override_performance_ceiling",
  "judge.clone_contest",
  "judge.moss_contest",
];

type ProblemEdit = NonNullable<FunctionReturnType<typeof api.pages.admin1.problemEdit>>;
type ProblemOptions = FunctionReturnType<typeof api.pages.admin1.problemOptions>;
type ProblemsList = FunctionReturnType<typeof api.pages.admin1.problemsList>;
type ContestEdit = NonNullable<FunctionReturnType<typeof api.pages.admin1.contestEdit>>;
type ContestOptions = FunctionReturnType<typeof api.pages.admin1.contestOptions>;
type SubmissionsList = FunctionReturnType<typeof api.pages.admin1.submissionsList>;
type JobsList = FunctionReturnType<typeof api.pages.admin1.jobsList>;
type Permissions = ProblemEdit["permissions"];

function permissionsFrom(map: Record<string, boolean> | undefined): Permissions {
  const can = (code: string) => map?.[code] ?? false;
  return {
    editOwnProblem: can("judge.edit_own_problem"),
    editAllProblem: can("judge.edit_all_problem"),
    changePublicVisibility: can("judge.change_public_visibility"),
    createPrivateProblem: can("judge.create_private_problem"),
    changeManuallyManaged: can("judge.change_manually_managed"),
    problemFullMarkup: can("judge.problem_full_markup"),
    cloneProblem: can("judge.clone_problem"),
    rejudgeSubmission: can("judge.rejudge_submission"),
    rejudgeSubmissionLot: can("judge.rejudge_submission_lot"),
    editOwnContest: can("judge.edit_own_contest"),
    editAllContest: can("judge.edit_all_contest"),
    changeContestVisibility: can("judge.change_contest_visibility"),
    createPrivateContest: can("judge.create_private_contest"),
    contestRating: can("judge.contest_rating"),
    lockContest: can("judge.lock_contest"),
    contestAccessCode: can("judge.contest_access_code"),
    overridePerformanceCeiling: can("judge.override_performance_ceiling"),
    cloneContest: can("judge.clone_contest"),
    moss: can("judge.moss_contest"),
  };
}

/* -------------------------------------------------------------------------- */
/* Problems                                                                   */
/* -------------------------------------------------------------------------- */

export function useAdminProblemsList(args: {
  search?: string;
  isPublic?: boolean;
  group?: string;
  type?: string;
  author?: string;
  page: number;
  pageSize: number;
}): { data: ProblemsList | undefined; degraded: boolean } {
  const primary = useConsoleQuery(api.pages.admin1.problemsList, args);
  const legacy = useQuery(
    api.admin.problems.editable,
    primary.unavailable ? { search: args.search, limit: 500 } : "skip",
  );

  if (!primary.unavailable) return { data: primary.data, degraded: false };
  if (legacy === undefined) return { data: undefined, degraded: true };

  const matched = legacy.items.filter((row) => {
    if (args.isPublic !== undefined && row.isPublic !== args.isPublic) return false;
    if (args.group && row.group !== args.group) return false;
    return true;
  });
  const start = (args.page - 1) * args.pageSize;
  return {
    data: {
      items: matched.slice(start, start + args.pageSize).map((row) => ({
        code: row.code,
        name: row.name,
        group: row.group,
        types: [],
        authors: [],
        points: row.points,
        partial: false,
        isPublic: row.isPublic,
        isManuallyManaged: row.isManuallyManaged,
        isOrganizationPrivate: row.isOrganizationPrivate,
        date: row.date,
        userCount: row.userCount,
        acRate: row.acRate,
      })),
      total: matched.length,
      page: args.page,
      pageSize: args.pageSize,
    },
    degraded: true,
  };
}

export function useAdminProblemOptions(): { data: ProblemOptions | undefined; degraded: boolean } {
  const primary = useConsoleQuery(api.pages.admin1.problemOptions, {});
  const languages = useQuery(api.languages.list, primary.unavailable ? {} : "skip");
  const licenses = useQuery(api.site.licenses, primary.unavailable ? {} : "skip");

  if (!primary.unavailable) return { data: primary.data, degraded: false };
  if (languages === undefined || licenses === undefined) return { data: undefined, degraded: true };
  return {
    data: {
      groups: [],
      types: [],
      licenses: licenses.map((row) => ({ key: row.key, name: row.name })),
      languages: languages.map((row) => ({
        key: row.key,
        name: row.name,
        shortName: row.shortName,
      })),
      organizations: [],
      authors: [],
    },
    degraded: true,
  };
}

export function useAdminProblemEdit(code: string): {
  data: ProblemEdit | null | undefined;
  degraded: boolean;
} {
  const primary = useConsoleQuery(api.pages.admin1.problemEdit, { code });
  const skip = !primary.unavailable;
  const problem = useQuery(api.problems.get, skip ? "skip" : { code });
  const editorial = useQuery(api.problems.editorial, skip ? "skip" : { code });
  const clarifications = useQuery(api.problems.clarifications, skip ? "skip" : { code });
  const permissions = useQuery(api.viewer.permissions, skip ? "skip" : { codes: PERMISSION_CODES });

  if (!primary.unavailable) return { data: primary.data, degraded: false };
  if (problem === undefined || permissions === undefined) return { data: undefined, degraded: true };
  if (problem === null) return { data: null, degraded: true };

  return {
    data: {
      code: problem.code,
      name: problem.name,
      description: problem.statement.source,
      summary: problem.summary ?? "",
      points: problem.points,
      partial: problem.partial,
      timeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
      shortCircuit: problem.shortCircuit,
      isPublic: problem.isPublic,
      isManuallyManaged: problem.isManuallyManaged,
      isFullMarkup: problem.isFullMarkup,
      isOrganizationPrivate: problem.isOrganizationPrivate,
      submissionSourceVisibility: problem.sourceVisibility,
      date: problem.date,
      ogImage: problem.ogImage ?? "",
      group: problem.group?.name ?? null,
      types: (problem.types ?? []).map((row) => row.name),
      license: problem.license?.key ?? null,
      allowedLanguages: problem.allowedLanguages.map((row) => row.key),
      organizations: [],
      authors: problem.authors.map((row) => row.username),
      curators: problem.curators.map((row) => row.username),
      testers: problem.testers.map((row) => row.username),
      bannedUsers: [],
      languageLimits: problem.languageLimits.map((row) => ({
        languageKey: row.languageKey,
        timeLimit: row.timeLimit,
        memoryLimit: row.memoryLimit,
      })),
      translations: [],
      clarifications: (clarifications ?? []).map((row) => ({
        id: row.id,
        date: row.date,
        description: row.description,
      })),
      editorial: editorial
        ? {
            content: editorial.content,
            isPublic: editorial.isPublic,
            publishOn: editorial.publishOn,
            authors: editorial.authors.map((row) => row.username),
          }
        : null,
      appearances: problem.appearedIn.map((row) => ({
        contestKey: row.contestKey,
        contestName: row.contestName,
        label: row.label,
        startTime: row.startTime,
      })),
      userCount: problem.userCount,
      acRate: problem.acRate,
      submissionCount: problem.stats.attempts,
      permissions: permissionsFrom(permissions),
    },
    degraded: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Contests                                                                   */
/* -------------------------------------------------------------------------- */

export function useAdminContestEdit(key: string): {
  data: ContestEdit | null | undefined;
  degraded: boolean;
} {
  const primary = useConsoleQuery(api.pages.admin1.contestEdit, { key });
  const skip = !primary.unavailable;
  const legacy = useQuery(api.admin.contests.get, skip ? "skip" : { key });
  const tags = useQuery(api.site.contestTags, skip ? "skip" : {});
  const permissions = useQuery(api.viewer.permissions, skip ? "skip" : { codes: PERMISSION_CODES });

  if (!primary.unavailable) return { data: primary.data, degraded: false };
  if (legacy === undefined || permissions === undefined) return { data: undefined, degraded: true };
  if (legacy === null) return { data: null, degraded: true };

  const contest = legacy.contest;
  const tagNames = (tags ?? []).filter((tag) => contest.tagIds.includes(tag._id)).map((tag) => tag.name);

  return {
    data: {
      key: contest.key,
      name: contest.name,
      description: contest.description,
      summary: contest.summary ?? "",
      startTime: contest.startTime,
      endTime: contest.endTime,
      timeLimit: contest.timeLimit ?? null,
      isVisible: contest.isVisible,
      isRated: contest.isRated,
      ratingFloor: contest.ratingFloor ?? null,
      ratingCeiling: contest.ratingCeiling ?? null,
      performanceCeilingOverride: contest.performanceCeilingOverride ?? null,
      rateAll: contest.rateAll,
      rateExclude: [],
      formatName: contest.formatName,
      formatConfig: contest.formatConfig ?? null,
      labelScheme: contest.labelScheme,
      customLabels: contest.customLabels,
      scoreboardVisibility: contest.scoreboardVisibility,
      freezeMinutes: contest.freezeMinutes,
      blindDuringFreeze: contest.blindDuringFreeze,
      accessCode: contest.accessCode ?? "",
      isPrivate: contest.isPrivate,
      privateContestants: [],
      isOrganizationPrivate: contest.isOrganizationPrivate,
      organizationSlugs: [],
      classNames: [],
      limitJoinOrganizations: contest.limitJoinOrganizations,
      joinOrganizationSlugs: [],
      tagNames,
      lockedAfter: contest.lockedAfter ?? null,
      pointsPrecision: contest.pointsPrecision,
      hideProblemTags: contest.hideProblemTags,
      hideProblemAuthors: contest.hideProblemAuthors,
      runPretestsOnly: contest.runPretestsOnly,
      showShortDisplay: contest.showShortDisplay,
      useClarifications: contest.useClarifications,
      ogImage: contest.ogImage ?? "",
      logoOverrideImage: contest.logoOverrideImage ?? "",
      authors: [],
      curators: [],
      testers: [],
      spectators: [],
      testerSeeScoreboard: contest.testerSeeScoreboard,
      testerSeeSubmissions: contest.testerSeeSubmissions,
      viewContestScoreboard: [],
      viewContestSubmissions: [],
      bannedUsers: [],
      userCount: contest.userCount,
      problems: legacy.problems.map((row) => ({
        id: row._id,
        label: row.label,
        code: row.code,
        name: row.name,
        points: row.points,
        partial: row.partial,
        isPretested: row.isPretested,
        maxSubmissions: row.maxSubmissions ?? null,
        outputPrefixOverride: row.outputPrefixOverride ?? null,
        order: row.order,
      })),
      contestants: [],
      permissions: permissionsFrom(permissions),
    },
    degraded: true,
  };
}

export function useAdminContestOptions(): { data: ContestOptions | undefined; degraded: boolean } {
  const primary = useConsoleQuery(api.pages.admin1.contestOptions, {});
  const tags = useQuery(api.site.contestTags, primary.unavailable ? {} : "skip");

  if (!primary.unavailable) return { data: primary.data, degraded: false };
  if (tags === undefined) return { data: undefined, degraded: true };
  return {
    data: {
      organizations: [],
      classes: [],
      tags: tags.map((row) => ({ name: row.name, color: row.color })),
    },
    degraded: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Submissions                                                                */
/* -------------------------------------------------------------------------- */

export function useAdminSubmissionsList(args: {
  username?: string;
  problemCode?: string;
  contestKey?: string;
  judgeName?: string;
  status?: string;
  results?: string[];
  languageKeys?: string[];
  idFrom?: number;
  idTo?: number;
  page: number;
  pageSize: number;
}): { data: SubmissionsList | undefined; degraded: boolean } {
  const primary = useConsoleQuery(api.pages.admin1.submissionsList, args);
  const legacy = useQuery(
    api.submissions.list,
    primary.unavailable
      ? {
          paginationOpts: { numItems: args.page * args.pageSize, cursor: null },
          username: args.username,
          problemCode: args.problemCode,
          contestKey: args.contestKey,
          languageKeys: args.languageKeys?.length ? args.languageKeys : undefined,
          results: args.results?.length ? args.results : undefined,
        }
      : "skip",
  );

  if (!primary.unavailable) return { data: primary.data, degraded: false };
  if (legacy === undefined) return { data: undefined, degraded: true };

  const start = (args.page - 1) * args.pageSize;
  const rows = legacy.page.slice(start, start + args.pageSize);
  return {
    data: {
      items: rows.map((row) => ({
        id: row._id,
        legacyId: typeof row.id === "number" ? row.id : null,
        displayId: row.id,
        date: row.date,
        username: row.user?.username ?? "",
        problemCode: row.problem?.code ?? "",
        problemName: row.problem?.name ?? "",
        language: row.language?.shortName || row.language?.name || "",
        status: row.status,
        result: row.result ?? null,
        points: row.points ?? null,
        total: row.problem?.points ?? 0,
        time: row.time ?? null,
        memory: row.memory ?? null,
        judge: null,
        contestKey: row.contest?.key ?? null,
        isLocked: row.isLocked,
      })),
      total: legacy.page.length,
      page: args.page,
      pageSize: args.pageSize,
    },
    degraded: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Jobs                                                                       */
/* -------------------------------------------------------------------------- */

export function useAdminJobsList(args: { limit: number; type?: string; status?: string }): {
  data: JobsList | undefined;
  degraded: boolean;
} {
  const primary = useConsoleQuery(api.pages.admin1.jobsList, args);
  const legacy = useQuery(
    api.jobs.recent,
    primary.unavailable ? { limit: args.limit, type: args.type } : "skip",
  );

  if (!primary.unavailable) return { data: primary.data, degraded: false };
  if (legacy === undefined) return { data: undefined, degraded: true };
  return {
    data: legacy
      .filter((job) => !args.status || job.status === args.status)
      .map((job) => ({
        id: job._id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        args: job.args ?? null,
        result: job.result ?? null,
        error: job.error ?? null,
        createdBy: null,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt ?? null,
      })),
    degraded: true,
  };
}
