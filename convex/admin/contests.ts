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
  CONTEST_KEY_PATTERN,
  contestByKey,
  describeFormatError,
  labelForProblem,
  loadContestProblems,
  toContestRow,
  toViewerRowInContest,
} from "../contests/formats";
import { hasPerm, optionalViewer, requireViewer } from "../lib/auth";
import { writeRevision } from "../lib/community";
import { forbidden, invalid, mojError, notFound } from "../lib/errors";
import { isJsonObject, type MaybeJson } from "../lib/json";
import {
  contestEntry,
  contestFreeze,
  contestJoinLimit,
  contestLabels,
  contestRating,
  contestSchedule,
  scoreboardVisibility,
} from "../schema";

/* -------------------------------------------------------------------------- */
/* Field validators                                                           */
/* -------------------------------------------------------------------------- */

/** The fields a contest's editor may write, as the document stores them. */
const plainWritable = {
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  summary: v.optional(v.union(v.string(), v.null())),
  startTime: v.optional(v.number()),
  endTime: v.optional(v.number()),
  schedule: v.optional(contestSchedule),
  authorProfileIds: v.optional(v.array(v.id("profiles"))),
  curatorProfileIds: v.optional(v.array(v.id("profiles"))),
  testerProfileIds: v.optional(v.array(v.id("profiles"))),
  spectatorProfileIds: v.optional(v.array(v.id("profiles"))),
  testerSeeScoreboard: v.optional(v.boolean()),
  testerSeeSubmissions: v.optional(v.boolean()),
  isVisible: v.optional(v.boolean()),
  joinLimit: v.optional(v.union(contestJoinLimit, v.null())),
  freeze: v.optional(v.union(contestFreeze, v.null())),
  rating: v.optional(v.union(contestRating, v.null())),
  labels: v.optional(contestLabels),
  alwaysAdmitProfileIds: v.optional(v.array(v.id("profiles"))),
  viewContestSubmissionsProfileIds: v.optional(v.array(v.id("profiles"))),
  scoreboardVisibility: v.optional(scoreboardVisibility),
  useClarifications: v.optional(v.boolean()),
  hideProblemTags: v.optional(v.boolean()),
  hideProblemAuthors: v.optional(v.boolean()),
  disableLockdown: v.optional(v.boolean()),
  runPretestsOnly: v.optional(v.boolean()),
  tagIds: v.optional(v.array(v.id("contestTags"))),
  accessCode: v.optional(v.union(v.string(), v.null())),
  bannedProfileIds: v.optional(v.array(v.id("profiles"))),
  formatName: v.optional(v.string()),
  formatConfig: v.optional(v.any()),
  lockedAfter: v.optional(v.union(v.number(), v.null())),
  pointsPrecision: v.optional(v.number()),
  proctorRequired: v.optional(v.boolean()),
};

/** `entry` is apart because writing it also writes the index projection `isOpenEntry`. */
const writable = { ...plainWritable, entry: v.optional(contestEntry) };

/** `create` takes these three explicitly, so they are dropped from the spread. */
const {
  name: _writableName,
  startTime: _writableStartTime,
  endTime: _writableEndTime,
  ...writableOptional
} = writable;

type WritablePatch = Partial<Doc<"contests">>;

type PlainField = keyof typeof plainWritable & keyof Doc<"contests">;

/**
 * Every writable field as the mutations receive it: absent when it was not
 * sent, and null on the ones whose validator spells "unset" that way.
 */
type ContestWriteArgs = { [K in PlainField]?: Doc<"contests">[K] | null } & {
  readonly entry?: Doc<"contests">["entry"];
};

/**
 * `Object.keys` widens to `string[]` so that a value with extra properties
 * still typechecks; the objects here are literals declared in this module.
 */
function keysOf<T extends object>(value: T): (keyof T & string)[] {
  // SAFETY: `value` is an object literal declared above with no index signature,
  // so its own enumerable keys are exactly `keyof T`.
  return Object.keys(value) as (keyof T & string)[];
}

const PLAIN_FIELDS = keysOf(plainWritable);

/**
 * Fields the schema requires to be present, where a null is the value itself.
 *
 * `formatConfig` is `v.any()` and not optional, and `create` stores null for a
 * format that takes no configuration. Clearing it instead removed the field, so
 * saving any contest on the default format wrote a document the schema refused.
 */
const NULL_IS_A_VALUE = new Set<string>(["formatConfig"]);

function copyField<K extends PlainField>(patch: WritablePatch, args: ContestWriteArgs, key: K): void {
  const value = args[key];

  if (value === undefined) return;
  // A null is how the validators spell "clear this field"; Convex unsets it.
  patch[key] = value === null && !NULL_IS_A_VALUE.has(key) ? undefined : value;
}

