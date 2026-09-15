/**
 * Read models for the console's contest screens: the edit form with every
 * profile id already resolved to a name, and the option lists its pickers offer.
 */

import { contestIsEditableBy } from "@moj/core";
import { v } from "convex/values";
import { query } from "../../_generated/server";
import { contestByKey, labelsForContest, toContestRow, toViewerRowInContest } from "../../contests/formats";
import { consolePermissions, staffViewer, usernamesOf } from "./console";

/** The contest edit form, with every profile id already resolved to a name. */
export const edit = query({
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
export const options = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await staffViewer(ctx);
    if (!viewer) return { organizations: [], classes: [], tags: [] };
    const [organizations, classes, tags] = await Promise.all([
      ctx.db.query("organizations").collect(),
      ctx.db.query("classes").collect(),
      ctx.db.query("contestTags").collect(),
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
    };
  },
});
