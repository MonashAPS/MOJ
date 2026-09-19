/**
 * Who may download a file attached to a contest or a problem, and who may put
 * one there.
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { identityOf, insertContest, insertProblem, insertProfile } from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

const HOUR = 3_600_000;

async function seed(t: T, endsIn: number) {
  return await t.run(async (ctx) => {
    const author = await insertProfile(ctx, {
      username: "author",
      isStaff: true,
      permissions: ["judge.edit_own_problem", "judge.edit_own_contest"],
    });

    await insertProfile(ctx, { username: "reader" });
    const now = Date.now();

    const contestId = await insertContest(ctx, {
      key: "weekly",
      startTime: now - HOUR,
      endTime: now + endsIn,
      authorProfileIds: [author],
    });

    const problemId = await insertProblem(ctx, { code: "alpha", isPublic: true, authorProfileIds: [author] });

    const attach = async (
      owner:
        | { kind: "contest"; contestId: typeof contestId }
        | { kind: "problem"; problemId: typeof problemId },
      name: string,
      visibility: "staff" | "everyone" | "afterEnd",
    ) =>
      await ctx.db.insert("artefacts", {
        owner,
        name,
        storageId: await ctx.storage.store(new Blob([name])),
        size: name.length,
        contentType: "text/plain",
        visibility,
        uploadedByProfileId: author,
        uploadedAt: now,
      });

    await attach({ kind: "contest", contestId }, "staff.txt", "staff");
    await attach({ kind: "contest", contestId }, "everyone.txt", "everyone");
    await attach({ kind: "contest", contestId }, "editorial.pdf", "afterEnd");
    await attach({ kind: "problem", problemId }, "data.zip", "everyone");

    return { contestId, problemId };
  });
}

async function namesFor(t: T, username: string | null, key = "weekly"): Promise<string[]> {
  const client = username ? t.withIdentity(identityOf(username)) : t;
  const rows = await client.query(api.artefacts.forContest, { key });

  return rows.map((row) => row.name);
}

describe("a contest's files", () => {
  it("show an editor everything and a reader only what is for everyone", async () => {
    const t = setupTest();
    await seed(t, HOUR);

    expect(await namesFor(t, "author")).toEqual(["editorial.pdf", "everyone.txt", "staff.txt"]);
    expect(await namesFor(t, "reader")).toEqual(["everyone.txt"]);
    expect(await namesFor(t, null)).toEqual(["everyone.txt"]);
  });

  it("release a file held for afterwards once the contest has ended", async () => {
    const t = setupTest();
    await seed(t, -HOUR);

    expect(await namesFor(t, "reader")).toEqual(["editorial.pdf", "everyone.txt"]);
  });

  it("answer nothing for a contest the viewer cannot see", async () => {
    const t = setupTest();
    await seed(t, HOUR);
    await t.run(async (ctx) => {
      const contest = await ctx.db
        .query("contests")
        .withIndex("by_key", (q) => q.eq("key", "weekly"))
        .unique();

      if (contest) await ctx.db.patch(contest._id, { isVisible: false });
    });

    expect(await namesFor(t, "reader")).toEqual([]);
    expect(await namesFor(t, "author")).toEqual(["editorial.pdf", "everyone.txt", "staff.txt"]);
  });
});

describe("downloading", () => {
  it("hands over the file only to somebody who may see it", async () => {
    const t = setupTest();
    await seed(t, HOUR);

    const staffFile = await t.run(async (ctx) => {
      const rows = await ctx.db.query("artefacts").collect();

      return rows.find((row) => row.name === "staff.txt")?._id;
    });

    if (!staffFile) throw new Error("fixture");

    const asReader = await t
      .withIdentity(identityOf("reader"))
      .query(api.artefacts.download, { id: staffFile });

    expect(asReader).toBeNull();

    const asAuthor = await t
      .withIdentity(identityOf("author"))
      .query(api.artefacts.download, { id: staffFile });

    expect(asAuthor?.name).toBe("staff.txt");
    expect(asAuthor?.url).toBeTypeOf("string");
  });
});

describe("attaching a file", () => {
  it("is for the owner's editors", async () => {
    const t = setupTest();
    await seed(t, HOUR);

    await expect(
      t.withIdentity(identityOf("reader")).mutation(api.admin.artefacts.uploadUrl, {
        owner: { kind: "contest", key: "weekly" },
      }),
    ).rejects.toThrow();

    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["hello"])));

    const id = await t.withIdentity(identityOf("author")).mutation(api.admin.artefacts.add, {
      owner: { kind: "problem", code: "alpha" },
      storageId,
      name: "notes.txt",
      contentType: "text/plain",
      visibility: "staff",
    });

    const asReader = await t
      .withIdentity(identityOf("reader"))
      .query(api.artefacts.forProblem, { code: "alpha" });

    expect(asReader.map((row) => row.name)).toEqual(["data.zip"]);

    await t
      .withIdentity(identityOf("author"))
      .mutation(api.admin.artefacts.update, { id, visibility: "everyone" });
    const now = await t.withIdentity(identityOf("reader")).query(api.artefacts.forProblem, { code: "alpha" });
    expect(now.map((row) => row.name)).toEqual(["data.zip", "notes.txt"]);

    await t.withIdentity(identityOf("author")).mutation(api.admin.artefacts.remove, { id });

    const after = await t
      .withIdentity(identityOf("author"))
      .query(api.artefacts.forProblem, { code: "alpha" });

    expect(after.map((row) => row.name)).toEqual(["data.zip"]);

    const reasons = await t.run(async (ctx) =>
      (await ctx.db.query("revisions").collect()).map((row) => row.reason),
    );

    expect(reasons).toEqual(
      expect.arrayContaining(["Added file notes.txt", "Changed file notes.txt", "Removed file notes.txt"]),
    );
  });

  it("refuses afterwards on a problem, which has no end", async () => {
    const t = setupTest();
    await seed(t, HOUR);
    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["hello"])));

    await expect(
      t.withIdentity(identityOf("author")).mutation(api.admin.artefacts.add, {
        owner: { kind: "problem", code: "alpha" },
        storageId,
        name: "notes.txt",
        contentType: "text/plain",
        visibility: "afterEnd",
      }),
    ).rejects.toThrow(/either for staff or for everyone/);
  });
});
