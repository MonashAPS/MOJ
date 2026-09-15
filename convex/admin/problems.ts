/**
 * The staff console's problem section, ported from DMOJ's `ProblemAdmin`
 * (judge/admin/problem.py) and `problem_manage.py`.
 *
 * Every mutation checks the same rules the Django admin checked, through
 * `@moj/core`, and writes a `revisions` row with the reason the form carried
 * (DMOJ's `change_message`). `revisions` returns the snapshots in order so the
 * console can diff any two of them client side.
 */

import { hasPerm, problemIsEditableBy, problemIsInEditableSet } from "@moj/core";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "../_generated/server";
import type { JobArgs } from "../jobs";
import { writeRevision } from "../lib/community";
import { forbidden, invalid, notFound } from "../lib/errors";
import {
  labelFor,
  loadViewerContext,
  PROBLEM_CODE_PATTERN,
  problemByCode,
  solutionFor,
  toCoreProblem,
} from "../problems";

/* -------------------------------------------------------------------------- */
/* Permission gates                                                           */
/* -------------------------------------------------------------------------- */

export type Editor = { profile: Doc<"profiles">; viewer: Awaited<ReturnType<typeof loadViewerContext>> };

export async function requireStaffViewer(ctx: QueryCtx): Promise<Editor> {
  const viewer = await loadViewerContext(ctx);

  if (!viewer.profile) throw forbidden("You must be logged in to do that.");

  if (!viewer.profile.isStaff && !viewer.profile.isSuperuser) throw forbidden("Staff only.");

  return { profile: viewer.profile, viewer };
}

/** `ProblemAdmin.has_change_permission(obj)`: `Problem.is_editable_by`. */
async function requireProblemEditor(
  ctx: QueryCtx,
  code: string,
): Promise<Editor & { problem: Doc<"problems"> }> {
  const { profile, viewer } = await requireStaffViewer(ctx);
  const problem = await problemByCode(ctx, code);

  if (!problem) throw notFound("Problem");

  if (!problemIsEditableBy(toCoreProblem(problem), viewer.core)) {
    throw forbidden("You may not edit this problem.");
  }

  return { profile, viewer, problem };
}

/** `ProblemAdmin.has_change_permission(None)`, used for the add form. */
async function requireProblemCreator(ctx: QueryCtx): Promise<Editor> {
  const editor = await requireStaffViewer(ctx);

  if (!hasPerm(editor.viewer.core, "judge.edit_own_problem")) {
    throw forbidden("Missing permission judge.edit_own_problem.");
  }

  return editor;
}

/**
 * `ProblemAdmin.save_model`: making a problem public needs
 * `judge.change_public_visibility`, unless the problem is organization private
 * and the viewer has `judge.create_private_problem`.
 */
function assertMayPublish(
  viewer: Awaited<ReturnType<typeof loadViewerContext>>,
  isPublic: boolean,
  isOrganizationPrivate: boolean,
): void {
  if (!isPublic) return;

  if (hasPerm(viewer.core, "judge.change_public_visibility")) return;

  if (!isOrganizationPrivate) throw forbidden("Missing permission judge.change_public_visibility.");

  if (!hasPerm(viewer.core, "judge.create_private_problem")) {
    throw forbidden("Missing permission judge.create_private_problem.");
  }
}

function assertMayUseFullMarkup(
  viewer: Awaited<ReturnType<typeof loadViewerContext>>,
  isFullMarkup: boolean | undefined,
): void {
  if (isFullMarkup === true && !hasPerm(viewer.core, "judge.problem_full_markup")) {
    throw forbidden("Missing permission judge.problem_full_markup.");
  }
}

function assertMayManage(
  viewer: Awaited<ReturnType<typeof loadViewerContext>>,
  isManuallyManaged: boolean | undefined,
): void {
  if (isManuallyManaged !== undefined && !hasPerm(viewer.core, "judge.change_manually_managed")) {
    throw forbidden("Missing permission judge.change_manually_managed.");
  }
}

/* -------------------------------------------------------------------------- */
/* Revisions                                                                  */
/* -------------------------------------------------------------------------- */

