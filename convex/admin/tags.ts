// Staff console: contest tags. judge/models/contest.py:ContestTag.

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requirePerm } from "../lib/auth";
import { writeRevision } from "../lib/community";
import { invalid, notFound } from "../lib/errors";

const TAG_PERM = "judge.change_contesttag";

/** `ContestTag.name` validator: DMOJ allows word characters and dashes. */
const TAG_NAME = /^[a-z-]+$/;

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePerm(ctx, TAG_PERM);

    const [tags, contests] = await Promise.all([
      ctx.db.query("contestTags").collect(),
      ctx.db.query("contests").collect(),
    ]);

    tags.sort((a, b) => a.name.localeCompare(b.name));

    return tags.map((row) => ({
      ...row,
      contestCount: contests.filter((contest) => contest.tagIds.includes(row._id)).length,
    }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    color: v.optional(v.string()),
    description: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"contestTags">> => {
    const editor = await requirePerm(ctx, TAG_PERM);
    const name = args.name.trim().toLowerCase();

    if (!TAG_NAME.test(name)) throw invalid("Tag names may only contain lowercase letters and dashes.");

    const clash = await ctx.db
      .query("contestTags")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();

    if (clash) throw invalid(`A tag named ${name} already exists.`);

    const color = args.color ?? "#3b3b3b";

    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw invalid("A tag colour must be a hex value like #3366cc.");

    const id = await ctx.db.insert("contestTags", {
      name,
      color,
      description: args.description ?? "",
    });

    await writeRevision(
      ctx,
      "contestTag",
      id,
      await ctx.db.get(id),
      editor._id,
      args.reason ?? "Created tag",
    );

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("contestTags"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    description: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const editor = await requirePerm(ctx, TAG_PERM);
    const row = await ctx.db.get(args.id);

    if (!row) throw notFound("Tag");

    const patch: Partial<Doc<"contestTags">> = {};

    if (args.name !== undefined) {
      const name = args.name.trim().toLowerCase();

      if (!TAG_NAME.test(name)) throw invalid("Tag names may only contain lowercase letters and dashes.");

      if (name !== row.name) {
        const clash = await ctx.db
          .query("contestTags")
          .withIndex("by_name", (q) => q.eq("name", name))
          .unique();

        if (clash) throw invalid(`A tag named ${name} already exists.`);
      }

      patch.name = name;
    }

    if (args.color !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(args.color)) {
        throw invalid("A tag colour must be a hex value like #3366cc.");
      }

      patch.color = args.color;
    }

    if (args.description !== undefined) patch.description = args.description;

    await writeRevision(ctx, "contestTag", args.id, row, editor._id, args.reason ?? "Edited tag");
    await ctx.db.patch(args.id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("contestTags"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const editor = await requirePerm(ctx, TAG_PERM);
    const row = await ctx.db.get(id);

    if (!row) throw notFound("Tag");

    const contests = await ctx.db.query("contests").collect();

    for (const contest of contests) {
      if (!contest.tagIds.includes(id)) continue;
      await ctx.db.patch(contest._id, { tagIds: contest.tagIds.filter((entry) => entry !== id) });
    }

    await writeRevision(ctx, "contestTag", id, row, editor._id, reason ?? "Deleted tag");
    await ctx.db.delete(id);
  },
});
