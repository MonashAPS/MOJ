// @vitest-environment edge-runtime

import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  asUser,
  insertProblem,
  languageRow,
  problemRow,
  profileRow,
  siteSettingsRow,
  submissionRow,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

type Seeded = {
  solver: Id<"profiles">;
  other: Id<"profiles">;
  newbie: Id<"profiles">;
  problemCode: string;
};

async function seed(t: T): Promise<Seeded> {
  return await t.run(async (ctx) => {
    await ctx.db.insert("siteSettings", siteSettingsRow());
    const languageId = await ctx.db.insert("languages", languageRow());
    const groupId = await ctx.db.insert("problemGroups", { name: "misc", fullName: "Misc" });
    const problemId = await ctx.db.insert("problems", problemRow({ code: "alpha", groupId }));

    const solver = await ctx.db.insert("profiles", profileRow({ username: "solver" }));
    const other = await ctx.db.insert("profiles", profileRow({ username: "other" }));
    const newbie = await ctx.db.insert("profiles", profileRow({ username: "newbie" }));
    await ctx.db.insert("profiles", profileRow({ username: "staffy", isStaff: true }));

    const moderator = await ctx.db.insert(
      "profiles",
      profileRow({
        username: "mod",
        permissions: ["judge.change_comment", "judge.change_commentlock"],
      }),
    );

    for (const profileId of [solver, other, moderator]) {
      await ctx.db.insert(
        "submissions",
        submissionRow({
          profileId,
          problemId,
          languageId,
          result: "AC",
          points: 100,
          casePoints: 100,
          caseTotal: 100,
          priority: 0,
        }),
      );
    }

    return { solver, other, newbie, problemCode: "alpha" };
  });
}

describe("posting rules", () => {
  test("a user with no solves cannot post", async () => {
    const t = setupTest();
    const seeded = await seed(t);
    await expect(
      asUser(t, "newbie").mutation(api.comments.post, {
        targetType: "problem",
        targetKey: seeded.problemCode,
        body: "hello",
      }),
    ).rejects.toThrow(/at least one problem/);
  });

  test("staff may post without solving anything", async () => {
    const t = setupTest();
    const seeded = await seed(t);

    const id = await asUser(t, "staffy").mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "staff note",
    });

    expect(id).toBeTruthy();
  });

  test("a muted user cannot post", async () => {
    const t = setupTest();
    const seeded = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.solver, { mute: true });
    });
    await expect(
      asUser(t, "solver").mutation(api.comments.post, {
        targetType: "problem",
        targetKey: seeded.problemCode,
        body: "hello",
      }),
    ).rejects.toThrow(/silent, little toad/);
  });

  test("an anonymous visitor cannot post", async () => {
    const t = setupTest();
    const seeded = await seed(t);
    await expect(
      t.mutation(api.comments.post, {
        targetType: "problem",
        targetKey: seeded.problemCode,
        body: "hello",
      }),
    ).rejects.toThrow();
  });

  test("a private problem is not commentable", async () => {
    const t = setupTest();
    await seed(t);
    await insertProblem(t, { code: "secret", isPublic: false });
    await expect(
      asUser(t, "solver").mutation(api.comments.post, {
        targetType: "problem",
        targetKey: "secret",
        body: "hello",
      }),
    ).rejects.toThrow();
  });

  test("an empty body is rejected", async () => {
    const t = setupTest();
    const seeded = await seed(t);
    await expect(
      asUser(t, "solver").mutation(api.comments.post, {
        targetType: "problem",
        targetKey: seeded.problemCode,
        body: "   ",
      }),
    ).rejects.toThrow(/Invalid comment body/);
  });

  test("an over-long body is rejected", async () => {
    const t = setupTest();
    const seeded = await seed(t);
    await expect(
      asUser(t, "solver").mutation(api.comments.post, {
        targetType: "problem",
        targetKey: seeded.problemCode,
        body: "x".repeat(8193),
      }),
    ).rejects.toThrow(/limited to 8192/);
  });

  test("replies to comments older than the timeframe are refused", async () => {
    const t = setupTest();
    const seeded = await seed(t);

    const parent = await asUser(t, "solver").mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "ancient",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(parent, { time: Date.now() - 400 * 24 * 60 * 60 * 1000 });
    });

    await expect(
      asUser(t, "other").mutation(api.comments.post, {
        targetType: "problem",
        targetKey: seeded.problemCode,
        parentId: parent,
        body: "necro",
      }),
    ).rejects.toThrow(/too old/);

    // judge.change_comment overrides the cutoff.
    const reply = await asUser(t, "mod").mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      parentId: parent,
      body: "moderator reply",
    });

    expect(reply).toBeTruthy();
  });

  test("a comment lock blocks posting unless overridden", async () => {
    const t = setupTest();
    const seeded = await seed(t);
    await asUser(t, "mod").mutation(api.comments.lock, {
      targetType: "problem",
      targetKey: seeded.problemCode,
    });

    await expect(
      asUser(t, "solver").mutation(api.comments.post, {
        targetType: "problem",
        targetKey: seeded.problemCode,
        body: "locked out",
      }),
    ).rejects.toThrow(/disabled on this page/);

    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "solver"))
        .unique();

      if (profile) {
        await ctx.db.patch(profile._id, { permissions: ["judge.override_comment_lock"] });
      }
    });

    const id = await asUser(t, "solver").mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "override",
    });

    expect(id).toBeTruthy();

    await asUser(t, "mod").mutation(api.comments.unlock, {
      targetType: "problem",
      targetKey: seeded.problemCode,
    });

    const list = await t.query(api.comments.list, {
      targetType: "problem",
      targetKey: seeded.problemCode,
    });

    expect(list?.locked).toBe(false);
  });
});