/** Everything the console diffs, gathered into one snapshot. */
export async function snapshotProblem(ctx: QueryCtx, problemId: Id<"problems">) {
  const problem = await ctx.db.get(problemId);

  if (!problem) return null;

  const names = async (ids: readonly Id<"profiles">[]) => {
    const out: string[] = [];

    for (const id of ids) {
      const row = await ctx.db.get(id);

      if (row) out.push(row.username);
    }

    return out.sort();
  };

  const typeNames: string[] = [];

  for (const id of problem.typeIds) {
    const row = await ctx.db.get(id);

    if (row) typeNames.push(row.name);
  }

  const group = await ctx.db.get(problem.groupId);
  const license = problem.licenseId ? await ctx.db.get(problem.licenseId) : null;

  const languageKeys: string[] = [];

  for (const id of problem.allowedLanguageIds) {
    const row = await ctx.db.get(id);

    if (row) languageKeys.push(row.key);
  }

  const limitRows = await ctx.db
    .query("languageLimits")
    .withIndex("by_problem", (q) => q.eq("problemId", problemId))
    .collect();

  const languageLimits: Record<string, { timeLimit: number; memoryLimit: number }> = {};

  for (const limit of limitRows) {
    const lang = await ctx.db.get(limit.languageId);

    if (lang) {
      languageLimits[lang.key] = { timeLimit: limit.timeLimit, memoryLimit: limit.memoryLimit };
    }
  }

  const translations = await ctx.db
    .query("problemTranslations")
    .withIndex("by_problem_language", (q) => q.eq("problemId", problemId))
    .collect();

  const clarifications = await ctx.db
    .query("problemClarifications")
    .withIndex("by_problem", (q) => q.eq("problemId", problemId))
    .collect();

  const solution = await solutionFor(ctx, problemId);

  return {
    code: problem.code,
    name: problem.name,
    description: problem.description,
    summary: problem.summary ?? null,
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
    ogImage: problem.ogImage ?? null,
    group: group?.name ?? null,
    types: typeNames.sort(),
    license: license?.key ?? null,
    authors: await names(problem.authorProfileIds),
    curators: await names(problem.curatorProfileIds),
    testers: await names(problem.testerProfileIds),
    bannedUsers: await names(problem.bannedProfileIds),
    allowedLanguages: languageKeys.sort(),
    languageLimits,
    translations: translations
      .map((row) => ({ language: row.language, name: row.name, description: row.description }))
      .sort((a, b) => a.language.localeCompare(b.language)),
    clarifications: clarifications
      .map((row) => ({ date: row.date, description: row.description }))
      .sort((a, b) => a.date - b.date),
    editorial: solution
      ? { content: solution.content, isPublic: solution.isPublic, publishOn: solution.publishOn }
      : null,
  };
}

/** A problem revision always carries the whole problem, so it can be diffed. */
export async function writeProblemRevision(
  ctx: MutationCtx,
  problemId: Id<"problems">,
  authorProfileId: Id<"profiles"> | undefined,
  reason: string,
): Promise<void> {
  await writeRevision(
    ctx,
    "problem",
    problemId,
    await snapshotProblem(ctx, problemId),
    authorProfileId,
    reason,
  );
}

/* -------------------------------------------------------------------------- */
/* Lookups                                                                    */
/* -------------------------------------------------------------------------- */

async function profileIdsFor(
  ctx: QueryCtx,
  usernames: readonly string[],
): Promise<{ ids: Id<"profiles">[]; missing: string[] }> {
  const ids: Id<"profiles">[] = [];
  const missing: string[] = [];

  for (const username of usernames) {
    const row = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (row) ids.push(row._id);
    else missing.push(username);
  }

  return { ids, missing };
}

export async function groupIdByName(
  ctx: MutationCtx,
  name: string,
  createMissing = false,
): Promise<Id<"problemGroups">> {
  const existing = await ctx.db
    .query("problemGroups")
    .withIndex("by_name", (q) => q.eq("name", name))
    .first();

  if (existing) return existing._id;

  if (!createMissing) throw invalid(`No such problem group: ${name}`);

  return await ctx.db.insert("problemGroups", { name, fullName: name });
}

