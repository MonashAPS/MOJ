/**
 * Rebranding without a deploy (SPEC section 24). Every field is optional and
 * clearing one (an empty string, or `null` for an upload) puts the design
 * system's own value back, so `tokens.css` stays the source of the defaults.
 */

import type { WithoutSystemFields } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import { mutation } from "../../_generated/server";
import { requireSuperuser } from "../../lib/auth";
import { invalid, notFound } from "../../lib/errors";
import { themeDefault } from "../../schema";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The console posts the file straight to this URL; only the id comes back. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    await requireSuperuser(ctx);

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Rebranding without a deploy. Every field is optional and clearing one (an
 * empty string, or `null` for an upload) puts the design system's own value
 * back, so `tokens.css` stays the source of the defaults.
 */
export const update = mutation({
  args: {
    siteName: v.optional(v.string()),
    siteLongName: v.optional(v.string()),
    logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    faviconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    accentColor: v.optional(v.string()),
    navColor: v.optional(v.string()),
    customCss: v.optional(v.string()),
    themeDefault: v.optional(themeDefault),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const editor = await requireSuperuser(ctx);

    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
      .unique();

    if (!existing) throw notFound("Site settings");

    const patch: Partial<WithoutSystemFields<Doc<"siteSettings">>> = {};

    if (args.siteName !== undefined) {
      const name = args.siteName.trim();

      if (name.length === 0) throw invalid("The site needs a name.");

      if (name.length > 40) throw invalid("Site names are limited to 40 characters.");
      patch.siteName = name;
    }

    if (args.siteLongName !== undefined) {
      const name = args.siteLongName.trim();

      if (name.length === 0) throw invalid("The site needs a long name.");
      patch.siteLongName = name;
    }

    for (const [key, value] of [
      ["accentColor", args.accentColor],
      ["navColor", args.navColor],
    ] as const) {
      if (value === undefined) continue;
      const trimmed = value.trim();

      if (trimmed === "") {
        patch[key] = undefined;
        continue;
      }

      if (!HEX.test(trimmed)) throw invalid("A colour must be a hex value like #2941a5.");
      patch[key] = trimmed.toLowerCase();
    }

    if (args.customCss !== undefined) {
      if (args.customCss.length > 20_000) throw invalid("That is more custom CSS than the page will carry.");
      patch.customCss = args.customCss || undefined;
    }

    if (args.themeDefault !== undefined) patch.themeDefault = args.themeDefault;

    // A replaced upload is deleted, so the storage does not fill with old logos.
    if (args.logoStorageId !== undefined) {
      if (existing.logoStorageId && existing.logoStorageId !== args.logoStorageId) {
        await ctx.storage.delete(existing.logoStorageId);
      }

      patch.logoStorageId = args.logoStorageId ?? undefined;
    }

    if (args.faviconStorageId !== undefined) {
      if (existing.faviconStorageId && existing.faviconStorageId !== args.faviconStorageId) {
        await ctx.storage.delete(existing.faviconStorageId);
      }

      patch.faviconStorageId = args.faviconStorageId ?? undefined;
    }

    await ctx.db.insert("revisions", {
      entityType: "siteSettings",
      entityId: existing._id,
      snapshot: existing,
      authorProfileId: editor._id,
      reason: args.reason ?? "Edited the branding",
      createdAt: Date.now(),
    });
    await ctx.db.patch(existing._id, patch);
  },
});
