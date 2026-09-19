/**
 * Who may download a file attached to a contest or a problem, by audience, and
 * who may put one there.
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import {
  identityOf,
  insertContest,
  insertParticipation,
  insertProblem,
  insertProfile,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

const HOUR = 3_600_000;

async function seed(t: T, endsIn: number) {
  return await t.run(async (ctx) => {
    const author = await insertProfile(ctx, {
      username: "author",
      isStaff: true,
      permissions: ["judge.edit_own_problem", "judge.edit_own_contest"],
    });

    const tester = await insertProfile(ctx, { username: "tester" });
    const spectator = await insertProfile(ctx, { username: "spectator" });
    const contestant = await insertProfile(ctx, { username: "contestant" });
    await insertProfile(ctx, { username: "reader" });
    const now = Date.now();

    const contestId = await insertContest(ctx, {
      key: "weekly",
      startTime: now - HOUR,
      endTime: now + endsIn,
      authorProfileIds: [author],
      testerProfileIds: [tester],
      spectatorProfileIds: [spectator],
    });

    await insertParticipation(ctx, { contestId, profileId: contestant, realStart: now - HOUR });

    const problemId = await insertProblem(ctx, {
      code: "alpha",
      isPublic: true,
      authorProfileIds: [author],
      testerProfileIds: [tester],
    });

    const attach = async (
      owner:
        | { kind: "contest"; contestId: typeof contestId }
        | { kind: "problem"; problemId: typeof problemId },
      name: string,
      audiences: ("staff" | "testers" | "spectators" | "contestants" | "everyone")[],
      from: "start" | "end" = "start",
    ) =>
      await ctx.db.insert("artefacts", {
        owner,
        name,
        storageId: await ctx.storage.store(new Blob([name])),
        size: name.length,
        contentType: "text/plain",
        audiences,
        from,
        uploadedByProfileId: author,
        uploadedAt: now,
      });

    await attach({ kind: "contest", contestId }, "staff.txt", []);
    await attach({ kind: "contest", contestId }, "testers.txt", ["testers"]);
    await attach({ kind: "contest", contestId }, "booklet.pdf", ["contestants", "spectators"]);
    await attach({ kind: "contest", contestId }, "everyone.txt", ["everyone"]);
    await attach({ kind: "contest", contestId }, "editorial.pdf", ["everyone"], "end");
    await attach({ kind: "problem", problemId }, "data.zip", ["everyone"]);
    await attach({ kind: "problem", problemId }, "checker.cpp", ["testers"]);

    return { contestId, problemId };
  });
}

async function namesFor(t: T, username: string | null, key = "weekly"): Promise<string[]> {
  const client = username ? t.withIdentity(identityOf(username)) : t;
  const rows = await client.query(api.artefacts.forContest, { key });

  return rows.map((row) => row.name);
}

describe("a contest's files, by audience", () => {
  it("show each audience its own files and staff everything", async () => {
    const t = setupTest();
    await seed(t, HOUR);

    expect(await namesFor(t, "author")).toEqual([
      "booklet.pdf",
      "editorial.pdf",
      "everyone.txt",
      "staff.txt",
      "testers.txt",
    ]);
    expect(await namesFor(t, "tester")).toEqual(["everyone.txt", "testers.txt"]);
    expect(await namesFor(t, "spectator")).toEqual(["booklet.pdf", "everyone.txt"]);
    expect(await namesFor(t, "contestant")).toEqual(["booklet.pdf", "everyone.txt"]);
    expect(await namesFor(t, "reader")).toEqual(["everyone.txt"]);
    expect(await namesFor(t, null)).toEqual(["everyone.txt"]);
  });

  it("release a file held until the end once the contest has ended", async () => {
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
    expect((await namesFor(t, "author")).length).toBe(5);
  });
});

describe("a problem's files", () => {
  it("go to its testers and to everyone who can see it", async () => {
    const t = setupTest();
    await seed(t, HOUR);

    const names = async (username: string) =>
      (await t.withIdentity(identityOf(username)).query(api.artefacts.forProblem, { code: "alpha" })).map(
        (row) => row.name,
      );

    expect(await names("tester")).toEqual(["checker.cpp", "data.zip"]);
    expect(await names("reader")).toEqual(["data.zip"]);
  });
});

describe("downloading", () => {
  it("hands over the file only to somebody in its audience", async () => {
    const t = setupTest();
    await seed(t, HOUR);

    const testersFile = await t.run(async (ctx) => {
      const rows = await ctx.db.query("artefacts").collect();

      return rows.find((row) => row.name === "testers.txt")?._id;
    });

    if (!testersFile) throw new Error("fixture");

    const asReader = await t
      .withIdentity(identityOf("reader"))
      .query(api.artefacts.download, { id: testersFile });

    expect(asReader).toBeNull();

    const asTester = await t
      .withIdentity(identityOf("tester"))
      .query(api.artefacts.download, { id: testersFile });

    expect(asTester?.name).toBe("testers.txt");
    expect(asTester?.url).toBeTypeOf("string");
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
      audiences: [],
      from: "start",
    });

    const asReader = async () =>
      (await t.withIdentity(identityOf("reader")).query(api.artefacts.forProblem, { code: "alpha" })).map(
        (row) => row.name,
      );

    expect(await asReader()).toEqual(["data.zip"]);

    await t
      .withIdentity(identityOf("author"))
      .mutation(api.admin.artefacts.update, { id, audiences: ["everyone"] });

    expect(await asReader()).toEqual(["data.zip", "notes.txt"]);

    await t.withIdentity(identityOf("author")).mutation(api.admin.artefacts.remove, { id });
    expect(await asReader()).toEqual(["data.zip"]);

    const reasons = await t.run(async (ctx) =>
      (await ctx.db.query("revisions").collect()).map((row) => row.reason),
    );

    expect(reasons).toEqual(
      expect.arrayContaining(["Added file notes.txt", "Changed file notes.txt", "Removed file notes.txt"]),
    );
  });

  it("refuses an audience a problem does not have", async () => {
    const t = setupTest();
    await seed(t, HOUR);
    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["hello"])));

    await expect(
      t.withIdentity(identityOf("author")).mutation(api.admin.artefacts.add, {
        owner: { kind: "problem", code: "alpha" },
        storageId,
        name: "notes.txt",
        contentType: "text/plain",
        audiences: ["contestants"],
        from: "start",
      }),
    ).rejects.toThrow(/staff, testers or everyone/);
  });
});
