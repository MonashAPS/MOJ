import { api } from "@convex/_generated/api";
import type {
  SubmissionListContext,
  SubmissionSourceView,
  SubmissionStatusExtras,
} from "@convex/pages/submissions";
// Imported from the subpath rather than the barrel: `@moj/core`'s index
// re-exports with `export *` across `.js` specifiers, which Turbopack does not
// follow. `permissions` cannot be reached at all for the same reason, so the two
// rules this file needs live in `@/lib/viewerPerms`.
import { SUBMISSION_RESULTS, USER_DISPLAY_CODES } from "@moj/core/verdicts";
import { queryAsViewer } from "@/lib/convex-server";
import { hasPerm, isStaff } from "@/lib/viewerPerms";

/**
 * The submission pages read their extra context from `convex/pages/submissions.ts`.
 * Those queries are new, so until the integrator deploys them the loaders below
 * fall back to composing the same shape out of the queries that are already
 * deployed. Every fallback is marked, and each one loses only the fields that
 * cannot be derived from a deployed query: the judge a submission ran on, the
 * language's time-limit override and a contest problem's output-prefix clip.
 */
async function tryQuery<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

export type ListContext = SubmissionListContext;
export type StatusExtras = SubmissionStatusExtras;
export type SourceView = SubmissionSourceView;

/** `get_searchable_status_codes`: `SC` is never searchable, `IE` only for staff. */
export function searchableStatuses(staff: boolean): Array<{ code: string; name: string }> {
  const hidden = new Set(staff ? ["SC"] : ["SC", "IE"]);
  return SUBMISSION_RESULTS.filter((code) => !hidden.has(code)).map((code) => ({
    code,
    name: USER_DISPLAY_CODES[code] ?? code,
  }));
}

export async function loadListContext(args: {
  username?: string;
  problemCode?: string;
  contestKey?: string;
}): Promise<ListContext> {
  const direct = await tryQuery(() => queryAsViewer(api.pages.submissions.listContext, args));
  if (direct) return direct;
  return await fallbackListContext(args);
}

async function fallbackListContext(args: {
  username?: string;
  problemCode?: string;
  contestKey?: string;
}): Promise<ListContext> {
  const [viewerState, languages] = await Promise.all([
    queryAsViewer(api.viewer.current, {}),
    queryAsViewer(api.languages.list, {}),
  ]);
  const profile = viewerState.profile;
  const staff = isStaff(profile);

  const context: ListContext = {
    found: true,
    allowed: true,
    viewer: profile
      ? {
          username: profile.username,
          canRejudge: hasPerm(profile, "judge.rejudge_submission"),
          canAbortAny: hasPerm(profile, "judge.abort_any_submission"),
          canViewAllSubmissions: hasPerm(profile, "judge.view_all_submission"),
          canEditAllProblems: hasPerm(profile, "judge.edit_all_problem"),
          isStaff: staff,
        }
      : null,
    languages: languages.map((row) => ({ key: row.key, name: row.name })),
    statuses: searchableStatuses(staff),
    user: null,
    problem: null,
    contest: null,
    inContestMode: viewerState.inContest,
  };

  if (args.username) {
    const author = await queryAsViewer(api.profiles.byUsername, { username: args.username });
    if (!author) return { ...context, found: false };
    context.user = {
      username: author.username,
      rating: author.rating ?? null,
      displayRank: author.displayRank,
      isSelf: profile?._id === author._id,
    };
  }

  if (args.problemCode) {
    const problem = await queryAsViewer(api.problems.get, { code: args.problemCode });
    if (!problem) return { ...context, found: false };
    context.problem = { code: problem.code, name: problem.name, editable: problem.canEdit };
  }

  if (args.contestKey) {
    const contest = await queryAsViewer(api.contests.get, { key: args.contestKey });
    if (!contest.contest) return { ...context, found: false };
    const number = contest.problems.find((row) => row.code === args.problemCode)?.order ?? null;
    const participations = context.user
      ? await tryQuery(() =>
          queryAsViewer(api.contests.participationsOfUser, {
            key: args.contestKey as string,
            username: context.user?.username as string,
          }),
        )
      : null;
    context.contest = {
      key: contest.contest.key,
      name: contest.contest.name,
      problemNumber: number,
      canSeeFullScoreboard: contest.viewer.canSeeFullScoreboard,
      isParticipant: (participations ?? []).length > 0,
    };
  }

  return context;
}

