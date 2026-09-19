/**
 * A contest as its revisions record it: the whole row, with ids resolved to
 * the names they are chosen by.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { artefactSnapshot, artefactsOfContest } from "../artefacts/names";
import { loadContestProblems } from "./formats";

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
export async function snapshotContest(ctx: QueryCtx, contestId: Id<"contests">) {
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
    publishProblemsAtEnd: contest.publishProblemsAtEnd ?? false,
    problemsPublishedAt: contest.problemsPublishedAt ?? null,
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
    files: artefactSnapshot(await artefactsOfContest(ctx, contestId)),
  };
}
