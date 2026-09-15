// @vitest-environment edge-runtime

import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { brandingPalette } from "./site";
import {
  asUser,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSiteSettings,
} from "./test.fixtures";
import { setupTest } from "./test.setup";

async function seed() {
  const t = setupTest();
  await t.run(async (ctx) => {
    await insertSiteSettings(ctx);
    await insertProfile(ctx, { username: "plain" });
    await insertProfile(ctx, {
      username: "navadmin",
      permissions: ["judge.change_navigationbar", "judge.change_miscconfig", "judge.change_flatpage"],
    });
    await insertProfile(ctx, { username: "root", isSuperuser: true, isStaff: true });
  });
  return t;
}

describe("navigation bar", () => {
  test("items nest under their parent and sort by order", async () => {
    const t = await seed();
    const admin = asUser(t, "navadmin");

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
    const admin = asUser(t, "navadmin");
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
      asUser(t, "navadmin").mutation(api.admin.site.createNavItem, {
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
    const admin = asUser(t, "navadmin");
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
      asUser(t, "plain").mutation(api.admin.site.createNavItem, {
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
    const admin = asUser(t, "navadmin");
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
    const admin = asUser(t, "navadmin");
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
    const admin = asUser(t, "navadmin");
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
      asUser(t, "navadmin").mutation(api.admin.site.updateSettings, {
        registrationOpen: false,
      }),
    ).rejects.toThrow();

    await asUser(t, "root").mutation(api.admin.site.updateSettings, {
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
    await asUser(t, "root").mutation(api.admin.site.updateSettings, {
      commentVoteHideThreshold: -2,
    });
    await t.run(async (ctx) => {
      const groupId = await insertProblemGroup(ctx, { name: "misc" });
      const author = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "plain"))
        .unique();
      if (!author) throw new Error("no author");
      await insertProblem(ctx, { code: "alpha", name: "Alpha", description: "", groupId });
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

/* -------------------------------------------------------------------------- */
/* The branding palette                                                       */
/* -------------------------------------------------------------------------- */

/** The derivation is a relation, not a lookup, so it lands near the token file
 *  rather than on it. Eight steps of 255 is under half a percent of the ramp —
 *  a difference no one can see, and small enough that a regression in the
 *  relation itself would blow straight through it. */
const TOLERANCE = 8;

function channels(hex: string): [number, number, number] {
  const int = Number.parseInt(hex.replace("#", ""), 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** The widest any one channel is off, so a near miss reads as a number rather
 *  than as a hex nobody can subtract in their head. */
function distance(got: string, want: string): number {
  const a = channels(got);
  const b = channels(want);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function expectNear(got: string, want: string): void {
  expect(`${got} is ${distance(got, want)} off ${want}`).toBe(
    `${got} is ${Math.min(distance(got, want), TOLERANCE)} off ${want}`,
  );
}

describe("brandingPalette", () => {
  // packages/ui/src/tokens.css, the light block and the two dark blocks.
  const TOKENS = {
    accent: "#2f4fd0",
    accentDark: "#8fa6ff",
    accentFillDark: "#3b5bdb",
    nav: "#101a3d",
    navDark: "#16234a",
    titlebarDark: "#243766",
    contestBar: "#182448",
    contestBarDark: "#1c2c58",
  };

  test("the design system's own light values give back its own dark values", () => {
    const palette = brandingPalette(TOKENS.accent, TOKENS.nav);

    expectNear(palette.accentDark, TOKENS.accentDark);
    expectNear(palette.accentFillDark, TOKENS.accentFillDark);
    expectNear(palette.navDark, TOKENS.navDark);
    expectNear(palette.titlebarDark, TOKENS.titlebarDark);
    expectNear(palette.contestBar, TOKENS.contestBar);
    expectNear(palette.contestBarDark, TOKENS.contestBarDark);
  });

  test("the light values are the operator's own, untouched", () => {
    const palette = brandingPalette("#B3001B", "#1A1A2E");
    expect(palette.accent).toBe("#b3001b");
    expect(palette.nav).toBe("#1a1a2e");
    // In light the panel band wears the bar's colour, as tokens.css has it.
    expect(palette.titlebar).toBe("#1a1a2e");
  });

  test("the dark chrome separates, in order, whatever the operator picked", () => {
    for (const nav of ["#101a3d", "#1a1a2e", "#0f3b2a", "#4a1020", "#2b2b2b"]) {
      const { navDark, titlebarDark, contestBarDark } = brandingPalette("#2f4fd0", nav);
      const lightness = (hex: string) => {
        const [r, g, b] = channels(hex);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      expect(lightness(navDark)).toBeGreaterThanOrEqual(lightness(nav));
      expect(lightness(contestBarDark)).toBeGreaterThan(lightness(navDark));
      expect(lightness(titlebarDark)).toBeGreaterThan(lightness(contestBarDark));
    }
  });

  test("the filled primary stays dark enough on dark to carry white text", () => {
    const luminance = (hex: string) => {
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const [r, g, b] = channels(hex);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const onWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

    for (const accent of ["#2f4fd0", "#2941a5", "#b3001b", "#0f6b3f", "#7a4b00"]) {
      const { accentFillDark, accentFillHoverDark, accentFillActiveDark } = brandingPalette(
        accent,
        "#101a3d",
      );
      expect(onWhite(accentFillDark)).toBeGreaterThanOrEqual(4.5);
      // Hover lifts off the fill and pressed drops below it, as tokens.css has it.
      expect(luminance(accentFillHoverDark)).toBeGreaterThan(luminance(accentFillDark));
      expect(luminance(accentFillActiveDark)).toBeLessThan(luminance(accentFillDark));
    }
  });

  test("the lift keeps the hue rather than washing towards white", () => {
    // A red accent must come back a lighter red, not a pink-grey: the blue
    // channel may not overtake the red one.
    const { accentDark } = brandingPalette("#b3001b", "#101a3d");
    const [r, g, b] = channels(accentDark);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  test("a colour it cannot read falls back to the default rather than throwing", () => {
    const palette = brandingPalette("not a colour", "");
    expect(palette.accent).toBe("#2941a5");
    expect(palette.nav).toBe("#101a3d");
  });
});
