// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { blogPostRow, profileRow, siteSettingsRow } from "./lib/testing";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("siteSettings", siteSettingsRow());
    const author = await ctx.db.insert("profiles", profileRow("author"));
    const reader = await ctx.db.insert("profiles", profileRow("reader"));
    const editor = await ctx.db.insert(
      "profiles",
      profileRow("editor", { permissions: ["judge.edit_all_post"] }),
    );

    const live = await ctx.db.insert(
      "blogPosts",
      blogPostRow("Live post", { publishOn: 1_000, authorProfileIds: [author] }),
    );
    const sticky = await ctx.db.insert(
      "blogPosts",
      blogPostRow("Sticky post", { publishOn: 500, sticky: true, authorProfileIds: [author] }),
    );
    const draft = await ctx.db.insert(
      "blogPosts",
      blogPostRow("Draft post", { visible: false, authorProfileIds: [author] }),
    );
    const future = await ctx.db.insert(
      "blogPosts",
      blogPostRow("Future post", { publishOn: Date.now() + 86_400_000, authorProfileIds: [author] }),
    );
    return { author, reader, editor, live, sticky, draft, future };
  });
  return { t, ids };
}

describe("blog visibility", () => {
  test("anonymous readers see published posts, sticky first", async () => {
    const { t } = await seed();
    const posts = await t.query(api.blog.list, { limit: 10 });
    expect(posts.map((post) => post.title)).toEqual(["Sticky post", "Live post"]);
  });

  test("drafts and future posts stay hidden from plain readers", async () => {
    const { t, ids } = await seed();
    const posts = await t.withIdentity({ subject: "user-reader" }).query(api.blog.list, { limit: 10 });
    expect(posts.map((post) => post.title)).toEqual(["Sticky post", "Live post"]);

    expect(await t.query(api.blog.get, { id: ids.draft })).toBeNull();
    expect(await t.query(api.blog.get, { id: ids.future })).toBeNull();
  });

  test("judge.edit_all_post sees drafts and future posts", async () => {
    const { t, ids } = await seed();
    const editor = t.withIdentity({ subject: "user-editor" });
    const posts = await editor.query(api.blog.list, { limit: 10 });
    expect(posts.map((post) => post.title).sort()).toEqual([
      "Draft post",
      "Future post",
      "Live post",
      "Sticky post",
    ]);

    const draft = await editor.query(api.blog.get, { id: ids.draft });
    expect(draft?.title).toBe("Draft post");
    expect(draft?.canEdit).toBe(true);
  });

  test("a post is fetchable by its imported DMOJ id", async () => {
    const { t, ids } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.live, { legacyId: 42 });
    });
    const post = await t.query(api.blog.get, { id: "42" });
    expect(post?.title).toBe("Live post");
    expect(post?.href).toBe("/post/42-live-post");
  });

  test("comment counts skip hidden comments", async () => {
    const { t, ids } = await seed();
    await t.run(async (ctx) => {
      const base = {
        targetType: "blog" as const,
        targetKey: ids.live as string,
        authorProfileId: ids.author,
        time: Date.now(),
        score: 0,
        revisions: 1,
      };
      await ctx.db.insert("comments", { ...base, body: "one", hidden: false });
      await ctx.db.insert("comments", { ...base, body: "two", hidden: false });
      await ctx.db.insert("comments", { ...base, body: "gone", hidden: true });
    });
    const post = await t.query(api.blog.get, { id: ids.live });
    expect(post?.commentCount).toBe(2);
  });

  test("pagination walks the visible posts in order", async () => {
    const { t } = await seed();
    const first = await t.query(api.blog.paginated, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(first.page.map((post) => post.title)).toEqual(["Sticky post"]);
    expect(first.isDone).toBe(false);
    expect(first.totalCount).toBe(2);

    const second = await t.query(api.blog.paginated, {
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    });
    expect(second.page.map((post) => post.title)).toEqual(["Live post"]);
    expect(second.isDone).toBe(true);
  });
});

describe("blog admin", () => {
  test("creating a visible post needs judge.change_post_visibility", async () => {
    const { t } = await seed();
    await t.run(async (ctx) => {
      const writer = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "author"))
        .unique();
      if (writer) await ctx.db.patch(writer._id, { permissions: ["judge.change_blogpost"] });
    });
    const writer = t.withIdentity({ subject: "user-author" });

    await expect(
      writer.mutation(api.admin.blog.create, {
        title: "New post",
        content: "Body",
        visible: true,
      }),
    ).rejects.toThrow(/change_post_visibility/);

    const id = await writer.mutation(api.admin.blog.create, {
      title: "New post",
      content: "Body",
    });
    expect(id).toBeTruthy();

    const history = await writer.query(api.admin.blog.history, { id });
    expect(history).toHaveLength(1);
    expect(history[0]?.reason).toBe("Created post");
  });

  test("an update writes a revision of the previous state", async () => {
    const { t, ids } = await seed();
    const editor = t.withIdentity({ subject: "user-editor" });
    await editor.mutation(api.admin.blog.update, {
      id: ids.live,
      title: "Renamed",
      reason: "Fixed the title",
    });

    const post = await t.query(api.blog.get, { id: ids.live });
    expect(post?.title).toBe("Renamed");

    const history = await editor.query(api.admin.blog.history, { id: ids.live });
    expect(history[0]?.reason).toBe("Fixed the title");
    expect(history[0]?.snapshot.title).toBe("Live post");
  });

  test("deleting a post takes its comments with it", async () => {
    const { t, ids } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("comments", {
        targetType: "blog",
        targetKey: ids.live as string,
        authorProfileId: ids.author,
        time: Date.now(),
        score: 0,
        body: "bye",
        hidden: false,
        revisions: 1,
      });
    });

    await t.withIdentity({ subject: "user-editor" }).mutation(api.admin.blog.remove, {
      id: ids.live,
    });

    const remaining = await t.run(async (ctx) => await ctx.db.query("comments").collect());
    expect(remaining).toHaveLength(0);
    expect(await t.query(api.blog.get, { id: ids.live })).toBeNull();
  });
});