describe("tree ordering and the hide threshold", () => {
  test("top level is newest first and replies are oldest first", async () => {
    const t = setupTest();
    const seeded = await seed(t);
    const solver = asUser(t, "solver");
    const other = asUser(t, "other");

    const first = await solver.mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "first root",
    });

    const second = await other.mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "second root",
    });

    const replyA = await other.mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      parentId: first,
      body: "reply a",
    });

    const replyB = await solver.mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      parentId: first,
      body: "reply b",
    });

    // Give every row a distinct, deterministic timestamp.
    await t.run(async (ctx) => {
      await ctx.db.patch(first, { time: 1_000 });
      await ctx.db.patch(second, { time: 2_000 });
      await ctx.db.patch(replyA, { time: 3_000 });
      await ctx.db.patch(replyB, { time: 4_000 });
    });

    const list = await t.query(api.comments.list, {
      targetType: "problem",
      targetKey: seeded.problemCode,
    });

    expect(list).not.toBeNull();
    expect(list?.comments.map((comment) => comment.body)).toEqual([
      "second root",
      "first root",
      "reply a",
      "reply b",
    ]);
    expect(list?.comments.map((comment) => comment.depth)).toEqual([0, 0, 1, 1]);
  });

  test("a comment at or below the threshold is flagged for collapsing", async () => {
    const t = setupTest();
    const seeded = await seed(t);

    const id = await asUser(t, "solver").mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "unpopular",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(id, { score: -5 });
    });

    const list = await t.query(api.comments.list, {
      targetType: "problem",
      targetKey: seeded.problemCode,
    });

    expect(list?.voteHideThreshold).toBe(-5);
    expect(list?.comments[0]?.belowThreshold).toBe(true);

    await t.run(async (ctx) => {
      await ctx.db.patch(id, { score: -4 });
    });

    const better = await t.query(api.comments.list, {
      targetType: "problem",
      targetKey: seeded.problemCode,
    });

    expect(better?.comments[0]?.belowThreshold).toBe(false);
  });

  test("hiding a comment hides its replies and drops them from the page", async () => {
    const t = setupTest();
    const seeded = await seed(t);

    const root = await asUser(t, "solver").mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "root",
    });

    await asUser(t, "other").mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      parentId: root,
      body: "child",
    });

    await asUser(t, "mod").mutation(api.comments.hide, {
      commentId: root,
    });

    const anonymous = await t.query(api.comments.list, {
      targetType: "problem",
      targetKey: seeded.problemCode,
    });

    expect(anonymous?.comments).toHaveLength(0);
    expect(anonymous?.hasComments).toBe(false);

    const asModerator = await asUser(t, "mod").query(api.comments.list, {
      targetType: "problem",
      targetKey: seeded.problemCode,
    });

    expect(asModerator?.comments).toHaveLength(2);
    expect(asModerator?.comments.every((comment) => comment.hidden)).toBe(true);

    await asUser(t, "mod").mutation(api.comments.unhide, {
      commentId: root,
      includeReplies: true,
    });

    const restored = await t.query(api.comments.list, {
      targetType: "problem",
      targetKey: seeded.problemCode,
    });

    expect(restored?.comments).toHaveLength(2);
  });
});