export async function typeIdsByName(
  ctx: MutationCtx,
  names: readonly string[],
  createMissing = false,
): Promise<Id<"problemTypes">[]> {
  const ids: Id<"problemTypes">[] = [];

  for (const name of names) {
    const existing = await ctx.db
      .query("problemTypes")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();

    if (existing) {
      ids.push(existing._id);
      continue;
    }

    if (!createMissing) throw invalid(`No such problem type: ${name}`);
    ids.push(await ctx.db.insert("problemTypes", { name, fullName: name }));
  }

  return ids;
}

async function languageIdByKey(ctx: QueryCtx, key: string): Promise<Id<"languages">> {
  const row = await ctx.db
    .query("languages")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (!row) throw invalid(`No such language: ${key}`);

  return row._id;
}

async function languageIdsByKey(ctx: QueryCtx, keys: readonly string[]): Promise<Id<"languages">[]> {
  const ids: Id<"languages">[] = [];

  for (const key of keys) ids.push(await languageIdByKey(ctx, key));

  return ids;
}

/* -------------------------------------------------------------------------- */
/* create / update                                                            */
/* -------------------------------------------------------------------------- */

export const create = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    summary: v.optional(v.string()),
    points: v.optional(v.number()),
    partial: v.optional(v.boolean()),
    timeLimit: v.optional(v.number()),
    memoryLimit: v.optional(v.number()),
    shortCircuit: v.optional(v.boolean()),
    isPublic: v.optional(v.boolean()),
    isManuallyManaged: v.optional(v.boolean()),
    isFullMarkup: v.optional(v.boolean()),
    date: v.optional(v.number()),
    group: v.optional(v.string()),
    types: v.optional(v.array(v.string())),
    licenseKey: v.optional(v.string()),
    authors: v.optional(v.array(v.string())),
    curators: v.optional(v.array(v.string())),
    testers: v.optional(v.array(v.string())),
    allowedLanguages: v.optional(v.array(v.string())),
    organizationSlugs: v.optional(v.array(v.string())),
    submissionSourceVisibility: v.optional(
      v.union(v.literal("A"), v.literal("S"), v.literal("O"), v.literal("F")),
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile, viewer } = await requireProblemCreator(ctx);

    if (!PROBLEM_CODE_PATTERN.test(args.code) || args.code.length > 20) {
      throw invalid("Problem codes may only contain lowercase letters, digits and dots.");
    }

    if (await problemByCode(ctx, args.code)) {
      throw invalid(`A problem with the code "${args.code}" already exists.`);
    }

    const organizationIds: Id<"organizations">[] = [];

    for (const slug of args.organizationSlugs ?? []) {
      const row = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();

      if (!row) throw invalid(`No such organization: ${slug}`);
      organizationIds.push(row._id);
    }

    const isOrganizationPrivate = organizationIds.length > 0;

    assertMayPublish(viewer, args.isPublic ?? false, isOrganizationPrivate);
    assertMayUseFullMarkup(viewer, args.isFullMarkup);
    assertMayManage(viewer, args.isManuallyManaged);

    const groupId = await groupIdByName(ctx, args.group ?? "uncategorized", true);
    const typeIds = await typeIdsByName(ctx, args.types ?? ["uncategorized"], true);

    const licenseKey = args.licenseKey;

    const license = licenseKey
      ? await ctx.db
          .query("licenses")
          .withIndex("by_key", (q) => q.eq("key", licenseKey))
          .first()
      : null;

    const authors = await profileIdsFor(ctx, args.authors ?? []);
    const curators = await profileIdsFor(ctx, args.curators ?? []);
    const testers = await profileIdsFor(ctx, args.testers ?? []);

    const allLanguages = await ctx.db.query("languages").collect();

    const allowedLanguageIds = args.allowedLanguages
      ? await languageIdsByKey(ctx, args.allowedLanguages)
      : allLanguages.map((row) => row._id);

    const problemId = await ctx.db.insert("problems", {
      code: args.code,
      name: args.name,
      description: args.description ?? "",
      authorProfileIds: authors.ids,
      curatorProfileIds: curators.ids,
      testerProfileIds: testers.ids,
      typeIds,
      groupId,
      timeLimit: args.timeLimit ?? 1,
      memoryLimit: args.memoryLimit ?? 1_000_000,
      shortCircuit: args.shortCircuit ?? true,
      points: args.points ?? 100,
      partial: args.partial ?? false,
      allowedLanguageIds,
      isPublic: args.isPublic ?? false,
      isManuallyManaged: args.isManuallyManaged ?? false,
      date: args.date ?? Date.now(),
      bannedProfileIds: [],
      licenseId: license?._id,
      summary: args.summary,
      userCount: 0,
      acRate: 0,
      isFullMarkup: args.isFullMarkup ?? false,
      submissionSourceVisibility: args.submissionSourceVisibility ?? "F",
      organizationIds,
      isOrganizationPrivate,
    });

    await writeProblemRevision(ctx, problemId, profile._id, args.reason ?? "Created the problem.");

    return {
      id: problemId,
      code: args.code,
      warnings: [...authors.missing, ...curators.missing, ...testers.missing],
    };
  },
});

