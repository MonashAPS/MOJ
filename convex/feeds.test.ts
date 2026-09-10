// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { blogPostRow, contestRow, problemRow, profileRow, siteSettingsRow } from "./lib/testing";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("siteSettings", siteSettingsRow());
    const author = await ctx.db.insert("profiles", profileRow("author"));
    await ctx.db.insert("profiles", profileRow("ghost", { isUnlisted: true }));

    const groupId = await ctx.db.insert("problemGroups", { name: "misc", fullName: "Misc" });
    const publicProblem = await ctx.db.insert(
      "problems",
      problemRow("alpha", groupId, { date: 2_000, description: "Public statement." }),
    );
    await ctx.db.insert("problems", problemRow("beta", groupId, { date: 3_000, isPublic: false }));
    await ctx.db.insert(
      "problems",
      problemRow("gamma", groupId, { date: 4_000, isOrganizationPrivate: true }),
    );

    const post = await ctx.db.insert(
      "blogPosts",
      blogPostRow("Hello & welcome", { publishOn: 1_000, summary: "A <summary>." }),
    );
    await ctx.db.insert("blogPosts", blogPostRow("Draft", { visible: false }));

    await ctx.db.insert("contests", contestRow("open", { startTime: 10_000, endTime: 20_000 }));
    await ctx.db.insert("contests", contestRow("hidden", { isVisible: false }));
    await ctx.db.insert("contests", contestRow("secret", { isPrivate: true }));

    await ctx.db.insert("comments", {
      targetType: "problem",
      targetKey: "alpha",
      authorProfileId: author,
      time: 5_000,
      score: 1,
      body: "Nice problem <3",
      hidden: false,
      revisions: 1,
    });
    await ctx.db.insert("comments", {
      targetType: "problem",
      targetKey: "beta",
      authorProfileId: author,
      time: 6_000,
      score: 0,
      body: "Private chatter",
      hidden: false,
      revisions: 1,
    });
    await ctx.db.insert("comments", {
      targetType: "blog",
      targetKey: post as string,
      authorProfileId: author,
      time: 7_000,
      score: 0,
      body: "First!",
      hidden: true,
      revisions: 1,
    });

    return { author, publicProblem, post };
  });
  return { t, ids };
}

describe("feed queries", () => {
  test("the problem feed lists public problems newest first", async () => {
    const { t } = await seed();
    const items = await t.query(api.feeds.problems, {});
    expect(items.map((item) => item.id)).toEqual(["alpha"]);
    expect(items[0]?.preset).toBe("problem");
    expect(items[0]?.link).toBe("/problem/alpha");
  });

  test("the comment feed skips private pages and hidden comments", async () => {
    const { t } = await seed();
    const items = await t.query(api.feeds.comments, {});
    expect(items.map((item) => item.body)).toEqual(["Nice problem <3"]);
    expect(items[0]?.title).toBe("author -> ALPHA");
  });

  test("a signed-in staff member gets no more than an anonymous reader", async () => {
    const { t } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("profiles", profileRow("boss", { isSuperuser: true, isStaff: true }));
    });
    const asStaff = await t.withIdentity({ subject: "user-boss" }).query(api.feeds.comments, {});
    expect(asStaff.map((item) => item.body)).toEqual(["Nice problem <3"]);
  });

  test("the blog feed prefers the summary and skips drafts", async () => {
    const { t } = await seed();
    const items = await t.query(api.feeds.blog, {});
    expect(items.map((item) => item.title)).toEqual(["Hello & welcome"]);
    expect(items[0]?.body).toBe("A <summary>.");
  });

  test("the sitemap covers the public surface only", async () => {
    const { t } = await seed();
    const entries = await t.query(api.feeds.sitemap, {});
    const locations = entries.map((entry) => entry.location);

    expect(locations).toContain("/");
    expect(locations).toContain("/about/");
    expect(locations).toContain("/problem/alpha");
    expect(locations).not.toContain("/problem/beta");
    expect(locations).not.toContain("/problem/gamma");
    expect(locations).toContain("/contest/open");
    expect(locations).not.toContain("/contest/hidden");
    expect(locations).not.toContain("/contest/secret");
    expect(locations).toContain("/user/author");
    expect(locations).not.toContain("/user/ghost");
    expect(locations.some((location) => location.startsWith("/post/"))).toBe(true);
  });

  test("the editorial sitemap entry only appears for a published solution", async () => {
    const { t, ids } = await seed();
    expect(
      (await t.query(api.feeds.sitemap, {})).some((entry) => entry.location === "/problem/alpha/editorial"),
    ).toBe(false);

    await t.run(async (ctx) => {
      await ctx.db.insert("solutions", {
        problemId: ids.publicProblem,
        isPublic: true,
        publishOn: 1_000,
        authorProfileIds: [],
        content: "Sort it.",
      });
    });
    expect(
      (await t.query(api.feeds.sitemap, {})).some((entry) => entry.location === "/problem/alpha/editorial"),
    ).toBe(true);
  });

  test("the calendar lists visible public contests in start order", async () => {
    const { t } = await seed();
    const contests = await t.query(api.feeds.contests, {});
    expect(contests.map((contest) => contest.key)).toEqual(["open"]);
    expect(contests[0]?.link).toBe("/contest/open");
  });

  test("the site block falls back when there are no settings", async () => {
    const t = convexTest(schema, modules);
    const site = await t.query(api.feeds.site, {});
    expect(site.siteName).toBe("MOJ");
  });
});