describe("voting", () => {
  test("an upvote raises the score and is recorded for the viewer", async () => {
    const t = setupTest();
    const seeded = await seed(t);

    const id = await asUser(t, "solver").mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "vote me",
    });

    const result = await asUser(t, "other").mutation(api.comments.vote, {
      commentId: id,
      delta: 1,
    });

    expect(result).toEqual({ score: 1, myVote: 1 });

    const list = await asUser(t, "other").query(api.comments.list, {
      targetType: "problem",
      targetKey: seeded.problemCode,
    });

    expect(list?.comments[0]?.score).toBe(1);
    expect(list?.comments[0]?.myVote).toBe(1);
  });

  test("voting the other way removes the vote, voting again is refused", async () => {
    const t = setupTest();
    const seeded = await seed(t);

    const id = await asUser(t, "solver").mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "vote me",
    });

    const voter = asUser(t, "other");

    await voter.mutation(api.comments.vote, { commentId: id, delta: 1 });
    await expect(voter.mutation(api.comments.vote, { commentId: id, delta: 1 })).rejects.toThrow(
      /already voted/,
    );

    const cleared = await voter.mutation(api.comments.vote, { commentId: id, delta: -1 });
    expect(cleared).toEqual({ score: 0, myVote: 0 });

    const down = await voter.mutation(api.comments.vote, { commentId: id, delta: -1 });
    expect(down).toEqual({ score: -1, myVote: -1 });

    const unvoted = await voter.mutation(api.comments.unvote, { commentId: id });
    expect(unvoted).toEqual({ score: 0, myVote: 0 });
  });

  test("nobody votes on their own comment, and unsolved users cannot vote", async () => {
    const t = setupTest();
    const seeded = await seed(t);

    const id = await asUser(t, "solver").mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "mine",
    });

    await expect(
      asUser(t, "solver").mutation(api.comments.vote, {
        commentId: id,
        delta: 1,
      }),
    ).rejects.toThrow(/own comments/);

    await expect(
      asUser(t, "newbie").mutation(api.comments.vote, {
        commentId: id,
        delta: 1,
      }),
    ).rejects.toThrow(/at least one problem/);
  });
});

describe("editing", () => {
  test("an edit bumps the revision counter and records the new body", async () => {
    const t = setupTest();
    const seeded = await seed(t);
    const solver = asUser(t, "solver");

    const id = await solver.mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "first draft",
    });

    await solver.mutation(api.comments.edit, { commentId: id, body: "second draft" });
    const history = await solver.query(api.comments.history, { commentId: id });
    expect(history?.map((revision) => revision.body)).toEqual(["first draft", "second draft"]);

    const list = await t.query(api.comments.list, {
      targetType: "problem",
      targetKey: seeded.problemCode,
    });

    expect(list?.comments[0]?.revisions).toBe(2);
    expect(list?.comments[0]?.body).toBe("second draft");
  });

  test("other users cannot edit, moderators can", async () => {
    const t = setupTest();
    const seeded = await seed(t);

    const id = await asUser(t, "solver").mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "mine",
    });

    await expect(
      asUser(t, "other").mutation(api.comments.edit, {
        commentId: id,
        body: "not yours",
      }),
    ).rejects.toThrow();

    await asUser(t, "mod").mutation(api.comments.edit, {
      commentId: id,
      body: "moderated",
    });

    const list = await t.query(api.comments.list, {
      targetType: "problem",
      targetKey: seeded.problemCode,
    });

    expect(list?.comments[0]?.body).toBe("moderated");
  });
});

describe("recent comments", () => {
  test("comments on inaccessible pages are skipped", async () => {
    const t = setupTest();
    const seeded = await seed(t);
    await asUser(t, "solver").mutation(api.comments.post, {
      targetType: "problem",
      targetKey: seeded.problemCode,
      body: "public",
    });

    await t.run(async (ctx) => {
      await insertProblem(ctx, { code: "hidden", isPublic: false });

      const author = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", "solver"))
        .unique();

      if (!author) throw new Error("no author");
      await ctx.db.insert("comments", {
        targetType: "problem",
        targetKey: "hidden",
        authorProfileId: author._id,
        time: Date.now(),
        score: 0,
        body: "secret",
        hidden: false,
        revisions: 1,
      });
    });

    const recent = await t.query(api.comments.recent, { limit: 10 });
    expect(recent.map((comment) => comment.body)).toEqual(["public"]);
  });
});
