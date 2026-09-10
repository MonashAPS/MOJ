// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { profileRow, siteSettingsRow } from "./lib/testing";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("siteSettings", siteSettingsRow());
    await ctx.db.insert("profiles", profileRow("plain"));
    await ctx.db.insert(
      "profiles",
      profileRow("navadmin", {
        permissions: ["judge.change_navigationbar", "judge.change_miscconfig", "judge.change_flatpage"],
      }),
    );
    await ctx.db.insert("profiles", profileRow("root", { isSuperuser: true, isStaff: true }));
  });
  return t;
}

describe("navigation bar", () => {
  test("items nest under their parent and sort by order", async () => {
    const t = await seed();
    const admin = t.withIdentity({ subject: "user-navadmin" });

    const problems = await admin.mutation(api.admin.site.createNavItem, {
      key: "problems",
      label: "Problems",
      path: "/problems/",
      regex: "^/problems?/",
      order: 2,
    });
    await admin.mutation(api.admin.site.createNavItem, {
      key: "home",
      label: "Home",
      path: "/",
      regex: "^/$",
      order: 1,
    });
    await admin.mutation(api.admin.site.createNavItem, {
      key: "random",
      label: "Random",
      path: "/problems/random/",
      regex: "^/problems/random/",
      order: 2,
      parentId: problems,
    });
    await admin.mutation(api.admin.site.createNavItem, {
      key: "list",
      label: "List",
      path: "/problems/",
      regex: "^/problems/$",
      order: 1,
      parentId: problems,
    });

    const nav = await t.query(api.site.nav, {});
    expect(nav.map((node) => node.key)).toEqual(["home", "problems"]);
    expect(nav[1]?.children.map((node) => node.key)).toEqual(["list", "random"]);
    expect(nav[0]?.children).toEqual([]);
  });

  test("deleting a parent lifts its children up a level", async () => {
    const t = await seed();
    const admin = t.withIdentity({ subject: "user-navadmin" });
    const parent = await admin.mutation(api.admin.site.createNavItem, {
      key: "parent",
      label: "Parent",
      path: "/p/",
      regex: "^/p/",
      order: 1,
    });
    await admin.mutation(api.admin.site.createNavItem, {
      key: "child",
      label: "Child",
      path: "/p/c/",
      regex: "^/p/c/",
      order: 1,
      parentId: parent,
    });

    await admin.mutation(api.admin.site.deleteNavItem, { id: parent });
    const nav = await t.query(api.site.nav, {});
    expect(nav.map((node) => node.key)).toEqual(["child"]);
  });

  test("an invalid highlight regex is refused", async () => {
    const t = await seed();
    await expect(
      t.withIdentity({ subject: "user-navadmin" }).mutation(api.admin.site.createNavItem, {
        key: "bad",
        label: "Bad",
        path: "/",
        regex: "([",
        order: 1,
      }),
    ).rejects.toThrow(/Invalid regex/);
  });

  test("duplicate identifiers are refused", async () => {
    const t = await seed();
    const admin = t.withIdentity({ subject: "user-navadmin" });
    await admin.mutation(api.admin.site.createNavItem, {
      key: "home",
      label: "Home",
      path: "/",
      regex: "^/$",
      order: 1,
    });
    await expect(
      admin.mutation(api.admin.site.createNavItem, {
        key: "home",
        label: "Home again",
        path: "/",
        regex: "^/$",
        order: 2,
      }),
    ).rejects.toThrow(/already exists/);
  });

  test("editing the bar needs judge.change_navigationbar", async () => {
    const t = await seed();
    await expect(
      t.withIdentity({ subject: "user-plain" }).mutation(api.admin.site.createNavItem, {
        key: "sneak",
        label: "Sneak",
        path: "/",
        regex: "^/$",
        order: 1,
      }),
    ).rejects.toThrow();
  });

  test("reordering moves rows without touching the rest", async () => {
    const t = await seed();
    const admin = t.withIdentity({ subject: "user-navadmin" });
    const a = await admin.mutation(api.admin.site.createNavItem, {
      key: "a",
      label: "A",
      path: "/a/",
      regex: "^/a/",
      order: 1,
    });
    const b = await admin.mutation(api.admin.site.createNavItem, {
      key: "b",
      label: "B",
      path: "/b/",
      regex: "^/b/",
      order: 2,
    });

    await admin.mutation(api.admin.site.reorderNav, {
      items: [
        { id: a, order: 2 },
        { id: b, order: 1 },
      ],
    });
    const nav = await t.query(api.site.nav, {});
    expect(nav.map((node) => node.key)).toEqual(["b", "a"]);
  });
});

