// Staff console: licenses. judge/models/problem.py:License and
// judge/views/license.py.

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requirePerm } from "../lib/auth";
import { writeRevision } from "../lib/community";
import { invalid, notFound } from "../lib/errors";

const LICENSE_PERM = "judge.change_license";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePerm(ctx, LICENSE_PERM);
    const [licenses, problems] = await Promise.all([
      ctx.db.query("licenses").collect(),
      ctx.db.query("problems").collect(),
    ]);
    licenses.sort((a, b) => a.name.localeCompare(b.name));
    return licenses.map((row) => ({
      ...row,
      problemCount: problems.filter((problem) => problem.licenseId === row._id).length,
    }));
  },
});

export const get = query({
  args: { id: v.id("licenses") },
  handler: async (ctx, { id }) => {
    await requirePerm(ctx, LICENSE_PERM);
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    key: v.string(),
    link: v.string(),
    name: v.string(),
    display: v.optional(v.string()),
    icon: v.optional(v.string()),
    text: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"licenses">> => {
    const editor = await requirePerm(ctx, LICENSE_PERM);
    const key = args.key.trim();
    if (key.length === 0) throw invalid("A license needs a key.");
    if (!/^[-\w.]+$/.test(key))
      throw invalid("License keys may only contain letters, digits, dashes and dots.");

    const clash = await ctx.db
      .query("licenses")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (clash) throw invalid(`A license with the key ${key} already exists.`);

    const id = await ctx.db.insert("licenses", {
      key,
      link: args.link,
      name: args.name,
      display: args.display ?? "",
      icon: args.icon ?? "",
      text: args.text ?? "",
    });
    await writeRevision(
      ctx,
      "license",
      id,
      await ctx.db.get(id),
      editor._id,
      args.reason ?? "Created license",
    );
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("licenses"),
    key: v.optional(v.string()),
    link: v.optional(v.string()),
    name: v.optional(v.string()),
    display: v.optional(v.string()),
    icon: v.optional(v.string()),
    text: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const editor = await requirePerm(ctx, LICENSE_PERM);
    const row = await ctx.db.get(args.id);
    if (!row) throw notFound("License");

    const patch: Partial<Doc<"licenses">> = {};
    if (args.key !== undefined) {
      const key = args.key.trim();
      if (key.length === 0) throw invalid("A license needs a key.");
      if (key !== row.key) {
        const clash = await ctx.db
          .query("licenses")
          .withIndex("by_key", (q) => q.eq("key", key))
          .unique();
        if (clash) throw invalid(`A license with the key ${key} already exists.`);
      }
      patch.key = key;
    }
    if (args.link !== undefined) patch.link = args.link;
    if (args.name !== undefined) patch.name = args.name;
    if (args.display !== undefined) patch.display = args.display;
    if (args.icon !== undefined) patch.icon = args.icon;
    if (args.text !== undefined) patch.text = args.text;

    await writeRevision(ctx, "license", args.id, row, editor._id, args.reason ?? "Edited license");
    await ctx.db.patch(args.id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("licenses"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const editor = await requirePerm(ctx, LICENSE_PERM);
    const row = await ctx.db.get(id);
    if (!row) throw notFound("License");

    const problems = await ctx.db.query("problems").collect();
    for (const problem of problems) {
      if (problem.licenseId === id) await ctx.db.patch(problem._id, { licenseId: undefined });
    }

    await writeRevision(ctx, "license", id, row, editor._id, reason ?? "Deleted license");
    await ctx.db.delete(id);
  },
});
