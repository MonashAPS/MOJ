/**
 * Staff console: contests (SPEC section 8).
 *
 * Every mutation checks `contestIsEditableBy` or the matching DMOJ permission
 * and writes a `revisions` row with a reason, which is what
 * `judge/admin/contest.py` gets from django-reversion.
 */

import { contestIsEditableBy, validateContestFormatConfig } from "@moj/core";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { type MutationCtx, mutation, query } from "../_generated/server";
import {
  contestByKey,
  describeFormatError,
  loadContestProblems,
  toContestRow,
  toViewerRowInContest,
} from "../contests/formats";
import { hasPerm, optionalViewer, requireViewer } from "../lib/auth";
import { forbidden, invalid, mojError, notFound } from "../lib/errors";
import { labelScheme, scoreboardVisibility } from "../schema";

const KEY_PATTERN = /^[a-z0-9]+$/;

/* -------------------------------------------------------------------------- */
/* Field validators                                                           */
/* -------------------------------------------------------------------------- */

const writable = {
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  summary: v.optional(v.union(v.string(), v.null())),
  startTime: v.optional(v.number()),
  endTime: v.optional(v.number()),
  timeLimit: v.optional(v.union(v.number(), v.null())),
  authorProfileIds: v.optional(v.array(v.id("profiles"))),
  curatorProfileIds: v.optional(v.array(v.id("profiles"))),
  testerProfileIds: v.optional(v.array(v.id("profiles"))),
  spectatorProfileIds: v.optional(v.array(v.id("profiles"))),
  testerSeeScoreboard: v.optional(v.boolean()),
  testerSeeSubmissions: v.optional(v.boolean()),
  isVisible: v.optional(v.boolean()),
  isRated: v.optional(v.boolean()),
  viewContestScoreboardProfileIds: v.optional(v.array(v.id("profiles"))),
  viewContestSubmissionsProfileIds: v.optional(v.array(v.id("profiles"))),
  scoreboardVisibility: v.optional(scoreboardVisibility),
  useClarifications: v.optional(v.boolean()),
  ratingFloor: v.optional(v.union(v.number(), v.null())),
  ratingCeiling: v.optional(v.union(v.number(), v.null())),
  performanceCeilingOverride: v.optional(v.union(v.number(), v.null())),
  rateAll: v.optional(v.boolean()),
  rateExcludeProfileIds: v.optional(v.array(v.id("profiles"))),
  isPrivate: v.optional(v.boolean()),
  privateContestantProfileIds: v.optional(v.array(v.id("profiles"))),
  hideProblemTags: v.optional(v.boolean()),
  hideProblemAuthors: v.optional(v.boolean()),
  runPretestsOnly: v.optional(v.boolean()),
  showShortDisplay: v.optional(v.boolean()),
  isOrganizationPrivate: v.optional(v.boolean()),
  organizationIds: v.optional(v.array(v.id("organizations"))),
  limitJoinOrganizations: v.optional(v.boolean()),
  joinOrganizationIds: v.optional(v.array(v.id("organizations"))),
  classIds: v.optional(v.array(v.id("classes"))),
  ogImage: v.optional(v.union(v.string(), v.null())),
  logoOverrideImage: v.optional(v.union(v.string(), v.null())),
  tagIds: v.optional(v.array(v.id("contestTags"))),
  accessCode: v.optional(v.union(v.string(), v.null())),
  bannedProfileIds: v.optional(v.array(v.id("profiles"))),
  formatName: v.optional(v.string()),
  formatConfig: v.optional(v.any()),
  labelScheme: v.optional(labelScheme),
  customLabels: v.optional(v.array(v.string())),
  lockedAfter: v.optional(v.union(v.number(), v.null())),
  pointsPrecision: v.optional(v.number()),
  freezeMinutes: v.optional(v.number()),
  blindDuringFreeze: v.optional(v.boolean()),
  proctorRequired: v.optional(v.boolean()),
};

/** `create` takes these three explicitly, so they are dropped from the spread. */
const {
  name: _writableName,
  startTime: _writableStartTime,
  endTime: _writableEndTime,
  ...writableOptional
} = writable;

type WritablePatch = Partial<Doc<"contests">>;

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