describe("misc config and flat pages", () => {
  test("config values round-trip through the shell query", async () => {
    const t = await seed();
    const admin = t.withIdentity({ subject: "user-navadmin" });
    await admin.mutation(api.admin.site.setConfig, {
      key: "announcement",
      value: "Contest tonight.",
    });
    expect(await t.query(api.site.miscConfigValue, { key: "announcement" })).toBe("Contest tonight.");

    await admin.mutation(api.admin.site.setConfig, { key: "announcement", value: "" });
    const shell = await t.query(api.site.shell, {});
    expect(shell.misc.announcement).toBe("");

    await admin.mutation(api.admin.site.deleteConfig, { key: "announcement" });
    expect(await t.query(api.site.miscConfigValue, { key: "announcement" })).toBeNull();
  });

  test("flat page URLs are normalised and unique", async () => {
    const t = await seed();
    const admin = t.withIdentity({ subject: "user-navadmin" });
    await admin.mutation(api.admin.site.createFlatPage, {
      url: "/about",
      title: "About",
      content: "# About\n\nHello.",
    });

    const page = await t.query(api.site.flatPage, { url: "/about/" });
    expect(page?.title).toBe("About");
    expect(page?.contentPreset).toBe("flatpage");

    await expect(
      admin.mutation(api.admin.site.createFlatPage, {
        url: "/about/",
        title: "About again",
        content: "",
      }),
    ).rejects.toThrow(/already lives/);

    await expect(
      admin.mutation(api.admin.site.createFlatPage, {
        url: "about",
        title: "Bad",
        content: "",
      }),
    ).rejects.toThrow(/start with a slash/);
  });
});

describe("site settings", () => {
  test("only superusers may edit them", async () => {
    const t = await seed();
    await expect(
      t.withIdentity({ subject: "user-navadmin" }).mutation(api.admin.site.updateSettings, {
        registrationOpen: false,
      }),
    ).rejects.toThrow();

    await t.withIdentity({ subject: "user-root" }).mutation(api.admin.site.updateSettings, {
      registrationOpen: false,
      commentVoteHideThreshold: -3,
      reason: "Closed for the semester",
    });

    const settings = await t.query(api.site.settings, {});
    expect(settings?.registrationOpen).toBe(false);
    expect(settings?.commentVoteHideThreshold).toBe(-3);
  });

  test("the settings threshold drives the comment collapse point", async () => {
    const t = await seed();
    await t.withIdentity({ subject: "user-root" }).mutation(api.admin.site.updateSettings, {
      commentVoteHideThreshold: -2,
    });
    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("problemGroups", { name: "misc", fullName: "Misc" });
      const author = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "plain"))
        .unique();
      if (!author) throw new Error("no author");
      await ctx.db.insert("problems", {
        code: "alpha",
        name: "Alpha",
        description: "",
        authorProfileIds: [],
        curatorProfileIds: [],
        testerProfileIds: [],
        typeIds: [],
        groupId,
        timeLimit: 1,
        memoryLimit: 65536,
        shortCircuit: false,
        points: 100,
        partial: false,
        allowedLanguageIds: [],
        isPublic: true,
        isManuallyManaged: false,
        date: Date.now(),
        bannedProfileIds: [],
        userCount: 0,
        acRate: 0,
        isFullMarkup: false,
        submissionSourceVisibility: "F",
        organizationIds: [],
        isOrganizationPrivate: false,
      });
      await ctx.db.insert("comments", {
        targetType: "problem",
        targetKey: "alpha",
        authorProfileId: author._id,
        time: Date.now(),
        score: -2,
        body: "meh",
        hidden: false,
        revisions: 1,
      });
    });

    const list = await t.query(api.comments.list, { targetType: "problem", targetKey: "alpha" });
    expect(list?.voteHideThreshold).toBe(-2);
    expect(list?.comments[0]?.belowThreshold).toBe(true);
  });
});
