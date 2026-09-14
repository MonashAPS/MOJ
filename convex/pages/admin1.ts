/**
 * Read models for the staff console's first half: problems, contests,
 * submissions, scoreboards and jobs (SPEC section 8).
 *
 * `convex/admin/*` already carries every mutation these screens call, and the
 * permission rules with them. What was missing was the shape a dense list or a
 * tabbed edit form needs in one round trip: names instead of ids, the option
 * lists a Select is built from, and the flags that decide which controls the
 * viewer is allowed to see at all. Nothing here writes.
 */

import { contestIsEditableBy, hasPerm, problemIsEditableBy, problemIsInEditableSet } from "@moj/core";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, type QueryCtx, query } from "../_generated/server";
import { contestByKey, labelsForContest, toContestRow, toViewerRowInContest } from "../contestFormats";
import { requireViewer } from "../lib/auth";
import { forbidden, invalid, mojError } from "../lib/errors";
import { labelFor, loadViewerContext, problemByCode, solutionFor, toCoreProblem } from "../problems";

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

type ViewerContext = Awaited<ReturnType<typeof loadViewerContext>>;

async function staffViewer(ctx: QueryCtx): Promise<ViewerContext | null> {
  const viewer = await loadViewerContext(ctx);
  if (!viewer.profile) return null;
  if (!viewer.profile.isStaff && !viewer.profile.isSuperuser) return null;
  return viewer;
}

async function usernamesOf(ctx: QueryCtx, ids: readonly Id<"profiles">[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    const row = await ctx.db.get(id);
    if (row) out.push(row.username);
  }
  return out;
}

