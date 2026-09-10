import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { optionalViewer, requireStaff, requireViewer } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { siteTheme } from "./schema";

export const DEFAULT_TIMEZONE = "Australia/Melbourne";

const profileDefaults = {
  about: "",
  points: 0,
  performancePoints: 0,
  problemCount: 0,
  displayRank: "user" as const,
  mute: false,
  isUnlisted: false,
  isBannedFromProblemVoting: false,
  mathEngine: "auto",
  siteTheme: "auto" as const,
  editorTheme: "github",
  notes: "",
  isStaff: false,
  isSuperuser: false,
  permissions: [] as string[],
  groups: [] as string[],
};

async function languageIdForKey(
  ctx: { db: { query: any } },
  key: string | undefined,
): Promise<Id<"languages"> | undefined> {
  if (!key) return undefined;
  const language = await ctx.db
    .query("languages")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();
  return language?._id;
}

export const byUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    return await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
  },
});

export const byUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const ensureProfile = mutation({
  args: {
    username: v.string(),
    timezone: v.optional(v.string()),
    languageKey: v.optional(v.string()),
    about: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw invalid("You must be logged in to create a profile.");
    return await upsertProfile(ctx, { ...args, userId: identity.subject });
  },
});

export const ensureProfileForUser = internalMutation({
  args: {
    userId: v.string(),
    username: v.string(),
    timezone: v.optional(v.string()),
    languageKey: v.optional(v.string()),
    about: v.optional(v.string()),
    isStaff: v.optional(v.boolean()),
    isSuperuser: v.optional(v.boolean()),
    permissions: v.optional(v.array(v.string())),
    displayRank: v.optional(v.union(v.literal("user"), v.literal("setter"), v.literal("admin"))),
  },
  handler: async (ctx, args) => await upsertProfile(ctx, args),
});

async function upsertProfile(
  ctx: any,
  args: {
    userId: string;
    username: string;
    timezone?: string;
    languageKey?: string;
    about?: string;
    isStaff?: boolean;
    isSuperuser?: boolean;
    permissions?: string[];
    displayRank?: "user" | "setter" | "admin";
  },
): Promise<Id<"profiles">> {
  const existing: Doc<"profiles"> | null = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q: any) => q.eq("userId", args.userId))
    .unique();

  const languageId = await languageIdForKey(ctx, args.languageKey);

  if (existing) {
    const patch: Partial<Doc<"profiles">> = { username: args.username };
    if (args.timezone) patch.timezone = args.timezone;
    if (languageId) patch.languageId = languageId;
    if (args.about !== undefined) patch.about = args.about;
    if (args.isStaff !== undefined) patch.isStaff = args.isStaff;
    if (args.isSuperuser !== undefined) patch.isSuperuser = args.isSuperuser;
    if (args.permissions !== undefined) patch.permissions = args.permissions;
    if (args.displayRank !== undefined) patch.displayRank = args.displayRank;
    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }

  return await ctx.db.insert("profiles", {
    ...profileDefaults,
    userId: args.userId,
    username: args.username,
    timezone: args.timezone ?? DEFAULT_TIMEZONE,
    languageId,
    about: args.about ?? "",
    isStaff: args.isStaff ?? false,
    isSuperuser: args.isSuperuser ?? false,
    permissions: args.permissions ?? [],
    displayRank: args.displayRank ?? "user",
    joinDate: Date.now(),
  });
}

export const updatePreferences = mutation({
  args: {
    about: v.optional(v.string()),
    timezone: v.optional(v.string()),
    languageKey: v.optional(v.string()),
    siteTheme: v.optional(siteTheme),
    editorTheme: v.optional(v.string()),
    mathEngine: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireViewer(ctx);
    const patch: Partial<Doc<"profiles">> = {};
    if (args.about !== undefined) {
      if (args.about.length > 20000) throw invalid("About is too long.");
      patch.about = args.about;
    }
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (args.siteTheme !== undefined) patch.siteTheme = args.siteTheme;
    if (args.editorTheme !== undefined) patch.editorTheme = args.editorTheme;
    if (args.mathEngine !== undefined) patch.mathEngine = args.mathEngine;
    if (args.languageKey !== undefined) {
      const languageId = await languageIdForKey(ctx, args.languageKey);
      if (!languageId) throw notFound("Language");
      patch.languageId = languageId;
    }
    await ctx.db.patch(profile._id, patch);
    return profile._id;
  },
});

export const setTheme = mutation({
  args: { siteTheme },
  handler: async (ctx, args) => {
    const profile = await optionalViewer(ctx);
    if (!profile) return null;
    await ctx.db.patch(profile._id, { siteTheme: args.siteTheme });
    return args.siteTheme;
  },
});

export const touchAccess = mutation({
  args: { ip: v.optional(v.string()) },
  handler: async (ctx, { ip }) => {
    const profile = await optionalViewer(ctx);
    if (!profile) return null;
    await ctx.db.patch(profile._id, { lastAccess: Date.now(), ip: ip ?? profile.ip });
    return profile._id;
  },
});

export const listStaff = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const rows = await ctx.db.query("profiles").collect();
    return rows.filter((row) => row.isStaff || row.isSuperuser);
  },
});
