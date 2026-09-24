/**
 * The hall scoreboard (SPEC section 7): one page per event, one division per
 * contest, always scored ICPC-style regardless of each contest's own format.
 *
 * Ported from the DMOJ fork this replaces (MonashAPS/online-judge branch v2):
 * judge/views/live_scoreboard.py for the payload, judge/utils/frozen_scoreboard.py
 * for the scoring (now `@moj/core`'s `scoreboard.ts`) and
 * judge/views/live_scoreboard_tags.py for the badge editor. The fork's setting
 * becomes the `scoreboardEvents` table.
 *
 * The page subscribes to `event`; there is no polling anywhere.
 */

import {
  type Attempt,
  buildScoreboard,
  canReveal as canRevealContests,
  FROZEN,
  firstSolves,
  freezeOffsetFor,
  nextRevealTarget,
  PARTICIPATION_LIVE,
  penaltyMinutesFor,
  rankRows,
  type ScoreboardCell,
  type ScoreboardParticipant,
  type ScoreboardProblem,
  type ScoreboardRow,
  SOLVED,
} from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import {
  contestByKey,
  labelForProblem,
  loadContestProblems,
  problemListAccessFor,
  toContestRow,
  toViewerRowInContest,
} from "./contests/formats";
import { isStaff, optionalViewer, requireViewer } from "./lib/auth";
import { forbidden, invalid, notFound } from "./lib/errors";
import { canAccessProblem, canSeeContestAssociation, loadViewerContext } from "./problems";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export type ScoreboardBadge = { key: string; label: string };

export type BoardCell = {
  state: string;
  wrong: number;
  pending: number;
  time: number | null;
  penalty: number;
  firstBlood: boolean;
  /** Only ever present for a viewer who may run the reveal. */
  reveal?: { state: string; wrong: number; time: number | null; penalty: number };
};

export type BoardRow = {
  participationId: Id<"contestParticipations">;
  username: string;
  displayName: string;
  flag: string | null;
  badges: string[];
  inPerson: boolean;
  cells: BoardCell[];
  solved: number;
  penalty: number;
  rank: number;
};

export type Division = {
  contestId: Id<"contests">;
  key: string;
  name: string;
  label: string;
  problems: {
    contestProblemId: Id<"contestProblems">;
    label: string;
    code: string;
    name: string;
    points: number;
  }[];
  rows: BoardRow[];
  freezeOffset: number;
  duration: number;
  penaltyMinutes: number;
  isFrozen: boolean;
  isUnfrozen: boolean;
  hasStarted: boolean;
  hasEnded: boolean;
  inPersonCount: number;
  /** Frozen cells still to be revealed, for the ceremony's progress. */
  revealPending: number;
  revealedCount: number;
};

export type ScoreboardEventPayload = {
  event: {
    _id: Id<"scoreboardEvents">;
    key: string;
    name: string;
    theme: string;
    flagUrlTemplate: string | null;
    freezeMinutes: number;
    isPublic: boolean;
  };
  divisions: Division[];
  badges: ScoreboardBadge[];
  inPersonBadge: string | null;
  hasRoster: boolean;
  canReveal: boolean;
  canEditTags: boolean;
  warnings: string[];
  serverTime: number;
} | null;

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