/** Turn the argument object into a patch, dropping keys that were not sent. */
function buildPatch(args: ContestWriteArgs): WritablePatch {
  const patch: WritablePatch = {};

  for (const key of PLAIN_FIELDS) copyField(patch, args, key);

  if (args.entry !== undefined) {
    patch.entry = args.entry;
    patch.isOpenEntry = args.entry.kind === "open";
  }

  return patch;
}

async function requireEditable(ctx: MutationCtx, key: string) {
  const profile = await requireViewer(ctx);
  const contest = await contestByKey(ctx, key);

  if (!contest) throw notFound(`Contest "${key}"`);
  const viewer = await toViewerRowInContest(ctx, profile);

  if (!contestIsEditableBy(toContestRow(contest), viewer)) throw forbidden();

  return { profile, contest, viewer };
}

function sameJson(left: MaybeJson, right: MaybeJson): boolean {
  if (left === right) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => sameJson(item, right[index]));
  }

  if (isJsonObject(left) && isJsonObject(right)) {
    const keys = Object.keys(left);

    return keys.length === Object.keys(right).length && keys.every((key) => sameJson(left[key], right[key]));
  }

  return false;
}

/** Guard the fields DMOJ gates behind their own permission. */
function checkGatedFields(
  patch: WritablePatch,
  before: Doc<"contests"> | null,
  viewer: Awaited<ReturnType<typeof toViewerRowInContest>>,
): void {
  const changed = (field: "isVisible" | "lockedAfter" | "accessCode" | "rating"): boolean =>
    field in patch && (!before || !sameJson(patch[field] ?? null, before[field] ?? null));

  if (changed("isVisible") && !hasPermCode(viewer, "judge.change_contest_visibility")) {
    throw forbidden("Missing permission judge.change_contest_visibility.");
  }

  if (changed("lockedAfter") && !hasPermCode(viewer, "judge.lock_contest")) {
    throw forbidden("Missing permission judge.lock_contest.");
  }

  if (changed("accessCode") && !hasPermCode(viewer, "judge.contest_access_code")) {
    throw forbidden("Missing permission judge.contest_access_code.");
  }

  const entryKind = patch.entry?.kind ?? before?.entry.kind ?? "open";

  if (entryKind !== (before?.entry.kind ?? "open") && !hasPermCode(viewer, "judge.create_private_contest")) {
    throw forbidden("Missing permission judge.create_private_contest.");
  }

  if (changed("rating")) {
    if (!hasPermCode(viewer, "judge.contest_rating")) {
      throw forbidden("Missing permission judge.contest_rating.");
    }

    const ceilingBefore = before?.rating?.performanceCeiling;

    if (
      patch.rating?.performanceCeiling !== ceilingBefore &&
      !hasPermCode(viewer, "judge.override_performance_ceiling")
    ) {
      throw forbidden("Missing permission judge.override_performance_ceiling.");
    }
  }
}

function hasPermCode(viewer: Awaited<ReturnType<typeof toViewerRowInContest>>, code: string): boolean {
  if (!viewer) return false;

  if (viewer.isSuperuser) return true;

  return viewer.permissions.includes(code);
}

/** The value a field will have once the patch lands: the patch's if it was sent, else the stored one. */
function after<K extends keyof Doc<"contests">>(
  patch: WritablePatch,
  before: Doc<"contests"> | null,
  field: K,
): Doc<"contests">[K] | undefined {
  return field in patch ? patch[field] : before?.[field];
}

function validateTiming(patch: WritablePatch, before: Doc<"contests"> | null): void {
  const startTime = after(patch, before, "startTime");
  const endTime = after(patch, before, "endTime");

  if (startTime !== undefined && endTime !== undefined && endTime <= startTime) {
    throw invalid("The contest must end after it starts.");
  }

  const schedule = after(patch, before, "schedule");

  if (schedule?.kind === "window" && schedule.seconds <= 0) {
    throw invalid("A per-participant window must be longer than zero.");
  }

  const freeze = after(patch, before, "freeze");

  if (freeze) {
    if (freeze.minutes <= 0) throw invalid("A freeze must be longer than zero; remove it for none.");

    // `freezeTime` clamps a freeze this long to the contest start, so the whole
    // contest is frozen and the scoreboard never moves at all.
    if (startTime !== undefined && endTime !== undefined && freeze.minutes * 60_000 >= endTime - startTime) {
      throw invalid("The freeze must be shorter than the contest.");
    }
  }

  const precision = after(patch, before, "pointsPrecision") ?? 3;

  if (precision < 0 || precision > 10) throw invalid("Points precision must be between 0 and 10.");
}