/** Turn the argument object into a patch, dropping keys that were not sent. */
function buildPatch(args: Record<string, unknown>): WritablePatch {
  const patch: Record<string, unknown> = {};
  const nullable = new Set([
    "summary",
    "timeLimit",
    "ratingFloor",
    "ratingCeiling",
    "performanceCeilingOverride",
    "ogImage",
    "logoOverrideImage",
    "accessCode",
    "lockedAfter",
  ]);
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) continue;
    if (!(key in writable)) continue;
    patch[key] = nullable.has(key) ? nullToUndefined(value) : value;
  }
  return patch as WritablePatch;
}

async function requireEditable(ctx: MutationCtx, key: string) {
  const profile = await requireViewer(ctx);
  const contest = await contestByKey(ctx, key);
  if (!contest) throw notFound(`Contest "${key}"`);
  const viewer = await toViewerRowInContest(ctx, profile);
  if (!contestIsEditableBy(toContestRow(contest), viewer)) throw forbidden();
  return { profile, contest, viewer };
}

async function writeRevision(
  ctx: MutationCtx,
  entityType: string,
  entityId: string,
  snapshot: unknown,
  authorProfileId: Id<"profiles">,
  reason: string,
): Promise<void> {
  await ctx.db.insert("revisions", {
    entityType,
    entityId,
    snapshot,
    authorProfileId,
    reason: reason.trim() || "Edited from the staff console",
    createdAt: Date.now(),
  });
}

/** Guard the fields DMOJ gates behind their own permission. */
function checkGatedFields(
  patch: WritablePatch,
  before: Doc<"contests"> | null,
  viewer: Awaited<ReturnType<typeof toViewerRowInContest>>,
): void {
  const changed = <K extends keyof Doc<"contests">>(field: K): boolean =>
    field in patch && (!before || patch[field] !== before[field]);

  if (changed("isVisible") && !hasPermCode(viewer, "judge.change_contest_visibility")) {
    throw forbidden("Missing permission judge.change_contest_visibility.");
  }
  if (changed("lockedAfter") && !hasPermCode(viewer, "judge.lock_contest")) {
    throw forbidden("Missing permission judge.lock_contest.");
  }
  if (changed("accessCode") && !hasPermCode(viewer, "judge.contest_access_code")) {
    throw forbidden("Missing permission judge.contest_access_code.");
  }
  if (changed("performanceCeilingOverride") && !hasPermCode(viewer, "judge.override_performance_ceiling")) {
    throw forbidden("Missing permission judge.override_performance_ceiling.");
  }
  if (
    (changed("isPrivate") || changed("isOrganizationPrivate")) &&
    !hasPermCode(viewer, "judge.create_private_contest")
  ) {
    throw forbidden("Missing permission judge.create_private_contest.");
  }
}

function hasPermCode(viewer: Awaited<ReturnType<typeof toViewerRowInContest>>, code: string): boolean {
  if (!viewer) return false;
  if (viewer.isSuperuser) return true;
  return viewer.permissions.includes(code);
}

function validateTiming(patch: WritablePatch, before: Doc<"contests"> | null): void {
  const startTime = patch.startTime ?? before?.startTime;
  const endTime = patch.endTime ?? before?.endTime;
  if (startTime !== undefined && endTime !== undefined && endTime <= startTime) {
    throw invalid("The contest must end after it starts.");
  }
  const freezeMinutes = patch.freezeMinutes ?? before?.freezeMinutes ?? 0;
  if (freezeMinutes < 0) throw invalid("The freeze cannot be negative.");
  const precision = patch.pointsPrecision ?? before?.pointsPrecision ?? 3;
  if (precision < 0 || precision > 10) throw invalid("Points precision must be between 0 and 10.");
}

