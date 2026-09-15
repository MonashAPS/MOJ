// @vitest-environment edge-runtime

import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  insertBlogPost,
  insertContest,
  insertProblem,
  insertProblemGroup,
  insertProfile,
  insertSiteSettings,
} from "./test.fixtures";
import { setupTest } from "./test.setup";

async function seed() {
  const t = setupTest();

  const ids = await t.run(async (ctx) => {
    await insertSiteSettings(ctx);
    const author = await insertProfile(ctx, { username: "author" });
    await insertProfile(ctx, { username: "ghost", isUnlisted: true });

    const groupId = await insertProblemGroup(ctx, { name: "misc" });

    const publicProblem = await insertProblem(ctx, {
      code: "alpha",
      groupId,
      date: 2_000,
      description: "Public statement.",
    });

    await insertProblem(ctx, { code: "beta", groupId, date: 3_000, isPublic: false });
    await insertProblem(ctx, {
      code: "gamma",
      groupId,
      date: 4_000,
      isOrganizationPrivate: true,
    });

    const post = await insertBlogPost(ctx, {
      title: "Hello & welcome",
      publishOn: 1_000,
      summary: "A <summary>.",
    });

    await insertBlogPost(ctx, { title: "Draft", visible: false });

    await insertContest(ctx, { key: "open", startTime: 10_000, endTime: 20_000 });
    await insertContest(ctx, { key: "hidden", isVisible: false });
    await insertContest(ctx, { key: "secret", isPrivate: true });

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
    await insertProfile(t, { username: "boss", isSuperuser: true, isStaff: true });
    const asStaff = await asUser(t, "boss").query(api.feeds.comments, {});
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
    const t = setupTest();
    const site = await t.query(api.feeds.site, {});
    expect(site.siteName).toBe("MOJ");
  });
});
