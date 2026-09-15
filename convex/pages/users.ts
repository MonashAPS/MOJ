/**
 * Queries the users and organisations pages need and that no backend module
 * already exposes.
 *
 * `organizationsFor` fills the organisation column DMOJ draws beside a username
 * on a ranking (`contest/ranking-table.html`'s `organization-column`), which the
 * leaderboard reuses; `dataExportDownload` turns the storage id
 * `profiles.dataExportStatus` returns into the link `/data/download/` sends the
 * browser to, because a storage URL can only be minted inside a function.
 */

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { requireViewer } from "../lib/auth";

/** One organisation as a username's suffix chip. */
export type ProfileOrganization = {
  slug: string;
  shortName: string;
  name: string;
  legacyId?: number;
};

/** The organisations of a page of ranked users, keyed by profile id. */
export const organizationsFor = query({
  args: { profileIds: v.array(v.id("profiles")) },
  handler: async (
    ctx,
    { profileIds },
  ): Promise<{ profileId: Id<"profiles">; organizations: ProfileOrganization[] }[]> => {
    const cache = new Map<Id<"organizations">, Doc<"organizations"> | null>();
    const rows: { profileId: Id<"profiles">; organizations: ProfileOrganization[] }[] = [];

    for (const profileId of new Set(profileIds)) {
      const memberships = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_profile", (q) => q.eq("profileId", profileId))
        .collect();

      const organizations: ProfileOrganization[] = [];

      for (const membership of memberships) {
        let organization = cache.get(membership.organizationId);

        if (organization === undefined) {
          organization = await ctx.db.get(membership.organizationId);
          cache.set(membership.organizationId, organization);
        }

        if (!organization) continue;
        organizations.push({
          slug: organization.slug,
          shortName: organization.shortName,
          name: organization.name,
          legacyId: organization.legacyId,
        });
      }

      organizations.sort((a, b) => a.shortName.localeCompare(b.shortName));
      rows.push({ profileId, organizations });
    }

    return rows;
  },
});

/**
 * `/data/download/`: the viewer's own prepared export, as a URL the browser can
 * follow. `UserDownloadData` serves the file itself; Convex hands out a signed
 * storage URL instead, so the route redirects to it.
 */
export const dataExportDownload = query({
  args: {},
  handler: async (ctx): Promise<{ url: string; name: string; createdAt: number } | null> => {
    const profile = await requireViewer(ctx);

    const job = await ctx.db
      .query("jobs")
      .withIndex("by_creator_type_createdAt", (q) =>
        q.eq("createdByProfileId", profile._id).eq("type", "userExport"),
      )
      .order("desc")
      .first();

    if (job?.status !== "done") return null;

    const storageId = job.result?.storageId as Id<"_storage"> | undefined;

    if (!storageId) return null;
    const url = await ctx.storage.getUrl(storageId);

    if (!url) return null;

    return { url, name: `${profile.username}-data.zip`, createdAt: job.finishedAt ?? job.createdAt };
  },
});
