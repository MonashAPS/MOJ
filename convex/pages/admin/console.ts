/**
 * The staff console's shell: who the viewer is, what they may do, and the
 * lookups every tab shares.
 *
 * `convex/admin/*` carries the mutations these screens call and the permission
 * rules with them. What the console needs on top is the shape a dense list or a
 * tabbed edit form wants in one round trip: names instead of ids, the option
 * lists a Select is built from, and the flags that decide which controls the
 * viewer is allowed to see at all.
 */

import { hasPerm } from "@moj/core";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { type QueryCtx, query } from "../../_generated/server";
import { loadViewerContext } from "../../problems";

type ViewerContext = Awaited<ReturnType<typeof loadViewerContext>>;

export async function staffViewer(ctx: QueryCtx): Promise<ViewerContext | null> {
  const viewer = await loadViewerContext(ctx);
  if (!viewer.profile) return null;
  if (!viewer.profile.isStaff && !viewer.profile.isSuperuser) return null;
  return viewer;
}

export async function usernamesOf(ctx: QueryCtx, ids: readonly Id<"profiles">[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    const row = await ctx.db.get(id);
    if (row) out.push(row.username);
  }
  return out;
}

/** The console's permission map: one call, so a tab can hide what it must. */
export function consolePermissions(viewer: ViewerContext) {
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
export const viewer = query({
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
