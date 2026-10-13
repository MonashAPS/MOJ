/**
 * Organisation standings for a hall scoreboard event
 * (`/scoreboard/[event]/organizations`): each organisation's entrants pooled
 * per problem with diminishing points, summed over the event's contests. The
 * maths is `@moj/core`'s `organizationStandings.ts`; this loads the rows and
 * applies the hall board's visibility and freeze.
 *
 * Scores come from each live participation's `formatData`, so a problem counts
 * for whatever the contest's format made of it. While a division is frozen, a
 * viewer who may not run the reveal gets every participation rescored from its
 * pre-freeze submissions, with the cells the ceremony has shown restored.
 */

import {
  canReveal as canRevealContests,
  entrantOrganization,
  freezeOffsetFor,
  organizationStandings,
  PARTICIPATION_LIVE,
  type ProblemScores,
  problemScores,
  updateParticipation,
} from "@moj/core";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { type QueryCtx, query } from "../_generated/server";
import {
  contestSubmissionRows,
  labelForProblem,
  loadContestProblems,
  problemListAccessFor,
  toContestProblemRow,
  toContestRow,
  toParticipationRow,
  toViewerRowInContest,
} from "../contests/formats";
import { isStaff, optionalViewer } from "../lib/auth";
import { loadViewerContext } from "../problems";
import { canNameProblem, eventByKey, eventContests, persistedReveals } from "../scoreboard";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export type StandingsProblem = {
  contestKey: string;
  /** Empty, with the name, while the viewer may not see the problem; the label always shows. */
  code: string;
  name: string;
  label: string;
  points: number;
};

export type StandingsOrganization = {
  id: Id<"organizations">;
  slug: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  rank: number;
  total: number;
  /** The organisation's score on each problem, one per `problems` entry in the same order. */
  problems: { contestKey: string; code: string; score: number }[];
  /** Its entrants' own totals, best first. */
  entrants: { username: string; displayName: string; total: number }[];
};

export type OrganizationStandingsPayload = {
  event: { key: string; name: string };
  decay: number;
  /** Some division is frozen for this viewer, so its scores stop at the freeze. */
  frozen: boolean;
  contests: { key: string; name: string; startTime: number; endTime: number }[];
  problems: StandingsProblem[];
  organizations: StandingsOrganization[];
} | null;

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

/** When a division's hall-board freeze starts, or null when it has none or staff lifted it. */
function freezeCutoff(contest: Doc<"contests">, eventFreezeMinutes: number): number | null {
  const freezeMinutes = contest.reveal?.lifted ? 0 : eventFreezeMinutes;

  if (freezeMinutes <= 0) return null;

  return contest.startTime + freezeOffsetFor(contest, freezeMinutes) * 1000;
}

/**
 * A participation's scores as the frozen board stands: rescored from what it
 * submitted before the freeze, except the cells the reveal has already shown.
 */
async function frozenScores(
  ctx: QueryCtx,
  contest: Doc<"contests">,
  contestProblems: Doc<"contestProblems">[],
  participation: Doc<"contestParticipations">,
  cutoff: number,
): Promise<ProblemScores> {
  const submissions = await contestSubmissionRows(ctx, participation._id, contest.formatName);

  const update = updateParticipation({
    participation: toParticipationRow(participation),
    submissions: submissions.filter((submission) => submission.date < cutoff),
    contestProblems: contestProblems.map((row) => toContestProblemRow(row)),
    contest: toContestRow(contest),
  });

  const scores = problemScores(update.formatData);
  const live = problemScores(participation.formatData);

  for (const reveal of persistedReveals(contest)) {
    if (reveal.participationId !== participation._id) continue;
    const link = contestProblems[reveal.cellIndex];

    if (link) scores[link._id] = live[link._id] ?? 0;
  }

  return scores;
}

type Entrant = { profile: Doc<"profiles">; scores: ProblemScores };

/* -------------------------------------------------------------------------- */
/* Query                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The standings for one event, or null when the event has none or the viewer
 * may not see it. Like the hall board, it ignores the contests' own scoreboard
 * policies: a public event is public.
 */