export const update = mutation({
  args: {
    code: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    summary: v.optional(v.union(v.string(), v.null())),
    points: v.optional(v.number()),
    partial: v.optional(v.boolean()),
    timeLimit: v.optional(v.number()),
    memoryLimit: v.optional(v.number()),
    shortCircuit: v.optional(v.boolean()),
    isPublic: v.optional(v.boolean()),
    isManuallyManaged: v.optional(v.boolean()),
    isFullMarkup: v.optional(v.boolean()),
    date: v.optional(v.number()),
    ogImage: v.optional(v.union(v.string(), v.null())),
    group: v.optional(v.string()),
    types: v.optional(v.array(v.string())),
    licenseKey: v.optional(v.union(v.string(), v.null())),
    allowedLanguages: v.optional(v.array(v.string())),
    organizationSlugs: v.optional(v.array(v.string())),
    submissionSourceVisibility: v.optional(
      v.union(v.literal("A"), v.literal("S"), v.literal("O"), v.literal("F")),
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile, viewer, problem } = await requireProblemEditor(ctx, args.code);

    assertMayUseFullMarkup(viewer, args.isFullMarkup);
    assertMayManage(viewer, args.isManuallyManaged);

    if (problem.isFullMarkup && !hasPerm(viewer.core, "judge.problem_full_markup")) {
      if (args.description !== undefined) {
        throw forbidden("Missing permission judge.problem_full_markup.");
      }
    }

    const patch: Partial<Doc<"problems">> = {};

    if (args.name !== undefined) patch.name = args.name;

    if (args.description !== undefined) patch.description = args.description;

    if (args.summary !== undefined) patch.summary = args.summary ?? undefined;

    if (args.points !== undefined) patch.points = args.points;

    if (args.partial !== undefined) patch.partial = args.partial;

    if (args.timeLimit !== undefined) patch.timeLimit = args.timeLimit;

    if (args.memoryLimit !== undefined) patch.memoryLimit = args.memoryLimit;

    if (args.shortCircuit !== undefined) patch.shortCircuit = args.shortCircuit;

    if (args.isManuallyManaged !== undefined) patch.isManuallyManaged = args.isManuallyManaged;

    if (args.isFullMarkup !== undefined) patch.isFullMarkup = args.isFullMarkup;

    if (args.date !== undefined) patch.date = args.date;

    if (args.ogImage !== undefined) patch.ogImage = args.ogImage ?? undefined;

    if (args.submissionSourceVisibility !== undefined) {
      patch.submissionSourceVisibility = args.submissionSourceVisibility;
    }

    if (args.organizationSlugs !== undefined) {
      const ids: Id<"organizations">[] = [];

      for (const slug of args.organizationSlugs) {
        const row = await ctx.db
          .query("organizations")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .unique();

        if (!row) throw invalid(`No such organization: ${slug}`);
        ids.push(row._id);
      }

      patch.organizationIds = ids;
      // `save_model`: organizations drive is_organization_private.
      patch.isOrganizationPrivate = ids.length > 0;
    }

    if (args.isPublic !== undefined) {
      assertMayPublish(viewer, args.isPublic, patch.isOrganizationPrivate ?? problem.isOrganizationPrivate);
      patch.isPublic = args.isPublic;
    }

    if (args.group !== undefined) patch.groupId = await groupIdByName(ctx, args.group, true);

    if (args.types !== undefined) patch.typeIds = await typeIdsByName(ctx, args.types, true);

    if (args.licenseKey !== undefined) {
      if (args.licenseKey === null) {
        patch.licenseId = undefined;
      } else {
        const licenseKey = args.licenseKey;

        const license = await ctx.db
          .query("licenses")
          .withIndex("by_key", (q) => q.eq("key", licenseKey))
          .first();

        if (!license) throw invalid(`No such license: ${licenseKey}`);
        patch.licenseId = license._id;
      }
    }

    if (args.allowedLanguages !== undefined) {
      patch.allowedLanguageIds = await languageIdsByKey(ctx, args.allowedLanguages);
    }

    await ctx.db.patch(problem._id, patch);
    await writeProblemRevision(ctx, problem._id, profile._id, args.reason ?? "Edited the problem.");

    // `save_model` rescores when any of these change.
    const rescoreFields: (keyof Doc<"problems">)[] = ["isPublic", "organizationIds", "points", "partial"];
    const needsRescore = rescoreFields.some((field) => patch[field] !== undefined);

    if (needsRescore) await scheduleJob(ctx, "rescore", { problemCode: problem.code }, profile._id);

    return { ok: true, rescoreScheduled: needsRescore };
  },
});

