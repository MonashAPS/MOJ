// @vitest-environment edge-runtime

/**
 * `convex/pages/admin/branding.ts` and the `site.branding` read it feeds: the
 * colours, name and custom CSS a superuser may override, what counts as a
 * customisation, and the revision each change leaves behind.
 */

import { describe, expect, test } from "vitest";
import { api } from "../../_generated/api";
import { asUser, insertLanguage, insertOrganization, insertProfile } from "../../test.fixtures";
import { setupTest } from "../../test.setup";

async function seed() {
  const t = setupTest();

  const ids = await t.run(async (ctx) => {
    const root = await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });

    const clerk = await insertProfile(ctx, {
      username: "clerk",
      isStaff: true,
      permissions: ["judge.change_profile"],
    });

    const member = await insertProfile(ctx, { username: "member" });
    const languageId = await insertLanguage(ctx, { key: "PY3" });
    await insertLanguage(ctx, { key: "CPP20" });
    const school = await insertOrganization(ctx, { slug: "school", name: "School" });
    const club = await insertOrganization(ctx, { slug: "club", name: "Club" });

    return { root, clerk, member, languageId, school, club };
  });

  return { t, ids };
}

describe("branding", () => {
  async function withSettings() {
    const { t, ids } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("siteSettings", {
        singleton: "site",
        siteName: "MOJ",
        siteLongName: "MAPS Online Judge",
        siteAdminEmail: "admin@example.com",
        registrationOpen: true,
        defaultUserTimezone: "Australia/Melbourne",
        defaultUserLanguageKey: "PY3",
        problemsPerPage: 50,
        commentsPerPage: 50,
        submissionsPerPage: 50,
        userRankingsPerPage: 100,
        blogPostsPerPage: 10,
        ratingRatios: [0, 0.05, 0.15, 0.4, 0.7, 0.9],
        requireStaffTwoFactor: true,
        pdfEnabled: true,
      });
    });

    return { t, ids };
  }

  test("an unbranded instance answers with the design system's own values", async () => {
    const { t } = await withSettings();
    const branding = await t.query(api.site.branding, {});
    expect(branding.siteName).toBe("MOJ");
    expect(branding.accentColor).toBe("#2941a5");
    expect(branding.navColor).toBe("#101a3d");
    expect(branding.logoUrl).toBeNull();
    expect(branding.themeDefault).toBe("system");
    expect(branding.isCustomised).toBe(false);
  });

  test("a superuser sets the colours and the dark accent is derived from them", async () => {
    const { t } = await withSettings();
    await asUser(t, "root").mutation(api.pages.admin.branding.update, {
      siteName: "Winter Cup",
      accentColor: "#B3001B",
      navColor: "#1A1A2E",
      themeDefault: "dark",
      customCss: ":root { --radius: 2px; }",
      reason: "Rebranded for the contest",
    });

    const branding = await t.query(api.site.branding, {});
    expect(branding.siteName).toBe("Winter Cup");
    expect(branding.accentColor).toBe("#b3001b");
    expect(branding.accentColorDark).not.toBe(branding.accentColor);
    expect(branding.titlebarColor).toBe("#1a1a2e");
    expect(branding.themeDefault).toBe("dark");
    expect(branding.customCss).toContain("--radius");
    expect(branding.isCustomised).toBe(true);
    expect(branding.colorsCustomised).toBe(true);
    // The whole dark chrome is derived, not the light values handed back.
    expect(branding.navColorDark).not.toBe(branding.navColor);
    expect(branding.titlebarColorDark).not.toBe(branding.titlebarColor);
    expect(branding.contestBarColorDark).not.toBe(branding.contestBarColor);
  });

  test("saving the branding form's own defaults is not a customisation", async () => {
    const { t } = await withSettings();
    // The form offers these two; saving it unchanged stores them, and that must
    // not start overriding the token file.
    await asUser(t, "root").mutation(api.pages.admin.branding.update, {
      accentColor: "#2941a5",
      navColor: "#101a3d",
      reason: "Opened the page and saved it",
    });

    const branding = await t.query(api.site.branding, {});
    expect(branding.colorsCustomised).toBe(false);
    expect(branding.isCustomised).toBe(false);
  });

  test("custom CSS is a customisation on its own, without making the colours one", async () => {
    const { t } = await withSettings();
    await asUser(t, "root").mutation(api.pages.admin.branding.update, {
      accentColor: "#2941A5",
      customCss: ":root { --radius: 2px; }",
      reason: "A tweak, not a repaint",
    });

    const branding = await t.query(api.site.branding, {});
    expect(branding.isCustomised).toBe(true);
    expect(branding.colorsCustomised).toBe(false);
  });

  test("an empty colour puts the default back", async () => {
    const { t } = await withSettings();
    const asRoot = asUser(t, "root");
    await asRoot.mutation(api.pages.admin.branding.update, { accentColor: "#B3001B", reason: "Trying it" });
    await asRoot.mutation(api.pages.admin.branding.update, { accentColor: "", reason: "Back to default" });
    expect((await t.query(api.site.branding, {})).accentColor).toBe("#2941a5");
  });

  test("a colour that is not a hex value is refused, and so is an empty name", async () => {
    const { t } = await withSettings();
    const asRoot = asUser(t, "root");
    await expect(
      asRoot.mutation(api.pages.admin.branding.update, { accentColor: "red", reason: "No" }),
    ).rejects.toThrow(/hex value/);
    await expect(
      asRoot.mutation(api.pages.admin.branding.update, { siteName: "   ", reason: "No" }),
    ).rejects.toThrow(/needs a name/);
  });

  test("staff who are not superusers cannot rebrand the site", async () => {
    const { t } = await withSettings();
    await expect(
      asUser(t, "clerk").mutation(api.pages.admin.branding.update, { siteName: "Mine", reason: "No" }),
    ).rejects.toThrow(/Superusers only/);
  });

  test("the change is recorded as a revision on the settings document", async () => {
    const { t } = await withSettings();
    await asUser(t, "root").mutation(api.pages.admin.branding.update, {
      navColor: "#123456",
      reason: "Club colours",
    });

    const rows = await t.run(
      async (ctx) =>
        await ctx.db
          .query("revisions")
          .withIndex("by_entity", (q) => q.eq("entityType", "siteSettings"))
          .collect(),
    );

    expect(rows.map((row) => row.reason)).toContain("Club colours");
  });
});