/** The console's permission map: one call, so a tab can hide what it must. */
function consolePermissions(viewer: ViewerContext) {
  const can = (code: string) => hasPerm(viewer.core, code);
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

export type ConsolePermissions = ReturnType<typeof consolePermissions>;

/** What the shell needs to draw its rail: who the viewer is and what they may do. */
export const consoleViewer = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await staffViewer(ctx);
    if (!viewer?.profile) return null;
    return {
      username: viewer.profile.username,
      isSuperuser: viewer.profile.isSuperuser,
      permissions: consolePermissions(viewer),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Problems                                                                   */
/* -------------------------------------------------------------------------- */

export type AdminProblemRow = {
  code: string;
  name: string;
  group: string | null;
  types: string[];
  authors: string[];
  points: number;
  partial: boolean;
  isPublic: boolean;
  isManuallyManaged: boolean;
  isOrganizationPrivate: boolean;
  date: number;
  userCount: number;
  acRate: number;
};

/**
 * `ProblemAdmin.get_queryset` plus its list filters: public, group, type and
 * `ProblemCreatorListFilter`. The set is the viewer's editable problems, never
 * every problem.
 */
export const problemsList = query({
  args: {
    search: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    group: v.optional(v.string()),
    type: v.optional(v.string()),
    author: v.optional(v.string()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ items: AdminProblemRow[]; total: number; page: number; pageSize: number }> => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return { items: [], total: 0, page: 1, pageSize: 0 };

    const page = Math.max(1, Math.floor(args.page ?? 1));
    const pageSize = Math.max(1, Math.min(Math.floor(args.pageSize ?? 50), 200));
    const needle = (args.search ?? "").trim().toLowerCase();

    const groupRow = args.group
      ? await ctx.db
          .query("problemGroups")
          .withIndex("by_name", (q) => q.eq("name", args.group as string))
          .first()
      : null;
    const typeRow = args.type
      ? await ctx.db
          .query("problemTypes")
          .withIndex("by_name", (q) => q.eq("name", args.type as string))
          .first()
      : null;
    const authorRow = args.author
      ? await ctx.db
          .query("profiles")
          .withIndex("by_username", (q) => q.eq("username", args.author as string))
          .unique()
      : null;
    if ((args.group && !groupRow) || (args.type && !typeRow) || (args.author && !authorRow)) {
      return { items: [], total: 0, page, pageSize };
    }

    const matched = (await ctx.db.query("problems").collect()).filter((problem) => {
      if (!problemIsInEditableSet(toCoreProblem(problem), viewer.core)) return false;
      if (args.isPublic !== undefined && problem.isPublic !== args.isPublic) return false;
      if (groupRow && problem.groupId !== groupRow._id) return false;
      if (typeRow && !problem.typeIds.includes(typeRow._id)) return false;
      if (authorRow && !problem.authorProfileIds.includes(authorRow._id)) return false;
      if (!needle) return true;
      return problem.code.includes(needle) || problem.name.toLowerCase().includes(needle);
    });
    matched.sort((a, b) => a.code.localeCompare(b.code));

    const items: AdminProblemRow[] = [];
    for (const problem of matched.slice((page - 1) * pageSize, page * pageSize)) {
      const group = await ctx.db.get(problem.groupId);
      const types: string[] = [];
      for (const id of problem.typeIds) {
        const row = await ctx.db.get(id);
        if (row) types.push(row.fullName || row.name);
      }
      items.push({
        code: problem.code,
        name: problem.name,
        group: group?.fullName ?? group?.name ?? null,
        types,
        authors: await usernamesOf(ctx, problem.authorProfileIds),
        points: problem.points,
        partial: problem.partial,
        isPublic: problem.isPublic,
        isManuallyManaged: problem.isManuallyManaged,
        isOrganizationPrivate: problem.isOrganizationPrivate,
        date: problem.date,
        userCount: problem.userCount,
        acRate: problem.acRate,
      });
    }
    return { items, total: matched.length, page, pageSize };
  },
});

/** Every Select in the problem form, and the values its filters offer. */
export const problemOptions = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await staffViewer(ctx);
    if (!viewer) {
      return { groups: [], types: [], licenses: [], languages: [], organizations: [], authors: [] };
    }

    const [groups, types, licenses, languages, organizations] = await Promise.all([
      ctx.db.query("problemGroups").collect(),
      ctx.db.query("problemTypes").collect(),
      ctx.db.query("licenses").collect(),
      ctx.db.query("languages").collect(),
      ctx.db.query("organizations").collect(),
    ]);

    // `ProblemCreatorListFilter`: only profiles that authored something.
    const authorIds = new Set<string>();
    for (const problem of await ctx.db.query("problems").collect()) {
      for (const id of problem.authorProfileIds) authorIds.add(id as string);
    }
    const authors: string[] = [];
    for (const id of authorIds) {
      const row = await ctx.db.get(id as Id<"profiles">);
      if (row) authors.push(row.username);
    }

    return {
      groups: groups
        .map((row) => ({ name: row.name, fullName: row.fullName }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
      types: types
        .map((row) => ({ name: row.name, fullName: row.fullName }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
      licenses: licenses
        .map((row) => ({ key: row.key, name: row.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      languages: languages
        .map((row) => ({ key: row.key, name: row.name, shortName: row.shortName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      organizations: organizations
        .map((row) => ({ slug: row.slug, name: row.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      authors: authors.sort((a, b) => a.localeCompare(b)),
    };
  },
});

/** Everything the problem edit form's tabs read, in one round trip. */
export const problemEdit = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return null;
    const problem = await problemByCode(ctx, code);
    if (!problem) return null;
    if (!problemIsEditableBy(toCoreProblem(problem), viewer.core)) return null;

    const group = await ctx.db.get(problem.groupId);
    const license = problem.licenseId ? await ctx.db.get(problem.licenseId) : null;

    const types: string[] = [];
    for (const id of problem.typeIds) {
      const row = await ctx.db.get(id);
      if (row) types.push(row.name);
    }
    const allowedLanguages: string[] = [];
    for (const id of problem.allowedLanguageIds) {
      const row = await ctx.db.get(id);
      if (row) allowedLanguages.push(row.key);
    }
    const organizations: string[] = [];
    for (const id of problem.organizationIds) {
      const row = await ctx.db.get(id);
      if (row) organizations.push(row.slug);
    }

    const limitRows = await ctx.db
      .query("languageLimits")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect();
    const languageLimits: { languageKey: string; timeLimit: number; memoryLimit: number }[] = [];
    for (const limit of limitRows) {
      const language = await ctx.db.get(limit.languageId);
      if (language) {
        languageLimits.push({
          languageKey: language.key,
          timeLimit: limit.timeLimit,
          memoryLimit: limit.memoryLimit,
        });
      }
    }

    const translations = (
      await ctx.db
        .query("problemTranslations")
        .withIndex("by_problem_language", (q) => q.eq("problemId", problem._id))
        .collect()
    )
      .map((row) => ({ language: row.language, name: row.name, description: row.description }))
      .sort((a, b) => a.language.localeCompare(b.language));

    const clarifications = (
      await ctx.db
        .query("problemClarifications")
        .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
        .collect()
    )
      .map((row) => ({ id: row._id, date: row.date, description: row.description }))
      .sort((a, b) => b.date - a.date);

    const solution = await solutionFor(ctx, problem._id);
    const editorial = solution
      ? {
          content: solution.content,
          isPublic: solution.isPublic,
          publishOn: solution.publishOn,
          authors: await usernamesOf(ctx, solution.authorProfileIds),
        }
      : null;

    const contestLinks = await ctx.db
      .query("contestProblems")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect();
    const appearances: { contestKey: string; contestName: string; label: string; startTime: number }[] = [];
    for (const link of contestLinks) {
      const contest = await ctx.db.get(link.contestId);
      if (!contest) continue;
      const siblings = await ctx.db
        .query("contestProblems")
        .withIndex("by_contest_order", (q) => q.eq("contestId", contest._id))
        .collect();
      siblings.sort((a, b) => a.order - b.order);
      const index = siblings.findIndex((row) => row._id === link._id);
      appearances.push({
        contestKey: contest.key,
        contestName: contest.name,
        label: labelFor(contest, index < 0 ? link.order : index),
        startTime: contest.startTime,
      });
    }
    appearances.sort((a, b) => b.startTime - a.startTime);

    const submissionCount = (
      await ctx.db
        .query("submissions")
        .withIndex("by_problem_date", (q) => q.eq("problemId", problem._id))
        .take(20_000)
    ).length;

    return {
      code: problem.code,
      name: problem.name,
      description: problem.description,
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
      submissionSourceVisibility: problem.submissionSourceVisibility,
      date: problem.date,
      ogImage: problem.ogImage ?? "",
      group: group?.name ?? null,
      types,
      license: license?.key ?? null,
      allowedLanguages,
      organizations,
      authors: await usernamesOf(ctx, problem.authorProfileIds),
      curators: await usernamesOf(ctx, problem.curatorProfileIds),
      testers: await usernamesOf(ctx, problem.testerProfileIds),
      bannedUsers: await usernamesOf(ctx, problem.bannedProfileIds),
      languageLimits,
      translations,
      clarifications,
      editorial,
      appearances,
      userCount: problem.userCount,
      acRate: problem.acRate,
      submissionCount,
      permissions: consolePermissions(viewer),
    };
  },
});

/**
 * `judge.clone_problem`: a copy under a new code, private, with the viewer as
 * its only author and no test data. DMOJ's `ProblemClone` view.
 */
export const cloneProblem = mutation({
  args: { code: v.string(), newCode: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ code: string }> => {
    const profile = await requireViewer(ctx);
    const viewer = await loadViewerContext(ctx);
    if (!profile.isStaff && !profile.isSuperuser) throw forbidden("Staff only.");
    if (!hasPerm(viewer.core, "judge.clone_problem")) {
      throw forbidden("Missing permission judge.clone_problem.");
    }
    const problem = await problemByCode(ctx, args.code);
    if (!problem) throw invalid(`No such problem: ${args.code}`);

    const newCode = args.newCode.trim();
    if (!/^[a-z.0-9]+$/.test(newCode) || newCode.length > 20) {
      throw invalid("Problem codes may only contain lowercase letters, digits and dots.");
    }
    if (await problemByCode(ctx, newCode)) {
      throw mojError("CONFLICT", `A problem with the code "${newCode}" already exists.`);
    }

    const { _id, _creationTime, legacyId, ...fields } = problem;
    const problemId = await ctx.db.insert("problems", {
      ...fields,
      code: newCode,
      isPublic: false,
      userCount: 0,
      acRate: 0,
      authorProfileIds: [profile._id],
      curatorProfileIds: [],
      testerProfileIds: [],
      bannedProfileIds: [],
      date: Date.now(),
    });

    for (const limit of await ctx.db
      .query("languageLimits")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect()) {
      await ctx.db.insert("languageLimits", {
        problemId,
        languageId: limit.languageId,
        timeLimit: limit.timeLimit,
        memoryLimit: limit.memoryLimit,
      });
    }

    await ctx.db.insert("revisions", {
      entityType: "problem",
      entityId: problemId,
      snapshot: { code: newCode, clonedFrom: problem.code },
      authorProfileId: profile._id,
      reason: args.reason?.trim() || `Cloned problem from ${problem.code}`,
      createdAt: Date.now(),
    });
    return { code: newCode };
  },
});

/* -------------------------------------------------------------------------- */
/* Contests                                                                   */
/* -------------------------------------------------------------------------- */

/** The contest edit form, with every profile id already resolved to a name. */
export const contestEdit = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return null;
    const contest = await contestByKey(ctx, key);
    if (!contest) return null;
    const contestViewer = await toViewerRowInContest(ctx, viewer.profile);
    if (!contestIsEditableBy(toContestRow(contest), contestViewer)) return null;

    const links = (
      await ctx.db
        .query("contestProblems")
        .withIndex("by_contest_order", (q) => q.eq("contestId", contest._id))
        .collect()
    ).sort((a, b) => a.order - b.order);
    const labels = labelsForContest(contest, links.length);
    const problems = [];
    for (const [index, link] of links.entries()) {
      const problem = await ctx.db.get(link.problemId);
      problems.push({
        id: link._id,
        label: labels[index] ?? String(index + 1),
        code: problem?.code ?? "",
        name: problem?.name ?? "",
        points: link.points,
        partial: link.partial,
        isPretested: link.isPretested,
        maxSubmissions: link.maxSubmissions ?? null,
        outputPrefixOverride: link.outputPrefixOverride ?? null,
        order: link.order,
      });
    }

    const organizationSlugs: string[] = [];
    for (const id of contest.organizationIds) {
      const row = await ctx.db.get(id);
      if (row) organizationSlugs.push(row.slug);
    }
    const joinOrganizationSlugs: string[] = [];
    for (const id of contest.joinOrganizationIds) {
      const row = await ctx.db.get(id);
      if (row) joinOrganizationSlugs.push(row.slug);
    }
    const classNames: string[] = [];
    for (const id of contest.classIds) {
      const row = await ctx.db.get(id);
      if (row) classNames.push(row.name);
    }
    const tagNames: string[] = [];
    for (const id of contest.tagIds) {
      const row = await ctx.db.get(id);
      if (row) tagNames.push(row.name);
    }

    const participations = await ctx.db
      .query("contestParticipations")
      .withIndex("by_contest_virtual_score", (q) => q.eq("contestId", contest._id))
      .collect();
    const contestants = [];
    for (const row of participations.filter((entry) => entry.virtual === 0)) {
      const profile = await ctx.db.get(row.profileId);
      if (!profile) continue;
      contestants.push({
        participationId: row._id,
        username: profile.username,
        score: row.score,
        cumtime: row.cumtime,
        isDisqualified: row.isDisqualified,
      });
    }
    contestants.sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));

    return {
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
      rateExclude: await usernamesOf(ctx, contest.rateExcludeProfileIds),
      formatName: contest.formatName,
      formatConfig: contest.formatConfig ?? null,
      labelScheme: contest.labelScheme,
      customLabels: contest.customLabels,
      scoreboardVisibility: contest.scoreboardVisibility,
      freezeMinutes: contest.freezeMinutes,
      blindDuringFreeze: contest.blindDuringFreeze,
      accessCode: contest.accessCode ?? "",
      isPrivate: contest.isPrivate,
      privateContestants: await usernamesOf(ctx, contest.privateContestantProfileIds),
      isOrganizationPrivate: contest.isOrganizationPrivate,
      organizationSlugs,
      classNames,
      limitJoinOrganizations: contest.limitJoinOrganizations,
      joinOrganizationSlugs,
      tagNames,
      lockedAfter: contest.lockedAfter ?? null,
      pointsPrecision: contest.pointsPrecision,
      sebRequired: contest.sebRequired ?? false,
      sebLaunchUrl: contest.sebLaunchUrl ?? "",
      proctorRequired: contest.proctorRequired ?? false,
      hideProblemTags: contest.hideProblemTags,
      hideProblemAuthors: contest.hideProblemAuthors,
      runPretestsOnly: contest.runPretestsOnly,
      showShortDisplay: contest.showShortDisplay,
      useClarifications: contest.useClarifications,
      ogImage: contest.ogImage ?? "",
      logoOverrideImage: contest.logoOverrideImage ?? "",
      authors: await usernamesOf(ctx, contest.authorProfileIds),
      curators: await usernamesOf(ctx, contest.curatorProfileIds),
      testers: await usernamesOf(ctx, contest.testerProfileIds),
      spectators: await usernamesOf(ctx, contest.spectatorProfileIds),
      testerSeeScoreboard: contest.testerSeeScoreboard,
      testerSeeSubmissions: contest.testerSeeSubmissions,
      viewContestScoreboard: await usernamesOf(ctx, contest.viewContestScoreboardProfileIds),
      viewContestSubmissions: await usernamesOf(ctx, contest.viewContestSubmissionsProfileIds),
      bannedUsers: await usernamesOf(ctx, contest.bannedProfileIds),
      userCount: contest.userCount,
      problems,
      contestants,
      permissions: consolePermissions(viewer),
    };
  },
});

/** Organisations, classes and tags, for the contest form's pickers. */
export const contestOptions = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return { organizations: [], classes: [], tags: [], sebEnabled: false };
    const [organizations, classes, tags, settings] = await Promise.all([
      ctx.db.query("organizations").collect(),
      ctx.db.query("classes").collect(),
      ctx.db.query("contestTags").collect(),
      ctx.db
        .query("siteSettings")
        .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
        .unique(),
    ]);
    const classRows = [];
    for (const row of classes) {
      const organization = await ctx.db.get(row.organizationId);
      classRows.push({ name: row.name, organization: organization?.shortName ?? organization?.name ?? "" });
    }
    return {
      organizations: organizations
        .map((row) => ({ slug: row.slug, name: row.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      classes: classRows.sort((a, b) => a.name.localeCompare(b.name)),
      tags: tags
        .map((row) => ({ name: row.name, color: row.color }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      // The contest editor hides the Safe Exam Browser tab unless the site has
      // the feature on, and this saves it a second query for one boolean.
      sebEnabled: settings?.sebEnabled ?? false,
    };
  },
});

/**
 * The contest mutations in `admin/contests.ts` take profile ids, not names, so
 * the form resolves the names it collected here before it saves.
 */
export const resolveProfiles = query({
  args: { usernames: v.array(v.string()) },
  handler: async (
    ctx,
    { usernames },
  ): Promise<{ ids: Record<string, Id<"profiles">>; missing: string[] }> => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return { ids: {}, missing: usernames };
    const ids: Record<string, Id<"profiles">> = {};
    const missing: string[] = [];
    for (const username of [...new Set(usernames)]) {
      const row = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", username))
        .unique();
      if (row) ids[username] = row._id;
      else missing.push(username);
    }
    return { ids, missing };
  },
});

/** The same for organisations, classes and tags, which the form also names. */
export const resolveContestRefs = query({
  args: {
    organizationSlugs: v.optional(v.array(v.string())),
    joinOrganizationSlugs: v.optional(v.array(v.string())),
    classNames: v.optional(v.array(v.string())),
    tagNames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return { organizationIds: [], joinOrganizationIds: [], classIds: [], tagIds: [] };

    const organizationIdBySlug = new Map<string, Id<"organizations">>();
    for (const row of await ctx.db.query("organizations").collect()) {
      organizationIdBySlug.set(row.slug, row._id);
    }
    const classIdByName = new Map<string, Id<"classes">>();
    for (const row of await ctx.db.query("classes").collect()) classIdByName.set(row.name, row._id);
    const tagIdByName = new Map<string, Id<"contestTags">>();
    for (const row of await ctx.db.query("contestTags").collect()) tagIdByName.set(row.name, row._id);

    const pick = <T>(names: string[] | undefined, from: Map<string, T>): T[] =>
      (names ?? []).map((name) => from.get(name)).filter((id): id is T => id !== undefined);

    return {
      organizationIds: pick(args.organizationSlugs, organizationIdBySlug),
      joinOrganizationIds: pick(args.joinOrganizationSlugs, organizationIdBySlug),
      classIds: pick(args.classNames, classIdByName),
      tagIds: pick(args.tagNames, tagIdByName),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Pickers                                                                    */
/* -------------------------------------------------------------------------- */

export const profileSearch = query({
  args: { term: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { term, limit }): Promise<{ username: string; rating: number | null }[]> => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return [];
    const needle = term.trim();
    const take = Math.max(1, Math.min(limit ?? 10, 25));
    const rows = needle
      ? await ctx.db
          .query("profiles")
          .withSearchIndex("search_username", (q) => q.search("username", needle))
          .take(take)
      : await ctx.db.query("profiles").take(take);
    return rows.map((row) => ({ username: row.username, rating: row.rating ?? null }));
  },
});

export const problemSearch = query({
  args: { term: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { term, limit }): Promise<{ code: string; name: string; points: number }[]> => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return [];
    const needle = term.trim().toLowerCase();
    const take = Math.max(1, Math.min(limit ?? 10, 25));
    const rows = (await ctx.db.query("problems").collect())
      .filter((row) => !needle || row.code.includes(needle) || row.name.toLowerCase().includes(needle))
      .sort((a, b) => a.code.localeCompare(b.code))
      .slice(0, take);
    return rows.map((row) => ({ code: row.code, name: row.name, points: row.points }));
  },
});

/* -------------------------------------------------------------------------- */
/* Submissions                                                                */
/* -------------------------------------------------------------------------- */

export type AdminSubmissionRow = {
  id: Id<"submissions">;
  legacyId: number | null;
  displayId: number | string;
  date: number;
  username: string;
  problemCode: string;
  problemName: string;
  language: string;
  status: string;
  result: string | null;
  points: number | null;
  total: number;
  time: number | null;
  memory: number | null;
  judge: string | null;
  contestKey: string | null;
  isLocked: boolean;
};

/**
 * `SubmissionAdmin.get_queryset` with DMOJ's list filters plus the id range and
 * judge the console's batch tools need. Staff only, because it ignores every
 * per-problem visibility rule the public list applies.
 */
export const submissionsList = query({
  args: {
    username: v.optional(v.string()),
    problemCode: v.optional(v.string()),
    contestKey: v.optional(v.string()),
    languageKeys: v.optional(v.array(v.string())),
    results: v.optional(v.array(v.string())),
    status: v.optional(v.string()),
    judgeName: v.optional(v.string()),
    idFrom: v.optional(v.number()),
    idTo: v.optional(v.number()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ items: AdminSubmissionRow[]; total: number; page: number; pageSize: number }> => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return { items: [], total: 0, page: 1, pageSize: 0 };

    const page = Math.max(1, Math.floor(args.page ?? 1));
    const pageSize = Math.max(1, Math.min(Math.floor(args.pageSize ?? 50), 200));

    const profile = args.username
      ? await ctx.db
          .query("profiles")
          .withIndex("by_username", (q) => q.eq("username", args.username as string))
          .unique()
      : null;
    const problem = args.problemCode ? await problemByCode(ctx, args.problemCode) : null;
    const contest = args.contestKey ? await contestByKey(ctx, args.contestKey) : null;
    const judge = args.judgeName
      ? await ctx.db
          .query("judges")
          .withIndex("by_name", (q) => q.eq("name", args.judgeName as string))
          .unique()
      : null;
    if (
      (args.username && !profile) ||
      (args.problemCode && !problem) ||
      (args.contestKey && !contest) ||
      (args.judgeName && !judge)
    ) {
      return { items: [], total: 0, page, pageSize };
    }

    const languageIds = new Set<string>();
    for (const key of args.languageKeys ?? []) {
      const row = await ctx.db
        .query("languages")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (row) languageIds.add(row._id as string);
    }
    if ((args.languageKeys?.length ?? 0) > 0 && languageIds.size === 0) {
      return { items: [], total: 0, page, pageSize };
    }
    const results = new Set(args.results ?? []);

    const source = problem
      ? ctx.db.query("submissions").withIndex("by_problem_date", (q) => q.eq("problemId", problem._id))
      : profile
        ? ctx.db.query("submissions").withIndex("by_profile_date", (q) => q.eq("profileId", profile._id))
        : contest
          ? ctx.db.query("submissions").withIndex("by_contest_date", (q) => q.eq("contestId", contest._id))
          : ctx.db.query("submissions").withIndex("by_date");

    const scanned = await source.order("desc").take(20_000);
    const matched = scanned.filter((submission) => {
      if (profile && submission.profileId !== profile._id) return false;
      if (problem && submission.problemId !== problem._id) return false;
      if (contest && submission.contestId !== contest._id) return false;
      if (judge && submission.judgedOnJudgeId !== judge._id) return false;
      if (languageIds.size > 0 && !languageIds.has(submission.languageId as string)) return false;
      if (results.size > 0 && !(submission.result && results.has(submission.result))) return false;
      if (args.status && submission.status !== args.status) return false;
      const id = submission.legacyId ?? null;
      if (args.idFrom !== undefined && (id === null || id < args.idFrom)) return false;
      if (args.idTo !== undefined && (id === null || id > args.idTo)) return false;
      return true;
    });
    matched.sort((a, b) => b.date - a.date);

    const items: AdminSubmissionRow[] = [];
    for (const submission of matched.slice((page - 1) * pageSize, page * pageSize)) {
      const [author, problemRow, language, judgeRow, contestRow] = await Promise.all([
        ctx.db.get(submission.profileId),
        ctx.db.get(submission.problemId),
        ctx.db.get(submission.languageId),
        submission.judgedOnJudgeId ? ctx.db.get(submission.judgedOnJudgeId) : Promise.resolve(null),
        submission.contestId ? ctx.db.get(submission.contestId) : Promise.resolve(null),
      ]);
      items.push({
        id: submission._id,
        legacyId: submission.legacyId ?? null,
        displayId: submission.legacyId ?? submission._id,
        date: submission.date,
        username: author?.username ?? "",
        problemCode: problemRow?.code ?? "",
        problemName: problemRow?.name ?? "",
        language: language?.shortName || language?.name || "",
        status: submission.status,
        result: submission.result ?? null,
        points: submission.points ?? null,
        total: problemRow?.points ?? 0,
        time: submission.time ?? null,
        memory: submission.memory ?? null,
        judge: judgeRow?.name ?? null,
        contestKey: contestRow?.key ?? null,
        isLocked: submission.lockedAfter !== undefined,
      });
    }
    return { items, total: matched.length, page, pageSize };
  },
});

/* -------------------------------------------------------------------------- */
/* Jobs                                                                       */
/* -------------------------------------------------------------------------- */

export const jobsList = query({
  args: { limit: v.optional(v.number()), type: v.optional(v.string()), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return [];
    const take = Math.max(1, Math.min(args.limit ?? 50, 200));
    const rows = args.type
      ? await ctx.db
          .query("jobs")
          .withIndex("by_type_createdAt", (q) => q.eq("type", args.type as string))
          .order("desc")
          .take(take)
      : await ctx.db.query("jobs").withIndex("by_type_createdAt").order("desc").take(take);

    const out = [];
    for (const job of rows) {
      if (args.status && job.status !== args.status) continue;
      const author = job.createdByProfileId ? await ctx.db.get(job.createdByProfileId) : null;
      out.push({
        id: job._id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        args: job.args ?? null,
        result: job.result ?? null,
        error: job.error ?? null,
        createdBy: author?.username ?? null,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt ?? null,
      });
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  },
});

/* -------------------------------------------------------------------------- */
/* Revisions                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `admin/problems.revisions` covers problems; contests, scoreboards and tags
 * write the same rows under their own `entityType`, so the console reads them
 * all through one query and diffs the snapshots client side.
 */
export const revisionsFor = query({
  args: {
    entityType: v.union(v.literal("problem"), v.literal("contest"), v.literal("scoreboardEvent")),
    key: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return [];

    let entityId: string | null = null;
    if (args.entityType === "problem") {
      const problem = await problemByCode(ctx, args.key);
      if (problem && problemIsEditableBy(toCoreProblem(problem), viewer.core)) entityId = problem._id;
    } else if (args.entityType === "contest") {
      const contest = await contestByKey(ctx, args.key);
      const contestViewer = await toViewerRowInContest(ctx, viewer.profile);
      if (contest && contestIsEditableBy(toContestRow(contest), contestViewer)) entityId = contest._id;
    } else {
      const event = await ctx.db
        .query("scoreboardEvents")
        .withIndex("by_key", (q) => q.eq("key", args.key))
        .unique();
      if (event) entityId = event._id;
    }
    if (!entityId) return [];

    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 50), 200));
    const rows = await ctx.db
      .query("revisions")
      .withIndex("by_entity", (q) => q.eq("entityType", args.entityType).eq("entityId", entityId as string))
      .order("desc")
      .take(limit);

    const out = [];
    for (const row of rows) {
      const author = row.authorProfileId ? await ctx.db.get(row.authorProfileId) : null;
      out.push({
        id: row._id,
        createdAt: row.createdAt,
        reason: row.reason,
        author: author?.username ?? null,
        snapshot: row.snapshot ?? null,
      });
    }
    return out;
  },
});

/* -------------------------------------------------------------------------- */
/* Scoreboards                                                                */
/* -------------------------------------------------------------------------- */

/** The contests a scoreboard event can name, newest first. */
export const scoreboardOptions = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return { contests: [], organizations: [] };
    const contests = (await ctx.db.query("contests").collect())
      .sort((a, b) => b.startTime - a.startTime)
      .map((row) => ({ key: row.key, name: row.name, startTime: row.startTime }));
    const organizations = (await ctx.db.query("organizations").collect())
      .map((row) => ({ slug: row.slug, name: row.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { contests, organizations };
  },
});