function validateFormat(patch: WritablePatch, before: Doc<"contests"> | null): void {
  const formatName = patch.formatName ?? before?.formatName ?? "default";
  const formatConfig = "formatConfig" in patch ? patch.formatConfig : before?.formatConfig;
  try {
    validateContestFormatConfig(formatName, formatConfig);
  } catch (error) {
    throw invalid(describeFormatError(error));
  }
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

export type AdminContestRow = {
  _id: Id<"contests">;
  key: string;
  name: string;
  startTime: number;
  endTime: number;
  isVisible: boolean;
  isRated: boolean;
  isPrivate: boolean;
  isOrganizationPrivate: boolean;
  userCount: number;
  formatName: string;
  problemCount: number;
};

export const list = query({
  args: {
    search: v.optional(v.string()),
    paginationOpts: v.optional(v.object({ numItems: v.number(), cursor: v.union(v.string(), v.null()) })),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ page: AdminContestRow[]; isDone: boolean; continueCursor: string; total: number }> => {
    const profile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);
    const all = await ctx.db.query("contests").collect();
    const editable = all.filter((contest) => contestIsEditableBy(toContestRow(contest), viewer));

    const needle = (args.search ?? "").trim().toLowerCase();
    const filtered = needle
      ? editable.filter(
          (contest) =>
            contest.name.toLowerCase().includes(needle) || contest.key.toLowerCase().includes(needle),
        )
      : editable;
    filtered.sort((a, b) => b.startTime - a.startTime || a.key.localeCompare(b.key));

    const numItems = Math.max(1, Math.min(args.paginationOpts?.numItems ?? 50, 200));
    const offset = Number.parseInt(args.paginationOpts?.cursor ?? "0", 10) || 0;
    const slice = filtered.slice(offset, offset + numItems);

    const page: AdminContestRow[] = [];
    for (const contest of slice) {
      const problems = await loadContestProblems(ctx, contest._id);
      page.push({
        _id: contest._id,
        key: contest.key,
        name: contest.name,
        startTime: contest.startTime,
        endTime: contest.endTime,
        isVisible: contest.isVisible,
        isRated: contest.isRated,
        isPrivate: contest.isPrivate,
        isOrganizationPrivate: contest.isOrganizationPrivate,
        userCount: contest.userCount,
        formatName: contest.formatName,
        problemCount: problems.length,
      });
    }

    return {
      page,
      isDone: offset + numItems >= filtered.length,
      continueCursor: String(offset + numItems),
      total: filtered.length,
    };
  },
});

export type AdminContestDetail = {
  contest: Doc<"contests">;
  problems: (Doc<"contestProblems"> & { code: string; name: string; label: string })[];
} | null;

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<AdminContestDetail> => {
    const profile = await optionalViewer(ctx);
    const contest = await contestByKey(ctx, key);
    if (!contest) return null;
    const viewer = await toViewerRowInContest(ctx, profile);
    if (!contestIsEditableBy(toContestRow(contest), viewer)) return null;

    const rows = await loadContestProblems(ctx, contest._id);
    const problems: (Doc<"contestProblems"> & { code: string; name: string; label: string })[] = [];
    for (const [index, row] of rows.entries()) {
      const problem = await ctx.db.get(row.problemId);
      problems.push({
        ...row,
        code: problem?.code ?? "",
        name: problem?.name ?? "",
        label: labelOf(contest, index),
      });
    }
    return { contest, problems };
  },
});

function labelOf(contest: Doc<"contests">, index: number): string {
  if (contest.labelScheme === "numbers") return String(index + 1);
  if (contest.labelScheme === "custom") return contest.customLabels[index] ?? letters(index);
  return letters(index);
}