export async function eventByKey(
  ctx: QueryCtx | MutationCtx,
  key: string,
): Promise<Doc<"scoreboardEvents"> | null> {
  return await ctx.db
    .query("scoreboardEvents")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

async function eventContests(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"scoreboardEvents">,
): Promise<Doc<"contests">[]> {
  const out: Doc<"contests">[] = [];

  for (const id of event.contestIds) {
    const contest = await ctx.db.get(id);

    if (contest) out.push(contest);
  }

  return out;
}

/**
 * `resolve_badges`: a slug that matches no organisation is dropped rather than
 * fatal, and reported to staff in the footer.
 */
async function resolveBadges(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"scoreboardEvents">,
): Promise<{
  badges: ScoreboardBadge[];
  organizations: Map<string, Doc<"organizations">>;
  inPersonKey: string | null;
  warnings: string[];
}> {
  const slugs = [...event.badgeOrganizationSlugs];

  if (event.inPersonOrganizationSlug) slugs.push(event.inPersonOrganizationSlug);

  const organizations = new Map<string, Doc<"organizations">>();

  for (const slug of new Set(slugs)) {
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (organization) organizations.set(slug, organization);
  }

  const warnings: string[] = [];
  const missing = [...new Set(slugs)].filter((slug) => !organizations.has(slug));

  if (missing.length) {
    warnings.push(`No organisation with slug(s): ${missing.sort().join(", ")}`);
  }

  const badges: ScoreboardBadge[] = [];

  for (const slug of event.badgeOrganizationSlugs) {
    const organization = organizations.get(slug);

    if (!organization) continue;
    badges.push({ key: slug, label: organization.shortName || organization.name });
  }

  let inPersonKey: string | null = null;

  if (event.inPersonOrganizationSlug) {
    if (organizations.has(event.inPersonOrganizationSlug)) {
      inPersonKey = event.inPersonOrganizationSlug;
    } else {
      warnings.push(
        `In-person organisation "${event.inPersonOrganizationSlug}" not found; the attendance toggle is hidden.`,
      );
    }
  }

  return { badges, organizations, inPersonKey, warnings };
}

function flagUrl(pattern: string | null | undefined, username: string): string | null {
  if (!pattern) return null;

  return pattern.replace("{username}", encodeURIComponent(username));
}

/** One cell the ceremony has shown, as the contest records it. */
export type PersistedReveal = NonNullable<Doc<"contests">["reveal"]>["cells"][number];

/** The reveals staff have already performed, as a list of their own. */
function persistedReveals(contest: Doc<"contests">): PersistedReveal[] {
  return [...(contest.reveal?.cells ?? [])];
}

/** Apply one recorded reveal in place; mirrors `applyReveal` in `@moj/core`. */
function applyRevealed(rows: ScoreboardRow[], reveal: PersistedReveal): boolean {
  const row = rows.find((candidate) => candidate.id === reveal.participationId);

  if (!row) return false;
  const cell = row.cells[reveal.cellIndex];

  if (!cell || cell.state !== FROZEN) return false;
  const truth = cell.reveal;

  if (truth) {
    cell.state = truth.state;
    cell.wrong = truth.wrong;
    cell.time = truth.time;
    cell.penalty = truth.penalty;
  } else {
    cell.state = "failed";
    cell.penalty = 0;
  }

  cell.pending = 0;
  cell.reveal = undefined;
  row.solved = row.cells.filter((entry) => entry.state === SOLVED).length;
  row.penalty = row.cells.reduce((sum, entry) => sum + (entry.state === SOLVED ? entry.penalty : 0), 0);

  return true;
}

type BuiltDivision = {
  contest: Doc<"contests">;
  rows: ScoreboardRow[];
  problems: ScoreboardProblem[];
  contestProblems: Doc<"contestProblems">[];
  /** The rows the board was built from: `ScoreboardRow.id` is an opaque string. */
  participations: Doc<"contestParticipations">[];
  freezeOffset: number;
  penaltyMinutes: number;
};

/**
 * `build_contest_payload`: one division's grid, always with the frozen truth
 * attached so the caller can decide whether to ship it.
 */
async function buildDivision(
  ctx: QueryCtx | MutationCtx,
  contest: Doc<"contests">,
  event: Doc<"scoreboardEvents">,
  badgeSlugs: readonly string[],
  inPersonKey: string | null,
): Promise<BuiltDivision> {
  const contestProblems = await loadContestProblems(ctx, contest._id);
  const problems: ScoreboardProblem[] = [];
  const maxPoints = new Map<string, number>();

  for (const [index, contestProblem] of contestProblems.entries()) {
    const problem = await ctx.db.get(contestProblem.problemId);
    problems.push({
      id: contestProblem._id,
      label: labelForProblem(contest, index),
      code: problem?.code ?? "",
      name: problem?.name ?? "",
      points: contestProblem.points,
    });
    maxPoints.set(contestProblem._id, contestProblem.points);
  }

  const participations = (
    await ctx.db
      .query("contestParticipations")
      .withIndex("by_contest_virtual_score", (q) =>
        q.eq("contestId", contest._id).eq("virtual", PARTICIPATION_LIVE),
      )
      .collect()
  ).filter((row) => !row.isDisqualified);

  const wanted = new Set<string>(badgeSlugs);

  if (inPersonKey) wanted.add(inPersonKey);

  const participants: ScoreboardParticipant[] = [];

  for (const participation of participations) {
    const profile = await ctx.db.get(participation.profileId);

    if (!profile) continue;

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();

    const slugs = new Set<string>();

    for (const membership of memberships) {
      const organization = await ctx.db.get(membership.organizationId);

      if (organization && wanted.has(organization.slug)) slugs.add(organization.slug);
    }

    participants.push({
      id: participation._id,
      username: profile.username,
      displayName: profile.usernameDisplayOverride || profile.username,
      flag: flagUrl(event.flagUrlTemplate, profile.username),
      badges: badgeSlugs.filter((slug) => slugs.has(slug)),
      inPerson: !!inPersonKey && slugs.has(inPersonKey),
    });
  }

  const liveParticipationIds = new Set(participations.map((row) => row._id));

  const submissions = await ctx.db
    .query("submissions")
    .withIndex("by_contest_date", (q) => q.eq("contestId", contest._id))
    .collect();

  const attempts: Attempt[] = [];

  for (const submission of submissions) {
    if (!submission.participationId || !liveParticipationIds.has(submission.participationId)) continue;

    if (!submission.contestProblemId) continue;

    if (submission.date < contest.startTime || submission.date > contest.endTime) continue;
    attempts.push({
      participation: submission.participationId,
      problem: submission.contestProblemId,
      time: (submission.date - contest.startTime) / 1000,
      points: submission.contestPoints ?? 0,
      result: submission.result ?? null,
      maxPoints: maxPoints.get(submission.contestProblemId) ?? 0,
    });
  }

  // The event's freeze wins over the contest's own, as the fork's config does.
  const freezeMinutes = contest.reveal?.lifted ? 0 : event.freezeMinutes;
  const freezeOffset = freezeOffsetFor(contest, freezeMinutes);
  const penaltyMinutes = penaltyMinutesFor(toContestRow(contest));

  const board = buildScoreboard({
    problems,
    participants,
    attempts,
    freezeOffset,
    penaltyMinutes,
    includeReveal: true,
  });

  for (const reveal of persistedReveals(contest)) applyRevealed(board.rows, reveal);
  rankRows(board.rows);

  return {
    contest,
    rows: board.rows,
    problems,
    contestProblems,
    participations,
    freezeOffset,
    penaltyMinutes,
  };
}

function serialiseDivision(built: BuiltDivision, includeReveal: boolean, now: number): Division {
  const contest = built.contest;
  const firsts = firstSolves(built.rows);

  const revealPending = built.rows.reduce(
    (count, row) => count + row.cells.filter((cell) => cell.state === FROZEN).length,
    0,
  );

  const participationIds = new Map<string, Id<"contestParticipations">>(
    built.participations.map((row) => [row._id, row._id]),
  );

  const contestProblemIds = new Map<string, Id<"contestProblems">>(
    built.contestProblems.map((row) => [row._id, row._id]),
  );

  const rows: BoardRow[] = built.rows.flatMap((row) => {
    const participationId = participationIds.get(row.id);

    if (participationId === undefined) return [];

    return {
      participationId,
      username: row.username,
      displayName: row.displayName ?? row.username,
      flag: row.flag ?? null,
      badges: [...(row.badges ?? [])],
      inPerson: row.inPerson === true,
      cells: row.cells.map((cell: ScoreboardCell, index: number) => ({
        state: cell.state,
        wrong: cell.wrong,
        pending: cell.pending,
        time: cell.time,
        penalty: cell.penalty,
        firstBlood: cell.state === SOLVED && cell.time !== null && firsts.get(index) === cell.time,
        reveal:
          includeReveal && cell.reveal
            ? {
                state: cell.reveal.state,
                wrong: cell.reveal.wrong,
                time: cell.reveal.time,
                penalty: cell.reveal.penalty,
              }
            : undefined,
      })),
      solved: row.solved,
      penalty: row.penalty,
      rank: row.rank,
    };
  });

  return {
    contestId: contest._id,
    key: contest.key,
    name: contest.name,
    label: contest.name,
    problems: built.problems.flatMap((problem, index) => {
      const contestProblemId = contestProblemIds.get(problem.id);

      if (contestProblemId === undefined) return [];

      return {
        contestProblemId,
        label: problem.label ?? String(index + 1),
        code: problem.code ?? "",
        name: problem.name ?? "",
        points: problem.points ?? 0,
      };
    }),
    rows,
    freezeOffset: built.freezeOffset,
    duration: (contest.endTime - contest.startTime) / 1000,
    penaltyMinutes: built.penaltyMinutes,
    isFrozen: revealPending > 0,
    isUnfrozen: contest.reveal?.lifted === true,
    hasStarted: contest.startTime <= now,
    hasEnded: contest.endTime < now,
    inPersonCount: rows.filter((row) => row.inPerson).length,
    revealPending,
    revealedCount: persistedReveals(contest).length,
  };
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

export type ScoreboardEventSummary = {
  _id: Id<"scoreboardEvents">;
  key: string;
  name: string;
  theme: string;
  isPublic: boolean;
  contestKeys: string[];
};

export const events = query({
  args: {},
  handler: async (ctx): Promise<ScoreboardEventSummary[]> => {
    const profile = await optionalViewer(ctx);
    const staff = isStaff(profile);
    const rows = await ctx.db.query("scoreboardEvents").collect();
    const out: ScoreboardEventSummary[] = [];

    for (const row of rows) {
      if (!row.isPublic && !staff) continue;
      const contestKeys: string[] = [];

      for (const id of row.contestIds) {
        const contest = await ctx.db.get(id);

        if (contest) contestKeys.push(contest.key);
      }

      out.push({
        _id: row._id,
        key: row.key,
        name: row.name,
        theme: row.theme,
        isPublic: row.isPublic,
        contestKeys,
      });
    }

    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * `LiveScoreboard` / `live_scoreboard_data`. Ignores the contest's scoreboard policy:
 * the URL is public the moment the event is configured.
 */
export const event = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<ScoreboardEventPayload> => {
    const now = Date.now();
    const row = await eventByKey(ctx, key);

    if (!row) return null;

    const profile = await optionalViewer(ctx);
    const viewer = await toViewerRowInContest(ctx, profile);

    if (!row.isPublic && !isStaff(profile)) return null;

    const contests = await eventContests(ctx, row);
    const canReveal = canRevealContests(viewer, contests.map(toContestRow));
    const { badges, inPersonKey, warnings } = await resolveBadges(ctx, row);
    const badgeSlugs = badges.map((badge) => badge.key);

    const divisions: Division[] = [];
    const problemViewer = await loadViewerContext(ctx);

    for (const contest of contests) {
      const built = await buildDivision(ctx, contest, row, badgeSlugs, inPersonKey);

      const access = problemListAccessFor(
        contest,
        profile,
        viewer,
        problemViewer.contest?._id === contest._id,
        now,
      );

      for (const [index, link] of built.contestProblems.entries()) {
        const problem = await ctx.db.get(link.problemId);

        if (
          !canSeeContestAssociation(contest, problemViewer) ||
          !problem ||
          (!access.privileged && !(await canAccessProblem(ctx, problem, problemViewer)))
        ) {
          const entry = built.problems[index];

          if (entry) built.problems[index] = { ...entry, code: "", name: "" };
        }
      }

      divisions.push(serialiseDivision(built, canReveal, now));
    }

    return {
      event: {
        _id: row._id,
        key: row.key,
        name: row.name,
        theme: row.theme,
        flagUrlTemplate: row.flagUrlTemplate ?? null,
        freezeMinutes: row.freezeMinutes,
        isPublic: row.isPublic,
      },
      divisions,
      badges,
      inPersonBadge: inPersonKey,
      hasRoster: !!inPersonKey,
      canReveal,
      canEditTags: canReveal,
      warnings: canReveal ? warnings : [],
      serverTime: now,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* The reveal ceremony                                                        */
/* -------------------------------------------------------------------------- */

async function requireRevealRights(
  ctx: MutationCtx,
  eventKey: string,
): Promise<{ event: Doc<"scoreboardEvents">; contests: Doc<"contests">[] }> {
  const profile = await requireViewer(ctx);
  const row = await eventByKey(ctx, eventKey);

  if (!row) throw notFound(`Scoreboard "${eventKey}"`);
  const viewer = await toViewerRowInContest(ctx, profile);
  const contests = await eventContests(ctx, row);

  if (!canRevealContests(viewer, contests.map(toContestRow))) {
    throw forbidden("You may not run the reveal for this scoreboard.");
  }

  return { event: row, contests };
}

function divisionsToTouch(contests: Doc<"contests">[], contestKey?: string): Doc<"contests">[] {
  if (!contestKey) return contests;
  const contest = contests.find((row) => row.key === contestKey);

  if (!contest) throw invalid(`"${contestKey}" is not a division of this scoreboard.`);

  return [contest];
}

/** Lifting the freeze forgets the ceremony's progress; freezing again keeps it. */
async function liftFreeze(ctx: MutationCtx, contest: Doc<"contests">, lifted: boolean): Promise<void> {
  await ctx.db.patch(contest._id, { reveal: { lifted, cells: lifted ? [] : persistedReveals(contest) } });
}

async function writeReveals(
  ctx: MutationCtx,
  contest: Doc<"contests">,
  cells: PersistedReveal[],
): Promise<void> {
  await ctx.db.patch(contest._id, { reveal: { lifted: contest.reveal?.lifted ?? false, cells } });
}

/** Reveal the next frozen cell, bottom-up, in one division. */
export const revealStep = mutation({
  args: { event: v.string(), contestKey: v.optional(v.string()) },
  handler: async (ctx, { event: eventKey, contestKey }): Promise<{ revealed: number; done: boolean }> => {
    const { event: row, contests } = await requireRevealRights(ctx, eventKey);
    const { badges, inPersonKey } = await resolveBadges(ctx, row);
    const badgeSlugs = badges.map((badge) => badge.key);

    let revealedCount = 0;
    let done = true;

    for (const contest of divisionsToTouch(contests, contestKey)) {
      const built = await buildDivision(ctx, contest, row, badgeSlugs, inPersonKey);
      const target = nextRevealTarget(built.rows);

      if (!target) continue;
      const targetRow = built.rows[target.rowIndex];

      if (!targetRow) continue;

      const revealed = [
        ...persistedReveals(contest),
        { participationId: targetRow.id, cellIndex: target.cellIndex },
      ];

      await writeReveals(ctx, contest, revealed);
      revealedCount += 1;

      // Anything left after this step?
      applyRevealed(built.rows, {
        participationId: targetRow.id,
        cellIndex: target.cellIndex,
      });

      if (nextRevealTarget(built.rows)) done = false;
    }

    return { revealed: revealedCount, done };
  },
});

/** Undo the last reveal in each touched division. */
export const revealUndo = mutation({
  args: { event: v.string(), contestKey: v.optional(v.string()) },
  handler: async (ctx, { event: eventKey, contestKey }): Promise<{ undone: number }> => {
    const { contests } = await requireRevealRights(ctx, eventKey);
    let undone = 0;

    for (const contest of divisionsToTouch(contests, contestKey)) {
      const revealed = persistedReveals(contest);

      if (revealed.length === 0) continue;
      revealed.pop();
      await writeReveals(ctx, contest, revealed);
      undone += 1;
    }

    return { undone };
  },
});

/** Reveal everything that is still frozen, as one step the undo cannot split. */
export const revealAll = mutation({
  args: { event: v.string(), contestKey: v.optional(v.string()) },
  handler: async (ctx, { event: eventKey, contestKey }): Promise<{ revealed: number }> => {
    const { event: row, contests } = await requireRevealRights(ctx, eventKey);
    const { badges, inPersonKey } = await resolveBadges(ctx, row);
    const badgeSlugs = badges.map((badge) => badge.key);

    let revealed = 0;

    for (const contest of divisionsToTouch(contests, contestKey)) {
      const built = await buildDivision(ctx, contest, row, badgeSlugs, inPersonKey);
      const entries = persistedReveals(contest);

      for (let target = nextRevealTarget(built.rows); target; target = nextRevealTarget(built.rows)) {
        const targetRow = built.rows[target.rowIndex];

        if (!targetRow) break;
        entries.push({ participationId: targetRow.id, cellIndex: target.cellIndex });
        applyRevealed(built.rows, {
          participationId: targetRow.id,
          cellIndex: target.cellIndex,
        });
        rankRows(built.rows);
        revealed += 1;
      }

      await writeReveals(ctx, contest, entries);
    }

    return { revealed };
  },
});

/**
 * Drop the freeze entirely: the board shows live results again, including
 * anything submitted after the freeze point.
 */
export const unfreeze = mutation({
  args: { event: v.string(), contestKey: v.optional(v.string()), frozen: v.optional(v.boolean()) },
  handler: async (ctx, { event: eventKey, contestKey, frozen }): Promise<{ contests: number }> => {
    const { contests } = await requireRevealRights(ctx, eventKey);
    const touched = divisionsToTouch(contests, contestKey);
    const revealed = frozen !== true;

    for (const contest of touched) await liftFreeze(ctx, contest, revealed);

    return { contests: touched.length };
  },
});

/* -------------------------------------------------------------------------- */
/* Badge editing                                                              */
/* -------------------------------------------------------------------------- */

export type TagState = {
  username: string;
  displayName: string;
  badges: string[];
  inPerson: boolean;
};

/**
 * `live_scoreboard_tags` (the fork's tag editor): toggle one competitor's
 * membership of one of the event's badge organisations. Only the event's own
 * badges may be touched, and only for a live, non-disqualified participant of
 * one of its contests.
 */
export const setTag = mutation({
  args: { event: v.string(), username: v.string(), slug: v.string(), on: v.boolean() },
  handler: async (ctx, { event: eventKey, username, slug, on }): Promise<TagState> => {
    const { event: row, contests } = await requireRevealRights(ctx, eventKey);
    const { badges, organizations, inPersonKey } = await resolveBadges(ctx, row);

    const editable = new Set(badges.map((badge) => badge.key));

    if (inPersonKey) editable.add(inPersonKey);

    if (!editable.has(slug)) {
      throw invalid(`Not an editable badge for this event: ${slug}`);
    }

    const organization = organizations.get(slug);

    if (!organization) throw notFound(`Organisation "${slug}"`);

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (!profile) throw notFound(`User "${username}"`);

    let competes = false;

    for (const contest of contests) {
      const rows = await ctx.db
        .query("contestParticipations")
        .withIndex("by_profile_contest", (q) => q.eq("profileId", profile._id).eq("contestId", contest._id))
        .collect();

      if (rows.some((entry) => entry.virtual === PARTICIPATION_LIVE && !entry.isDisqualified)) {
        competes = true;
        break;
      }
    }

    if (!competes) throw invalid(`${username} is not competing in this event.`);

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();

    const existing = memberships.find((entry) => entry.organizationId === organization._id);

    if (on && !existing) {
      await ctx.db.insert("organizationMemberships", {
        organizationId: organization._id,
        profileId: profile._id,
        order: memberships.length,
      });
      await ctx.db.patch(organization._id, { memberCount: organization.memberCount + 1 });
    } else if (!on && existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(organization._id, {
        memberCount: Math.max(0, organization.memberCount - 1),
      });
    }

    const after = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_profile", (q) => q.eq("profileId", profile._id))
      .collect();

    const slugs = new Set<string>();

    for (const membership of after) {
      const org = await ctx.db.get(membership.organizationId);

      if (org) slugs.add(org.slug);
    }

    return {
      username: profile.username,
      displayName: profile.usernameDisplayOverride || profile.username,
      badges: badges.map((badge) => badge.key).filter((key) => slugs.has(key)),
      inPerson: !!inPersonKey && slugs.has(inPersonKey),
    };
  },
});

/** Convenience for the contest page's own "unfreeze" button. */
export const unfreezeContest = mutation({
  args: { key: v.string(), revealed: v.boolean() },
  handler: async (ctx, { key, revealed }): Promise<null> => {
    const profile = await requireViewer(ctx);
    const contest = await contestByKey(ctx, key);

    if (!contest) throw notFound(`Contest "${key}"`);
    const viewer = await toViewerRowInContest(ctx, profile);

    if (!canRevealContests(viewer, [toContestRow(contest)])) throw forbidden();
    await liftFreeze(ctx, contest, revealed);

    return null;
  },
});