export const setVisibility = mutation({
  args: { codes: v.array(v.string()), isPublic: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { profile, viewer } = await requireStaffViewer(ctx);
    const changed: string[] = [];

    for (const code of args.codes) {
      const problem = await problemByCode(ctx, code);

      if (!problem) continue;

      if (!problemIsInEditableSet(toCoreProblem(problem), viewer.core)) continue;

      // `make_public` / `make_private` filter to organization-private problems
      // when the viewer cannot change public visibility.
      if (!hasPerm(viewer.core, "judge.change_public_visibility") && !problem.isOrganizationPrivate) {
        continue;
      }

      await ctx.db.patch(problem._id, { isPublic: args.isPublic });
      await writeProblemRevision(
        ctx,
        problem._id,
        profile._id,
        args.reason ?? (args.isPublic ? "Marked as public." : "Marked as private."),
      );
      await scheduleJob(ctx, "rescore", { problemCode: problem.code }, profile._id);
      changed.push(code);
    }

    return { changed };
  },
});

export const setOwnership = mutation({
  args: {
    code: v.string(),
    authors: v.optional(v.array(v.string())),
    curators: v.optional(v.array(v.string())),
    testers: v.optional(v.array(v.string())),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile, problem } = await requireProblemEditor(ctx, args.code);
    const patch: Partial<Doc<"problems">> = {};
    const warnings: string[] = [];

    if (args.authors !== undefined) {
      const resolved = await profileIdsFor(ctx, args.authors);
      patch.authorProfileIds = resolved.ids;
      warnings.push(...resolved.missing);
    }

    if (args.curators !== undefined) {
      const resolved = await profileIdsFor(ctx, args.curators);
      patch.curatorProfileIds = resolved.ids;
      warnings.push(...resolved.missing);
    }

    if (args.testers !== undefined) {
      const resolved = await profileIdsFor(ctx, args.testers);
      patch.testerProfileIds = resolved.ids;
      warnings.push(...resolved.missing);
    }

    await ctx.db.patch(problem._id, patch);
    await writeProblemRevision(ctx, problem._id, profile._id, args.reason ?? "Changed ownership.");

    return { ok: true, warnings };
  },
});

