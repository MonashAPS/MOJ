import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { optionalViewer } from "./lib/auth";

export type SearchHit = {
  kind: "problem" | "user" | "contest" | "organization";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

const PER_KIND = 5;

export const global = query({
  args: { term: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { term, limit }): Promise<SearchHit[]> => {
    const needle = term.trim();
    if (needle.length === 0) return [];
    const perKind = Math.max(1, Math.min(limit ?? PER_KIND, 20));
    const viewer = await optionalViewer(ctx);
    const staff = !!viewer && (viewer.isStaff || viewer.isSuperuser);

    const [problems, users, contests, organizations] = await Promise.all([
      searchProblems(ctx, needle, perKind, staff),
      ctx.db
        .query("profiles")
        .withSearchIndex("search_username", (q) =>
          staff ? q.search("username", needle) : q.search("username", needle).eq("isUnlisted", false),
        )
        .take(perKind),
      searchContests(ctx, needle, perKind, staff),
      ctx.db
        .query("organizations")
        .withSearchIndex("search_name", (q) => q.search("name", needle))
        .take(perKind),
    ]);

    const hits: SearchHit[] = [];
    for (const problem of problems) {
      hits.push({
        kind: "problem",
        id: problem._id,
        title: problem.name,
        subtitle: problem.code,
        href: `/problem/${problem.code}`,
      });
    }
    for (const profile of users) {
      hits.push({
        kind: "user",
        id: profile._id,
        title: profile.usernameDisplayOverride || profile.username,
        subtitle: profile.rating !== undefined ? `${profile.rating}` : undefined,
        href: `/user/${profile.username}`,
      });
    }
    for (const contest of contests) {
      hits.push({
        kind: "contest",
        id: contest._id,
        title: contest.name,
        subtitle: contest.key,
        href: `/contest/${contest.key}`,
      });
    }
    for (const organization of organizations) {
      hits.push({
        kind: "organization",
        id: organization._id,
        title: organization.name,
        subtitle: organization.shortName || undefined,
        href: `/organization/${organization.legacyId ?? organization._id}-${organization.slug}`,
      });
    }
    return hits;
  },
});

async function searchProblems(
  ctx: any,
  needle: string,
  perKind: number,
  staff: boolean,
): Promise<Doc<"problems">[]> {
  if (staff) {
    return await ctx.db
      .query("problems")
      .withSearchIndex("search_name_desc", (q: any) => q.search("name", needle))
      .take(perKind);
  }
  return await ctx.db
    .query("problems")
    .withSearchIndex("search_name_desc", (q: any) =>
      q.search("name", needle).eq("isPublic", true).eq("isOrganizationPrivate", false),
    )
    .take(perKind);
}

async function searchContests(
  ctx: any,
  needle: string,
  perKind: number,
  staff: boolean,
): Promise<Doc<"contests">[]> {
  if (staff) {
    return await ctx.db
      .query("contests")
      .withSearchIndex("search_name", (q: any) => q.search("name", needle))
      .take(perKind);
  }
  return await ctx.db
    .query("contests")
    .withSearchIndex("search_name", (q: any) =>
      q.search("name", needle).eq("isVisible", true).eq("isPrivate", false).eq("isOrganizationPrivate", false),
    )
    .take(perKind);
}