function validateAudience(patch: WritablePatch, before: Doc<"contests"> | null): void {
  const entry = after(patch, before, "entry");

  if (
    entry?.kind === "restricted" &&
    entry.organizationIds.length === 0 &&
    entry.classIds.length === 0 &&
    entry.profileIds.length === 0
  ) {
    throw invalid("A restricted contest must name an organisation, a class or a person.");
  }

  const joinLimit = after(patch, before, "joinLimit");

  if (joinLimit && joinLimit.organizationIds.length === 0) {
    throw invalid("A join limit must name an organisation; remove it to let anyone who can enter join.");
  }

  const rating = after(patch, before, "rating");

  if (rating?.floor !== undefined && rating.ceiling !== undefined && rating.floor > rating.ceiling) {
    throw invalid("The rating floor cannot be above the ceiling.");
  }
}

function validateFormat(patch: WritablePatch, before: Doc<"contests"> | null): void {
  const formatName = after(patch, before, "formatName") ?? "default";
  const formatConfig = after(patch, before, "formatConfig");

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
  isOpenEntry: boolean;
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
        isRated: contest.rating !== undefined,
        isOpenEntry: contest.isOpenEntry,
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
        label: labelForProblem(contest, index),
      });
    }

    return { contest, problems };
  },
});

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

    if (!CONTEST_KEY_PATTERN.test(key) || key.length > 20) {
      throw invalid("Contest id must be lowercase letters and digits, at most 20 characters.");
    }

    if (await contestByKey(ctx, key)) throw mojError("CONFLICT", "That contest id is already taken.");

    const patch = buildPatch(args);
    checkGatedFields(patch, null, viewer);
    validateTiming({ ...patch, startTime: args.startTime, endTime: args.endTime }, null);
    validateAudience(patch, null);
    validateFormat(patch, null);

    const entry = patch.entry ?? { kind: "open" };

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
      schedule: patch.schedule ?? { kind: "together" },
      isVisible: patch.isVisible ?? false,
      entry,
      isOpenEntry: entry.kind === "open",
      joinLimit: patch.joinLimit,
      freeze: patch.freeze,
      rating: patch.rating,
      labels: patch.labels ?? { kind: "letters" },
      alwaysAdmitProfileIds: patch.alwaysAdmitProfileIds ?? [],
      viewContestSubmissionsProfileIds: patch.viewContestSubmissionsProfileIds ?? [],
      scoreboardVisibility: patch.scoreboardVisibility ?? "V",
      useClarifications: patch.useClarifications ?? true,
      hideProblemTags: patch.hideProblemTags ?? false,
      hideProblemAuthors: patch.hideProblemAuthors ?? false,
      disableLockdown: patch.disableLockdown ?? false,
      runPretestsOnly: patch.runPretestsOnly ?? false,
      tagIds: patch.tagIds ?? [],
      userCount: 0,
      summary: patch.summary,
      accessCode: patch.accessCode,
      bannedProfileIds: patch.bannedProfileIds ?? [],
      formatName: patch.formatName ?? "default",
      formatConfig: "formatConfig" in patch ? patch.formatConfig : null,
      lockedAfter: patch.lockedAfter,
      pointsPrecision: patch.pointsPrecision ?? 3,
      proctorRequired: patch.proctorRequired ?? false,
    });

    await writeRevision(
      ctx,
      "contest",
      contestId,
      await snapshotContest(ctx, contestId),
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
    const patch = buildPatch(args);

    if (Object.keys(patch).length === 0) return null;

    checkGatedFields(patch, contest, viewer);
    validateTiming(patch, contest);
    validateAudience(patch, contest);
    validateFormat(patch, contest);

    await ctx.db.patch(contest._id, patch);
    await writeRevision(
      ctx,
      "contest",
      contest._id,
      await snapshotContest(ctx, contest._id),
      profile._id,
      args.reason ?? "Edited contest",
    );

    return null;
  },
});

/**
 * The whole contest, as a revision records it.
 *
 * `RevisionsPanel` compares any two snapshots field by field, which is the model
 * `snapshotProblem` in admin/problems.ts is written for. Contest revisions used
 * to store nine different shapes instead — `update` stored `{ before, after }`,
 * `setVisibility` stored `{ isVisible }`, `addProblem` stored the code it added
 * — so comparing two of them rendered a pair of raw JSON blobs rather than a
 * diff. Every contest mutation stores this now, so any two are comparable.
 *
 * Ids are resolved to the names they are chosen by, for the same reason: a diff
 * of two lists of document ids tells the reader nothing.
 */