export const setBannedUsers = mutation({
  args: { code: v.string(), usernames: v.array(v.string()), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { profile, problem } = await requireProblemEditor(ctx, args.code);
    const resolved = await profileIdsFor(ctx, args.usernames);
    await ctx.db.patch(problem._id, { bannedProfileIds: resolved.ids });
    await writeProblemRevision(ctx, problem._id, profile._id, args.reason ?? "Changed banned users.");

    return { ok: true, warnings: resolved.missing };
  },
});

/* -------------------------------------------------------------------------- */
/* Language limits, translations, clarifications, editorial                   */
/* -------------------------------------------------------------------------- */

export const setLanguageLimits = mutation({
  args: {
    code: v.string(),
    limits: v.array(
      v.object({
        languageKey: v.string(),
        timeLimit: v.number(),
        memoryLimit: v.number(),
      }),
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile, problem } = await requireProblemEditor(ctx, args.code);

    for (const existing of await ctx.db
      .query("languageLimits")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect()) {
      await ctx.db.delete(existing._id);
    }

    for (const limit of args.limits) {
      await ctx.db.insert("languageLimits", {
        problemId: problem._id,
        languageId: await languageIdByKey(ctx, limit.languageKey),
        timeLimit: limit.timeLimit,
        memoryLimit: limit.memoryLimit,
      });
    }

    await writeProblemRevision(ctx, problem._id, profile._id, args.reason ?? "Changed language limits.");

    return { ok: true };
  },
});

export const setTranslation = mutation({
  args: {
    code: v.string(),
    language: v.string(),
    name: v.string(),
    description: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile, problem } = await requireProblemEditor(ctx, args.code);

    const existing = await ctx.db
      .query("problemTranslations")
      .withIndex("by_problem_language", (q) => q.eq("problemId", problem._id).eq("language", args.language))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name, description: args.description });
    } else {
      await ctx.db.insert("problemTranslations", {
        problemId: problem._id,
        language: args.language,
        name: args.name,
        description: args.description,
      });
    }

    await writeProblemRevision(
      ctx,
      problem._id,
      profile._id,
      args.reason ?? `Edited the ${args.language} translation.`,
    );

    return { ok: true };
  },
});

export const deleteTranslation = mutation({
  args: { code: v.string(), language: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { profile, problem } = await requireProblemEditor(ctx, args.code);

    const existing = await ctx.db
      .query("problemTranslations")
      .withIndex("by_problem_language", (q) => q.eq("problemId", problem._id).eq("language", args.language))
      .unique();

    if (existing) await ctx.db.delete(existing._id);
    await writeProblemRevision(
      ctx,
      problem._id,
      profile._id,
      args.reason ?? `Removed the ${args.language} translation.`,
    );

    return { ok: true };
  },
});

export const addClarification = mutation({
  args: {
    code: v.string(),
    description: v.string(),
    date: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile, problem } = await requireProblemEditor(ctx, args.code);

    const id = await ctx.db.insert("problemClarifications", {
      problemId: problem._id,
      description: args.description,
      date: args.date ?? Date.now(),
    });

    await writeProblemRevision(ctx, problem._id, profile._id, args.reason ?? "Added a clarification.");

    return { id };
  },
});

export const deleteClarification = mutation({
  args: {
    code: v.string(),
    clarificationId: v.id("problemClarifications"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile, problem } = await requireProblemEditor(ctx, args.code);
    const existing = await ctx.db.get(args.clarificationId);

    if (!existing || existing.problemId !== problem._id) throw notFound("Clarification");
    await ctx.db.delete(args.clarificationId);
    await writeProblemRevision(ctx, problem._id, profile._id, args.reason ?? "Removed a clarification.");

    return { ok: true };
  },
});