export async function loadStatusExtras(id: string): Promise<StatusExtras | null> {
  const direct = await tryQuery(() =>
    queryAsViewer(api.pages.submissions.statusExtras, { submissionId: id }),
  );
  if (direct) return direct;
  return await fallbackStatusExtras(id);
}

/** Everything the status header shows that `submissions.detail` already carries.
 *  The judge, the language time-limit override and the output-prefix clip are
 *  not derivable, so they degrade to "unknown" rather than to a wrong value. */
async function fallbackStatusExtras(id: string): Promise<StatusExtras | null> {
  const [detail, viewerState] = await Promise.all([
    queryAsViewer(api.submissions.detail, { submissionId: id }),
    queryAsViewer(api.viewer.current, {}),
  ]);
  if (!detail) return null;

  const row = detail.submission;
  const profile = viewerState.profile;
  const language = row.language ? await queryAsViewer(api.languages.byKey, { key: row.language.key }) : null;
  const isOwn = profile?.username === row.user?.username;

  return {
    found: true,
    canSeeDetail: detail.canSeeDetail,
    solveToView: false,
    id: row.id,
    problem: {
      code: row.problem?.code ?? "",
      name: row.problem?.name ?? "",
      points: row.problem?.points ?? 0,
    },
    user: {
      username: row.user?.username ?? "",
      rating: row.user?.rating ?? null,
      displayRank: row.user?.displayRank ?? "user",
    },
    language: language
      ? {
          key: language.key,
          name: language.name,
          shortName: language.shortName || language.key,
          shikiLang: language.shikiLang,
          extension: language.extension,
        }
      : null,
    date: row.date,
    judge: null,
    timeLimit: 0,
    maxExecutionTime: detail.cases.reduce((slowest, testCase) => Math.max(slowest, testCase.time), 0),
    isPretested: row.isPretested,
    isLocked: row.isLocked,
    outputPrefixOverride: null,
    contest: row.contest
      ? {
          key: row.contest.key,
          name: row.contest.name,
          points: row.contestPoints,
          total: row.problem?.points ?? 0,
        }
      : null,
    problemEditable: hasPerm(profile, "judge.edit_all_problem"),
    canAbort: hasPerm(profile, "judge.abort_any_submission") || isOwn,
    canRejudge: hasPerm(profile, "judge.rejudge_submission") && (!row.isLocked || !!profile?.isSuperuser),
    canResubmit: isOwn || hasPerm(profile, "judge.resubmit_other"),
  };
}

export async function loadSourceView(id: string): Promise<SourceView | null> {
  const direct = await tryQuery(() => queryAsViewer(api.pages.submissions.sourceView, { submissionId: id }));
  if (direct) return direct;
  return await fallbackSourceView(id);
}

async function fallbackSourceView(id: string): Promise<SourceView | null> {
  const [detail, source, viewerState] = await Promise.all([
    queryAsViewer(api.submissions.detail, { submissionId: id }),
    queryAsViewer(api.submissions.source, { submissionId: id }),
    queryAsViewer(api.viewer.current, {}),
  ]);
  if (!detail || !source) return null;

  const row = detail.submission;
  const profile = viewerState.profile;
  const language = row.language ? await queryAsViewer(api.languages.byKey, { key: row.language.key }) : null;
  const isOwn = profile?.username === row.user?.username;

  return {
    canSeeSource: source.canSeeSource,
    solveToView: false,
    id: row.id,
    source: (source.source ?? "").replace(/\n+$/, ""),
    problem: { code: row.problem?.code ?? "", name: row.problem?.name ?? "" },
    user: {
      username: row.user?.username ?? "",
      rating: row.user?.rating ?? null,
      displayRank: row.user?.displayRank ?? "user",
    },
    language: language
      ? {
          key: language.key,
          name: language.name,
          shortName: language.shortName || language.key,
          shikiLang: language.shikiLang,
          extension: language.extension,
        }
      : null,
    date: row.date,
    judge: null,
    status: row.status,
    result: row.result,
    casePoints: row.casePoints,
    caseTotal: row.caseTotal,
    points: row.points,
    problemPoints: row.problem?.points ?? 0,
    isLocked: row.isLocked,
    canRejudge: hasPerm(profile, "judge.rejudge_submission") && (!row.isLocked || !!profile?.isSuperuser),
    canResubmit: isOwn || hasPerm(profile, "judge.resubmit_other"),
  };
}