async function snapshotContest(ctx: MutationCtx, contestId: Id<"contests">) {
  const contest = await ctx.db.get(contestId);

  if (!contest) return null;

  const usernames = async (ids: readonly Id<"profiles">[]) => {
    const out: string[] = [];

    for (const id of ids) {
      const row = await ctx.db.get(id);

      if (row) out.push(row.username);
    }

    return out.sort();
  };

  const namesOf = async <T extends "organizations" | "classes" | "contestTags">(
    ids: readonly Id<T>[],
    nameOf: (row: Doc<T>) => string,
  ) => {
    const out: string[] = [];

    for (const id of ids) {
      const row = await ctx.db.get(id);

      if (row) out.push(nameOf(row));
    }

    return out.sort();
  };

  const contestProblems = await loadContestProblems(ctx, contestId);
  const problems: { code: string; points: number; partial: boolean; isPretested: boolean }[] = [];

  for (const contestProblem of contestProblems) {
    const problem = await ctx.db.get(contestProblem.problemId);

    if (problem) {
      problems.push({
        code: problem.code,
        points: contestProblem.points,
        partial: contestProblem.partial,
        isPretested: contestProblem.isPretested,
      });
    }
  }

  return {
    key: contest.key,
    name: contest.name,
    description: contest.description,
    summary: contest.summary ?? null,
    startTime: contest.startTime,
    endTime: contest.endTime,
    schedule: contest.schedule,
    lockedAfter: contest.lockedAfter ?? null,
    isVisible: contest.isVisible,
    entry:
      contest.entry.kind === "open"
        ? { kind: "open" }
        : {
            kind: "restricted",
            match: contest.entry.match,
            organizations: await namesOf(contest.entry.organizationIds, (row) => row.slug),
            classes: await namesOf(contest.entry.classIds, (row) => row.name),
            people: await usernames(contest.entry.profileIds),
          },
    accessCode: contest.accessCode ?? null,
    joinLimit: contest.joinLimit
      ? { organizations: await namesOf(contest.joinLimit.organizationIds, (row) => row.slug) }
      : null,
    rating: contest.rating
      ? {
          everyone: contest.rating.everyone,
          excluded: await usernames(contest.rating.excludeProfileIds),
          floor: contest.rating.floor ?? null,
          ceiling: contest.rating.ceiling ?? null,
          performanceCeiling: contest.rating.performanceCeiling ?? null,
        }
      : null,
    scoreboardVisibility: contest.scoreboardVisibility,
    freeze: contest.freeze ?? null,
    formatName: contest.formatName,
    formatConfig: contest.formatConfig ?? null,
    labels: contest.labels,
    pointsPrecision: contest.pointsPrecision,
    runPretestsOnly: contest.runPretestsOnly,
    useClarifications: contest.useClarifications,
    hideProblemTags: contest.hideProblemTags,
    hideProblemAuthors: contest.hideProblemAuthors,
    disableLockdown: contest.disableLockdown ?? false,
    proctorRequired: contest.proctorRequired ?? false,
    testerSeeScoreboard: contest.testerSeeScoreboard,
    testerSeeSubmissions: contest.testerSeeSubmissions,
    authors: await usernames(contest.authorProfileIds),
    curators: await usernames(contest.curatorProfileIds),
    testers: await usernames(contest.testerProfileIds),
    spectators: await usernames(contest.spectatorProfileIds),
    bannedUsers: await usernames(contest.bannedProfileIds),
    alwaysAdmit: await usernames(contest.alwaysAdmitProfileIds),
    viewContestSubmissions: await usernames(contest.viewContestSubmissionsProfileIds),
    tags: await namesOf(contest.tagIds, (row) => row.name),
    problems,
  };
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
      await snapshotContest(ctx, contest._id),
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
      await snapshotContest(ctx, contest._id),
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
      await snapshotContest(ctx, contest._id),
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
      await snapshotContest(ctx, contest._id),
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
      await snapshotContest(ctx, contest._id),
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
    const known = new Set(rows.map((row) => row._id));

    if (order.length !== rows.length || order.some((id) => !known.has(id))) {
      throw invalid("The new order must list every problem in the contest exactly once.");
    }

    for (const [index, id] of order.entries()) await ctx.db.patch(id, { order: index });
    await writeRevision(
      ctx,
      "contest",
      contest._id,
      await snapshotContest(ctx, contest._id),
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
    await writeRevision(
      ctx,
      "contest",
      contest._id,
      await snapshotContest(ctx, contest._id),
      profile._id,
      reason ?? "Rescored contest",
    );

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
    await writeRevision(
      ctx,
      "contest",
      contest._id,
      await snapshotContest(ctx, contest._id),
      profile._id,
      reason ?? "Rated contest",
    );

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
      await snapshotContest(ctx, contest._id),
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