function letters(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    label = String.fromCharCode(((value - 1) % 26) + 65) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

/* -------------------------------------------------------------------------- */
/* Create and update                                                          */
/* -------------------------------------------------------------------------- */

export const create = mutation({
  args: {
    key: v.string(),
    name: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    reason: v.optional(v.string()),
    ...writableOptional,
  },
  handler: async (ctx, args): Promise<{ contestId: Id<"contests">; key: string }> => {
    const profile = await requireViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);
    if (!hasPerm(profile, "judge.edit_own_contest") && !hasPerm(profile, "judge.edit_all_contest")) {
      throw forbidden("Missing permission judge.edit_own_contest.");
    }

    const key = args.key.trim();
    if (!KEY_PATTERN.test(key) || key.length > 20) {
      throw invalid("Contest id must be lowercase letters and digits, at most 20 characters.");
    }
    if (await contestByKey(ctx, key)) throw mojError("CONFLICT", "That contest id is already taken.");

    const patch = buildPatch(args as Record<string, unknown>);
    checkGatedFields(patch, null, viewer);
    validateTiming({ ...patch, startTime: args.startTime, endTime: args.endTime }, null);
    validateFormat(patch, null);

    const contestId = await ctx.db.insert("contests", {
      key,
      name: args.name,
      authorProfileIds: patch.authorProfileIds ?? [profile._id],
      curatorProfileIds: patch.curatorProfileIds ?? [],
      testerProfileIds: patch.testerProfileIds ?? [],
      spectatorProfileIds: patch.spectatorProfileIds ?? [],
      testerSeeScoreboard: patch.testerSeeScoreboard ?? false,
      testerSeeSubmissions: patch.testerSeeSubmissions ?? false,
      description: patch.description ?? "",
      startTime: args.startTime,
      endTime: args.endTime,
      timeLimit: patch.timeLimit,
      isVisible: patch.isVisible ?? false,
      isRated: patch.isRated ?? false,
      viewContestScoreboardProfileIds: patch.viewContestScoreboardProfileIds ?? [],
      viewContestSubmissionsProfileIds: patch.viewContestSubmissionsProfileIds ?? [],
      scoreboardVisibility: patch.scoreboardVisibility ?? "V",
      useClarifications: patch.useClarifications ?? true,
      ratingFloor: patch.ratingFloor,
      ratingCeiling: patch.ratingCeiling,
      performanceCeilingOverride: patch.performanceCeilingOverride,
      rateAll: patch.rateAll ?? false,
      rateExcludeProfileIds: patch.rateExcludeProfileIds ?? [],
      isPrivate: patch.isPrivate ?? false,
      privateContestantProfileIds: patch.privateContestantProfileIds ?? [],
      hideProblemTags: patch.hideProblemTags ?? false,
      hideProblemAuthors: patch.hideProblemAuthors ?? false,
      runPretestsOnly: patch.runPretestsOnly ?? false,
      showShortDisplay: patch.showShortDisplay ?? false,
      isOrganizationPrivate: patch.isOrganizationPrivate ?? false,
      organizationIds: patch.organizationIds ?? [],
      limitJoinOrganizations: patch.limitJoinOrganizations ?? false,
      joinOrganizationIds: patch.joinOrganizationIds ?? [],
      classIds: patch.classIds ?? [],
      ogImage: patch.ogImage,
      logoOverrideImage: patch.logoOverrideImage,
      tagIds: patch.tagIds ?? [],
      userCount: 0,
      summary: patch.summary,
      accessCode: patch.accessCode,
      bannedProfileIds: patch.bannedProfileIds ?? [],
      formatName: patch.formatName ?? "default",
      formatConfig: "formatConfig" in patch ? patch.formatConfig : null,
      labelScheme: patch.labelScheme ?? "letters",
      customLabels: patch.customLabels ?? [],
      lockedAfter: patch.lockedAfter,
      pointsPrecision: patch.pointsPrecision ?? 3,
      freezeMinutes: patch.freezeMinutes ?? 0,
      blindDuringFreeze: patch.blindDuringFreeze ?? false,
    });

    await writeRevision(
      ctx,
      "contest",
      contestId,
      { key, name: args.name },
      profile._id,
      args.reason ?? "Created contest",
    );
    return { contestId, key };
  },
});

export const update = mutation({
  args: { key: v.string(), reason: v.optional(v.string()), ...writable },
  handler: async (ctx, args): Promise<null> => {
    const { profile, contest, viewer } = await requireEditable(ctx, args.key);
    const patch = buildPatch(args as Record<string, unknown>);
    if (Object.keys(patch).length === 0) return null;

    checkGatedFields(patch, contest, viewer);
    validateTiming(patch, contest);
    validateFormat(patch, contest);

    await ctx.db.patch(contest._id, patch);
    await writeRevision(
      ctx,
      "contest",
      contest._id,
      { before: pick(contest, Object.keys(patch)), after: patch },
      profile._id,
      args.reason ?? "Edited contest",
    );
    return null;
  },
});

function pick(row: Doc<"contests">, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = (row as unknown as Record<string, unknown>)[key];
  return out;
}