export const standings = query({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<OrganizationStandingsPayload> => {
    const now = Date.now();
    const row = await eventByKey(ctx, key);
    const config = row?.organizationStandings;

    if (!row || !config) return null;

    const profile = await optionalViewer(ctx);

    if (!row.isPublic && !isStaff(profile)) return null;

    const viewer = await toViewerRowInContest(ctx, profile);
    const contests = await eventContests(ctx, row);
    const seesThroughFreeze = canRevealContests(viewer, contests.map(toContestRow));
    const problemViewer = await loadViewerContext(ctx);

    const problems: StandingsProblem[] = [];
    const problemIds: Id<"contestProblems">[] = [];
    const entrants = new Map<string, Entrant>();
    let frozen = false;

    for (const contest of contests) {
      const contestProblems = await loadContestProblems(ctx, contest._id);

      const access = problemListAccessFor(
        contest,
        profile,
        viewer,
        problemViewer.contest?._id === contest._id,
        now,
      );

      for (const [index, link] of contestProblems.entries()) {
        const problem = await ctx.db.get(link.problemId);
        const named = await canNameProblem(ctx, contest, problem, access, problemViewer);

        problems.push({
          contestKey: contest.key,
          code: named ? (problem?.code ?? "") : "",
          name: named ? (problem?.name ?? "") : "",
          label: labelForProblem(contest, index),
          points: link.points,
        });
        problemIds.push(link._id);
      }

      const cutoff = freezeCutoff(contest, row.freezeMinutes);
      const frozenAt = !seesThroughFreeze && cutoff !== null && now >= cutoff ? cutoff : null;

      if (frozenAt !== null) frozen = true;

      const participations = (
        await ctx.db
          .query("contestParticipations")
          .withIndex("by_contest_virtual_score", (q) =>
            q.eq("contestId", contest._id).eq("virtual", PARTICIPATION_LIVE),
          )
          .collect()
      ).filter((participation) => !participation.isDisqualified);

      for (const participation of participations) {
        const scores =
          frozenAt === null
            ? problemScores(participation.formatData)
            : await frozenScores(ctx, contest, contestProblems, participation, frozenAt);

        const known = entrants.get(participation.profileId);

        if (known) {
          Object.assign(known.scores, scores);
          continue;
        }

        const entrant = await ctx.db.get(participation.profileId);

        if (entrant) entrants.set(entrant._id, { profile: entrant, scores });
      }
    }

    const organizationOf = new Map<string, Id<"organizations">>();

    for (const entrant of entrants.values()) {
      const memberships = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_profile", (q) => q.eq("profileId", entrant.profile._id))
        .collect();

      const counted = entrantOrganization(memberships, config.organizationIds);
      const membership = memberships.find((row) => row.organizationId === counted);

      if (membership) organizationOf.set(entrant.profile._id, membership.organizationId);
    }

    // Listed organisations keep their order; with none listed, every one an
    // entrant counts for appears, by name.
    const wanted = config.organizationIds.length
      ? config.organizationIds
      : [...new Set(organizationOf.values())];

    const organizations: Doc<"organizations">[] = [];

    for (const id of wanted) {
      const organization = await ctx.db.get(id);

      if (organization) organizations.push(organization);
    }

    if (!config.organizationIds.length) organizations.sort((a, b) => a.name.localeCompare(b.name));

    const ranked = organizationStandings({
      decay: config.decay,
      problemIds,
      organizationIds: organizations.map((organization) => organization._id),
      entrants: [...entrants.values()]
        .sort((a, b) => a.profile.username.localeCompare(b.profile.username))
        .map((entrant) => ({
          id: entrant.profile._id,
          organizationId: organizationOf.get(entrant.profile._id) ?? null,
          scores: entrant.scores,
        })),
    });

    const organizationById = new Map<string, Doc<"organizations">>(
      organizations.map((organization) => [organization._id, organization]),
    );

    return {
      event: { key: row.key, name: row.name },
      decay: config.decay,
      frozen,
      contests: contests.map((contest) => ({
        key: contest.key,
        name: contest.name,
        startTime: contest.startTime,
        endTime: contest.endTime,
      })),
      problems,
      organizations: ranked.flatMap((standing) => {
        const organization = organizationById.get(standing.organizationId);

        if (!organization) return [];

        return {
          id: organization._id,
          slug: organization.slug,
          name: organization.name,
          shortName: organization.shortName,
          logoUrl: organization.logoOverrideImage || null,
          rank: standing.rank,
          total: standing.total,
          problems: standing.problems.map((score, index) => ({
            contestKey: problems[index]?.contestKey ?? "",
            code: problems[index]?.code ?? "",
            score,
          })),
          entrants: standing.entrants.flatMap((member) => {
            const entrant = entrants.get(member.id);

            if (!entrant) return [];

            return {
              username: entrant.profile.username,
              displayName: entrant.profile.usernameDisplayOverride || entrant.profile.username,
              total: member.total,
            };
          }),
        };
      }),
    };
  },
});