export const setEditorial = mutation({
  args: {
    code: v.string(),
    content: v.string(),
    isPublic: v.optional(v.boolean()),
    publishOn: v.optional(v.number()),
    authors: v.optional(v.array(v.string())),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile, problem } = await requireProblemEditor(ctx, args.code);
    const existing = await solutionFor(ctx, problem._id);
    const authors = args.authors ? await profileIdsFor(ctx, args.authors) : null;

    if (existing) {
      const patch: Partial<Doc<"solutions">> = { content: args.content };

      if (args.isPublic !== undefined) patch.isPublic = args.isPublic;

      if (args.publishOn !== undefined) patch.publishOn = args.publishOn;

      if (authors) patch.authorProfileIds = authors.ids;
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("solutions", {
        problemId: problem._id,
        isPublic: args.isPublic ?? true,
        publishOn: args.publishOn ?? Date.now(),
        authorProfileIds: authors?.ids ?? [],
        content: args.content,
      });
    }

    await writeProblemRevision(ctx, problem._id, profile._id, args.reason ?? "Edited the editorial.");

    return { ok: true, warnings: authors?.missing ?? [] };
  },
});

export const deleteEditorial = mutation({
  args: { code: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { profile, problem } = await requireProblemEditor(ctx, args.code);
    const existing = await solutionFor(ctx, problem._id);

    if (existing) await ctx.db.delete(existing._id);
    await writeProblemRevision(ctx, problem._id, profile._id, args.reason ?? "Removed the editorial.");

    return { ok: true };
  },
});

/* -------------------------------------------------------------------------- */
/* Rejudge and rescore                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `jobs.run` reads the row's `type` and schedules the runner that owns it.
 * Naming the function rather than importing it keeps `convex/jobs.ts` out of
 * this module's imports.
 */
const jobsRun = makeFunctionReference<"mutation">("jobs:run");

async function scheduleJob(
  ctx: MutationCtx,
  type: string,
  args: JobArgs,
  createdByProfileId: Id<"profiles">,
): Promise<Id<"jobs">> {
  const jobId = await ctx.db.insert("jobs", {
    type,
    status: "queued",
    progress: { done: 0, total: 0, stage: "queued" },
    args,
    createdByProfileId,
    createdAt: Date.now(),
  });

  await ctx.scheduler.runAfter(0, jobsRun, { jobId });

  return jobId;
}

/** `RejudgeSubmissionsView`: DMOJ's filter set, handed to the batch runner. */
export const rejudgeAll = mutation({
  args: {
    code: v.string(),
    idRange: v.optional(v.object({ start: v.number(), end: v.number() })),
    languages: v.optional(v.array(v.string())),
    results: v.optional(v.array(v.string())),
    archiveLocked: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile, viewer, problem } = await requireProblemEditor(ctx, args.code);

    // `ManageProblemSubmissionMixin`: Problem.is_subs_manageable_by.
    if (!hasPerm(viewer.core, "judge.rejudge_submission")) {
      throw forbidden("Missing permission judge.rejudge_submission.");
    }

    if (!hasPerm(viewer.core, "judge.rejudge_submission_lot")) {
      throw forbidden("Missing permission judge.rejudge_submission_lot.");
    }

    const jobId = await scheduleJob(
      ctx,
      "rejudge",
      {
        problemCode: problem.code,
        idRange: args.idRange ?? null,
        languages: args.languages ?? [],
        results: args.results ?? [],
        archiveLocked: args.archiveLocked ?? false,
      },
      profile._id,
    );

    await writeProblemRevision(
      ctx,
      problem._id,
      profile._id,
      args.reason ?? "Scheduled a rejudge of every submission.",
    );

    return { jobId };
  },
});

/** `RescoreAllSubmissionsView`. */
export const rescoreAll = mutation({
  args: { code: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { profile, viewer, problem } = await requireProblemEditor(ctx, args.code);

    if (!hasPerm(viewer.core, "judge.rejudge_submission")) {
      throw forbidden("Missing permission judge.rejudge_submission.");
    }

    const jobId = await scheduleJob(ctx, "rescore", { problemCode: problem.code }, profile._id);
    await writeProblemRevision(
      ctx,
      problem._id,
      profile._id,
      args.reason ?? "Scheduled a rescore of every submission.",
    );

    return { jobId };
  },
});

/**
 * `PreviewRejudgeSubmissionsView`: how many submissions the filter would touch.
 */