export const setVisibility = mutation({
  args: { key: v.string(), isVisible: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, { key, isVisible, reason }): Promise<null> => {
    const { profile, contest, viewer } = await requireEditable(ctx, key);
    if (!hasPermCode(viewer, "judge.change_contest_visibility")) {
      throw forbidden("Missing permission judge.change_contest_visibility.");
    }
    await ctx.db.patch(contest._id, { isVisible });
    await writeRevision(
      ctx,
      "contest",
      contest._id,
      { isVisible },
      profile._id,
      reason ?? (isVisible ? "Made contest visible" : "Hid contest"),
    );
    return null;
  },
});

/** `judge.lock_contest`: `locked_after` freezes submissions after a moment. */
export const setLocked = mutation({
  args: {
    key: v.string(),
    lockedAfter: v.union(v.number(), v.null()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { key, lockedAfter, reason }): Promise<null> => {
    const { profile, contest, viewer } = await requireEditable(ctx, key);
    if (!hasPermCode(viewer, "judge.lock_contest")) {
      throw forbidden("Missing permission judge.lock_contest.");
    }
    await ctx.db.patch(contest._id, { lockedAfter: lockedAfter ?? undefined });
    await writeRevision(
      ctx,
      "contest",
      contest._id,
      { lockedAfter },
      profile._id,
      reason ?? (lockedAfter === null ? "Unlocked contest" : "Locked contest"),
    );
    return null;
  },
});

/* -------------------------------------------------------------------------- */
/* Contest problems                                                           */
/* -------------------------------------------------------------------------- */

export const addProblem = mutation({
  args: {
    key: v.string(),
    problemCode: v.string(),
    points: v.number(),
    partial: v.optional(v.boolean()),
    isPretested: v.optional(v.boolean()),
    maxSubmissions: v.optional(v.union(v.number(), v.null())),
    outputPrefixOverride: v.optional(v.union(v.number(), v.null())),
    order: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"contestProblems">> => {
    const { profile, contest } = await requireEditable(ctx, args.key);
    const problem = await ctx.db
      .query("problems")
      .withIndex("by_code", (q) => q.eq("code", args.problemCode))
      .unique();
    if (!problem) throw notFound(`Problem "${args.problemCode}"`);

    const existing = await loadContestProblems(ctx, contest._id);
    if (existing.some((row) => row.problemId === problem._id)) {
      throw mojError("CONFLICT", "That problem is already in this contest.");
    }
    if (args.maxSubmissions !== undefined && args.maxSubmissions !== null && args.maxSubmissions < 1) {
      throw invalid("Why include a problem you can't submit to?");
    }

    const id = await ctx.db.insert("contestProblems", {
      contestId: contest._id,
      problemId: problem._id,
      points: args.points,
      partial: args.partial ?? true,
      isPretested: args.isPretested ?? false,
      order: args.order ?? existing.length,
      outputPrefixOverride: args.outputPrefixOverride ?? undefined,
      maxSubmissions: args.maxSubmissions ?? undefined,
    });

    await writeRevision(
      ctx,
      "contest",
      contest._id,
      { addedProblem: problem.code, points: args.points },
      profile._id,
      args.reason ?? `Added problem ${problem.code}`,
    );
    return id;
  },
});

export const updateProblem = mutation({
  args: {
    key: v.string(),
    contestProblemId: v.id("contestProblems"),
    points: v.optional(v.number()),
    partial: v.optional(v.boolean()),
    isPretested: v.optional(v.boolean()),
    maxSubmissions: v.optional(v.union(v.number(), v.null())),
    outputPrefixOverride: v.optional(v.union(v.number(), v.null())),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> => {
    const { profile, contest } = await requireEditable(ctx, args.key);
    const row = await ctx.db.get(args.contestProblemId);
    if (!row || row.contestId !== contest._id) throw notFound("Contest problem");

    const patch: Partial<Doc<"contestProblems">> = {};
    if (args.points !== undefined) patch.points = args.points;
    if (args.partial !== undefined) patch.partial = args.partial;
    if (args.isPretested !== undefined) patch.isPretested = args.isPretested;
    if (args.maxSubmissions !== undefined) {
      if (args.maxSubmissions !== null && args.maxSubmissions < 1) {
        throw invalid("Why include a problem you can't submit to?");
      }
      patch.maxSubmissions = args.maxSubmissions ?? undefined;
    }
    if (args.outputPrefixOverride !== undefined) {
      patch.outputPrefixOverride = args.outputPrefixOverride ?? undefined;
    }
    if (Object.keys(patch).length === 0) return null;

    await ctx.db.patch(args.contestProblemId, patch);
    await writeRevision(
      ctx,
      "contest",
      contest._id,
      { contestProblemId: args.contestProblemId, patch },
      profile._id,
      args.reason ?? "Edited contest problem",
    );
    return null;
  },
});

export const removeProblem = mutation({
  args: {
    key: v.string(),
    contestProblemId: v.id("contestProblems"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { key, contestProblemId, reason }): Promise<null> => {
    const { profile, contest } = await requireEditable(ctx, key);
    const row = await ctx.db.get(contestProblemId);
    if (!row || row.contestId !== contest._id) throw notFound("Contest problem");

    await ctx.db.delete(contestProblemId);
    // Close the gap so the labels stay contiguous.
    const remaining = await loadContestProblems(ctx, contest._id);
    for (const [index, entry] of remaining.entries()) {
      if (entry.order !== index) await ctx.db.patch(entry._id, { order: index });
    }

    await writeRevision(
      ctx,
      "contest",
      contest._id,
      { removedProblemId: row.problemId },
      profile._id,
      reason ?? "Removed contest problem",
    );
    return null;
  },
});

export const reorderProblems = mutation({
  args: {
    key: v.string(),
    order: v.array(v.id("contestProblems")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { key, order, reason }): Promise<null> => {
    const { profile, contest } = await requireEditable(ctx, key);
    const rows = await loadContestProblems(ctx, contest._id);
    const known = new Set(rows.map((row) => row._id as string));
    if (order.length !== rows.length || order.some((id) => !known.has(id))) {
      throw invalid("The new order must list every problem in the contest exactly once.");
    }
    for (const [index, id] of order.entries()) await ctx.db.patch(id, { order: index });
    await writeRevision(
      ctx,
      "contest",
      contest._id,
      { order },
      profile._id,
      reason ?? "Reordered contest problems",
    );
    return null;
  },
});

/* -------------------------------------------------------------------------- */
/* Jobs: rescore, rate, rejudge                                               */
/* -------------------------------------------------------------------------- */

export const rescore = mutation({
  args: { key: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { key, reason }): Promise<{ jobId: Id<"jobs">; total: number }> => {
    const { profile, contest } = await requireEditable(ctx, key);
    const participations = await ctx.db
      .query("contestParticipations")
      .withIndex("by_contest_virtual_score", (q) => q.eq("contestId", contest._id))
      .collect();

    const jobId = await ctx.db.insert("jobs", {
      type: "rescore",
      status: "queued",
      progress: { done: 0, total: participations.length, stage: "Recalculating contest scores" },
      args: { contestId: contest._id, key: contest.key },
      createdByProfileId: profile._id,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.jobs.contests.rescoreChunk, {
      jobId,
      contestId: contest._id,
      cursor: 0,
    });
    await writeRevision(ctx, "contest", contest._id, {}, profile._id, reason ?? "Rescored contest");
    return { jobId, total: participations.length };
  },
});

export const rate = mutation({
  args: { key: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { key, reason }): Promise<{ jobId: Id<"jobs"> }> => {
    const profile = await requireViewer(ctx);
    if (!hasPerm(profile, "judge.contest_rating")) {
      throw forbidden("Missing permission judge.contest_rating.");
    }
    const contest = await contestByKey(ctx, key);
    if (!contest) throw notFound(`Contest "${key}"`);

    const jobId = await ctx.db.insert("jobs", {
      type: "rateContest",
      status: "queued",
      progress: { done: 0, total: 1, stage: "Rating contests" },
      args: { contestId: contest._id, key: contest.key },
      createdByProfileId: profile._id,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.jobs.contests.rateContestJob, {
      jobId,
      contestId: contest._id,
    });
    await writeRevision(ctx, "contest", contest._id, {}, profile._id, reason ?? "Rated contest");
    return { jobId };
  },
});

export const rejudgeProblem = mutation({
  args: {
    key: v.string(),
    contestProblemId: v.id("contestProblems"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { key, contestProblemId, reason }): Promise<{ jobId: Id<"jobs">; total: number }> => {
    const { profile, contest } = await requireEditable(ctx, key);
    const row = await ctx.db.get(contestProblemId);
    if (!row || row.contestId !== contest._id) throw notFound("Contest problem");

    const submissions = (
      await ctx.db
        .query("submissions")
        .withIndex("by_contest_date", (q) => q.eq("contestId", contest._id))
        .collect()
    ).filter((entry) => entry.contestProblemId === contestProblemId);

    const jobId = await ctx.db.insert("jobs", {
      type: "rejudge",
      status: "queued",
      progress: { done: 0, total: submissions.length, stage: "Rejudging submissions" },
      args: { contestId: contest._id, contestProblemId },
      createdByProfileId: profile._id,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.jobs.contests.rejudgeContestProblemChunk, {
      jobId,
      contestId: contest._id,
      contestProblemId,
      cursor: 0,
    });
    await writeRevision(
      ctx,
      "contest",
      contest._id,
      { contestProblemId },
      profile._id,
      reason ?? "Rejudged contest problem",
    );
    return { jobId, total: submissions.length };
  },
});

/* -------------------------------------------------------------------------- */
/* Contest tags                                                               */
/* -------------------------------------------------------------------------- */

export const tags = query({
  args: {},
  handler: async (ctx): Promise<Doc<"contestTags">[]> => {
    const rows = await ctx.db.query("contestTags").collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

async function requireTagEditor(ctx: MutationCtx) {
  const profile = await requireViewer(ctx);
  if (!hasPerm(profile, "judge.edit_all_contest")) {
    throw forbidden("Missing permission judge.edit_all_contest.");
  }
  return profile;
}

export const createTag = mutation({
  args: {
    name: v.string(),
    color: v.string(),
    description: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { name, color, description, reason }): Promise<Id<"contestTags">> => {
    const profile = await requireTagEditor(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw invalid("A tag needs a name.");
    const existing = await ctx.db
      .query("contestTags")
      .withIndex("by_name", (q) => q.eq("name", trimmed))
      .unique();
    if (existing) throw mojError("CONFLICT", "That tag already exists.");

    const id = await ctx.db.insert("contestTags", {
      name: trimmed,
      color,
      description: description ?? "",
    });
    await writeRevision(
      ctx,
      "contestTag",
      id,
      { name: trimmed, color },
      profile._id,
      reason ?? "Created tag",
    );
    return id;
  },
});

export const updateTag = mutation({
  args: {
    tagId: v.id("contestTags"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    description: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { tagId, name, color, description, reason }): Promise<null> => {
    const profile = await requireTagEditor(ctx);
    const tag = await ctx.db.get(tagId);
    if (!tag) throw notFound("Tag");

    const patch: Partial<Doc<"contestTags">> = {};
    if (name !== undefined) patch.name = name.trim();
    if (color !== undefined) patch.color = color;
    if (description !== undefined) patch.description = description;
    if (Object.keys(patch).length === 0) return null;

    await ctx.db.patch(tagId, patch);
    await writeRevision(ctx, "contestTag", tagId, patch, profile._id, reason ?? "Edited tag");
    return null;
  },
});

export const deleteTag = mutation({
  args: { tagId: v.id("contestTags"), reason: v.optional(v.string()) },
  handler: async (ctx, { tagId, reason }): Promise<null> => {
    const profile = await requireTagEditor(ctx);
    const tag = await ctx.db.get(tagId);
    if (!tag) throw notFound("Tag");

    const contests = await ctx.db.query("contests").collect();
    for (const contest of contests) {
      if (!contest.tagIds.includes(tagId)) continue;
      await ctx.db.patch(contest._id, {
        tagIds: contest.tagIds.filter((id) => id !== tagId),
      });
    }
    await ctx.db.delete(tagId);
    await writeRevision(ctx, "contestTag", tagId, { name: tag.name }, profile._id, reason ?? "Deleted tag");
    return null;
  },
});
