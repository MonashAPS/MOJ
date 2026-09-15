/**
 * The two reference tables the problem form picks from: problem types and
 * problem groups. DMOJ's `ProblemTypeAdmin` and `ProblemGroupAdmin`.
 *
 * A row that is still named by a problem cannot be deleted; the console's
 * duplicate repair in `admin/dedupe.ts` is what folds two rows into one.
 */

import { hasPerm } from "@moj/core";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, type QueryCtx } from "../_generated/server";
import { forbidden, invalid } from "../lib/errors";
import { type Editor, requireStaffViewer } from "./problems";

async function requireTaxonomyEditor(ctx: QueryCtx, code: string): Promise<Editor> {
  const editor = await requireStaffViewer(ctx);

  if (!hasPerm(editor.viewer.core, code)) throw forbidden(`Missing permission ${code}.`);

  return editor;
}

export const createType = mutation({
  args: { name: v.string(), fullName: v.string() },
  handler: async (ctx, args) => {
    await requireTaxonomyEditor(ctx, "judge.add_problemtype");

    const existing = await ctx.db
      .query("problemTypes")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) throw invalid(`A problem type named "${args.name}" already exists.`);

    return { id: await ctx.db.insert("problemTypes", args) };
  },
});

export const updateType = mutation({
  args: { id: v.id("problemTypes"), name: v.optional(v.string()), fullName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireTaxonomyEditor(ctx, "judge.change_problemtype");
    const patch: Partial<Doc<"problemTypes">> = {};

    if (args.name !== undefined) patch.name = args.name;

    if (args.fullName !== undefined) patch.fullName = args.fullName;
    await ctx.db.patch(args.id, patch);

    return { ok: true };
  },
});

export const deleteType = mutation({
  args: { id: v.id("problemTypes") },
  handler: async (ctx, { id }) => {
    await requireTaxonomyEditor(ctx, "judge.delete_problemtype");
    const inUse = (await ctx.db.query("problems").take(20_000)).some((row) => row.typeIds.includes(id));

    if (inUse) throw invalid("This problem type is still in use.");
    await ctx.db.delete(id);

    return { ok: true };
  },
});

export const createGroup = mutation({
  args: { name: v.string(), fullName: v.string() },
  handler: async (ctx, args) => {
    await requireTaxonomyEditor(ctx, "judge.add_problemgroup");

    const existing = await ctx.db
      .query("problemGroups")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) throw invalid(`A problem group named "${args.name}" already exists.`);

    return { id: await ctx.db.insert("problemGroups", args) };
  },
});

export const updateGroup = mutation({
  args: {
    id: v.id("problemGroups"),
    name: v.optional(v.string()),
    fullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireTaxonomyEditor(ctx, "judge.change_problemgroup");
    const patch: Partial<Doc<"problemGroups">> = {};

    if (args.name !== undefined) patch.name = args.name;

    if (args.fullName !== undefined) patch.fullName = args.fullName;
    await ctx.db.patch(args.id, patch);

    return { ok: true };
  },
});

export const deleteGroup = mutation({
  args: { id: v.id("problemGroups") },
  handler: async (ctx, { id }) => {
    await requireTaxonomyEditor(ctx, "judge.delete_problemgroup");

    const inUse = await ctx.db
      .query("problems")
      .withIndex("by_group", (q) => q.eq("groupId", id))
      .first();

    if (inUse) throw invalid("This problem group is still in use.");
    await ctx.db.delete(id);

    return { ok: true };
  },
});