export const rejudgePreview = query({
  args: {
    code: v.string(),
    idRange: v.optional(v.object({ start: v.number(), end: v.number() })),
    languages: v.optional(v.array(v.string())),
    results: v.optional(v.array(v.string())),
    archiveLocked: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { viewer, problem } = await requireProblemEditor(ctx, args.code);

    if (!hasPerm(viewer.core, "judge.rejudge_submission")) {
      throw forbidden("Missing permission judge.rejudge_submission.");
    }

    const languageIds = new Set<string>();

    for (const key of args.languages ?? []) {
      const row = await ctx.db
        .query("languages")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();

      if (row) languageIds.add(row._id);
    }

    const results = new Set(args.results ?? []);

    const submissions = await ctx.db
      .query("submissions")
      .withIndex("by_problem_date", (q) => q.eq("problemId", problem._id))
      .take(20_000);

    let count = 0;

    for (const submission of submissions) {
      if (languageIds.size > 0 && !languageIds.has(submission.languageId)) continue;

      if (results.size > 0 && !(submission.result && results.has(submission.result))) continue;

      if (!args.archiveLocked && submission.lockedAfter !== undefined) continue;
      count += 1;
    }

    return { count, total: submissions.length };
  },
});

/* -------------------------------------------------------------------------- */
/* Revisions                                                                  */
/* -------------------------------------------------------------------------- */

export const revisions = query({
  args: { code: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { problem } = await requireProblemEditor(ctx, args.code);
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 50), 200));

    const rows = await ctx.db
      .query("revisions")
      .withIndex("by_entity", (q) => q.eq("entityType", "problem").eq("entityId", problem._id))
      .order("desc")
      .take(limit);

    const out = [];

    for (const row of rows) {
      const author = row.authorProfileId ? await ctx.db.get(row.authorProfileId) : null;
      out.push({
        id: row._id,
        createdAt: row.createdAt,
        reason: row.reason,
        author: author ? { username: author.username, displayRank: author.displayRank } : null,
        // The console diffs consecutive snapshots itself; the server never
        // computes a diff, so any two revisions can be compared.
        snapshot: row.snapshot,
      });
    }

    return { problemCode: problem.code, revisions: out };
  },
});

/** The console's problem list: everything the viewer may edit. */
export const editable = query({
  args: { search: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { viewer } = await requireStaffViewer(ctx);
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 100), 500));
    const search = (args.search ?? "").trim().toLowerCase();

    const rows = (await ctx.db.query("problems").take(20_000)).filter((row) => {
      if (!problemIsInEditableSet(toCoreProblem(row), viewer.core)) return false;

      if (!search) return true;

      return row.code.includes(search) || row.name.toLowerCase().includes(search);
    });

    rows.sort((a, b) => a.code.localeCompare(b.code));

    const out = [];

    for (const row of rows.slice(0, limit)) {
      const group = await ctx.db.get(row.groupId);
      out.push({
        id: row._id,
        code: row.code,
        name: row.name,
        points: row.points,
        isPublic: row.isPublic,
        isManuallyManaged: row.isManuallyManaged,
        isOrganizationPrivate: row.isOrganizationPrivate,
        group: group?.name ?? null,
        date: row.date,
        userCount: row.userCount,
        acRate: row.acRate,
      });
    }

    return { items: out, total: rows.length };
  },
});

/** Contest appearances, for the console's problem detail page. */
export const contestUsage = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const { problem } = await requireProblemEditor(ctx, code);

    const links = await ctx.db
      .query("contestProblems")
      .withIndex("by_problem", (q) => q.eq("problemId", problem._id))
      .collect();

    const out = [];

    for (const link of links) {
      const contest = await ctx.db.get(link.contestId);

      if (!contest) continue;

      const siblings = await ctx.db
        .query("contestProblems")
        .withIndex("by_contest_order", (q) => q.eq("contestId", contest._id))
        .collect();

      siblings.sort((a, b) => a.order - b.order);
      const index = siblings.findIndex((row) => row._id === link._id);
      out.push({
        contestKey: contest.key,
        contestName: contest.name,
        label: labelFor(contest, index < 0 ? link.order : index),
        points: link.points,
        startTime: contest.startTime,
      });
    }

    out.sort((a, b) => b.startTime - a.startTime);

    return out;
  },
});
