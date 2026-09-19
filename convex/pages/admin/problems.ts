/**
 * Read models for the console's problem screens: the list and its filters, the
 * option lists the form's Selects are built from, everything the edit form's
 * tabs read in one round trip, and the clone mutation.
 */

import { hasPerm, problemIsEditableBy, problemIsInEditableSet } from "@moj/core";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { mutation, query } from "../../_generated/server";
import { labelForProblem } from "../../contests/formats";
import { requireViewer } from "../../lib/auth";
import { forbidden, invalid, mojError } from "../../lib/errors";
import {
  loadViewerContext,
  PROBLEM_CODE_PATTERN,
  problemByCode,
  solutionFor,
  toCoreProblem,
} from "../../problems";
import { consolePermissions, staffViewer, usernamesOf } from "./console";

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
export const list = query({
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

    const group = args.group;
    const type = args.type;
    const author = args.author;

    const groupRow = group
      ? await ctx.db
          .query("problemGroups")
          .withIndex("by_name", (q) => q.eq("name", group))
          .first()
      : null;

    const typeRow = type
      ? await ctx.db
          .query("problemTypes")
          .withIndex("by_name", (q) => q.eq("name", type))
          .first()
      : null;

    const authorRow = author
      ? await ctx.db
          .query("profiles")
          .withIndex("by_username", (q) => q.eq("username", author))
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
export const options = query({
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
    const authorIds = new Set<Id<"profiles">>();

    for (const problem of await ctx.db.query("problems").collect()) {
      for (const id of problem.authorProfileIds) authorIds.add(id);
    }

    const authors: string[] = [];

    for (const id of authorIds) {
      const row = await ctx.db.get(id);

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
export const edit = query({
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
        label: labelForProblem(contest, index < 0 ? link.order : index),
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
export const clone = mutation({
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

    if (!PROBLEM_CODE_PATTERN.test(newCode) || newCode.length > 20) {
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

export const search = query({
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
