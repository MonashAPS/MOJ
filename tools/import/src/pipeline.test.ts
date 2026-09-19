import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ImportContext } from "./context.ts";
import { isJsonArray, isJsonObject, type JsonObject, type JsonValue, parseJson } from "./json.ts";
import { DryRunLoader, type Loader } from "./loader.ts";
import { runPipeline, type StateFile } from "./pipeline.ts";
import { reportToJson } from "./report.ts";
import { makeFixtureContext } from "./test.fixtures.ts";

function parseDoc(line: string): JsonObject {
  const parsed = parseJson(line);

  if (!isJsonObject(parsed)) throw new Error(`not a document: ${line}`);

  return parsed;
}

/** Fails the test outright when a field the assertion counts is not a list. */
function list(value: JsonValue | undefined): JsonValue[] {
  if (!isJsonArray(value)) throw new Error(`expected a list, got ${JSON.stringify(value)}`);

  return value;
}

function docs(dir: string, table: string): JsonObject[] {
  const file = path.join(dir, "docs", `${table}.jsonl`);
  const text = readFileSync(file, "utf8").trim();

  if (text === "") return [];

  return text.split("\n").map(parseDoc);
}

describe("full transform over a fixture dump", () => {
  let ctx: ImportContext;
  let dir: string;
  let loader: Loader;

  beforeAll(async () => {
    const fixture = await makeFixtureContext();
    ctx = fixture.ctx;
    dir = fixture.dir;
    loader = fixture.loader;
    const state: StateFile = { mode: "dry-run", dump: "fixture", startedAt: "", finished: {} };
    await runPipeline(ctx, state, { resume: false, log: () => {} });
    await ctx.closeEmitters();
  });

  it("maps languages including the shiki language", () => {
    const [language] = docs(dir, "languages");
    expect(language).toMatchObject({
      key: "PY3",
      name: "Python 3",
      shortName: "",
      editorMode: "python",
      shikiLang: "python",
      legacyId: 5,
    });
  });

  it("adds the judge's languages that the source never offered", () => {
    const keys = docs(dir, "languages").map((row) => row.key);

    expect(keys).toContain("NODEJS");
    expect(keys).toContain("CPP20");
    // Backfilled rows are not from the source, so they carry no legacy id.
    const node = docs(dir, "languages").find((row) => row.key === "NODEJS");
    expect(node).toMatchObject({ name: "Node.js", extension: "js", shikiLang: "javascript" });
    expect(node?.legacyId).toBeUndefined();
  });

  it("leaves a language the source did provide alone", () => {
    const rows = docs(dir, "languages").filter((row) => row.key === "PY3");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.legacyId).toBe(5);
  });

  it("joins auth_user and judge_profile, with permissions from both groups and direct grants", () => {
    const profiles = docs(dir, "profiles");
    expect(profiles).toHaveLength(3);
    const root = profiles.find((p) => p.username === "root");
    expect(root).toMatchObject({
      userId: "u1",
      legacyUserId: 1,
      isStaff: true,
      isSuperuser: true,
      displayRank: "admin",
      rating: 1500,
      legacyApiTokenHash: "abc123",
      groups: ["Site Admin"],
      siteTheme: "auto",
      editorTheme: "auto",
    });
    expect(root?.permissions).toEqual(["judge.edit_all_problem", "judge.rejudge_submission"]);
    expect(root?.joinDate).toBe(Date.UTC(2020, 0, 1));
    const ghost = profiles.find((p) => p.username === "ghost");
    expect(ghost).toMatchObject({ about: "", notes: "", isUnlisted: true, siteTheme: "dark" });
    expect(ghost?.rating).toBeUndefined();
  });

  it("falls back to the user display rank when the stored one is unknown", () => {
    const wizard = docs(dir, "profiles").find((p) => p.username === "dup");
    expect(wizard?.displayRank).toBe("user");
    const report = reportToJson(ctx);
    expect(report.warnings.some((w) => w.reason.includes("unknown display_rank wizard"))).toBe(true);
  });

  it("keeps organisation membership order and counts members", () => {
    const [organization] = docs(dir, "organizations");
    expect(organization).toMatchObject({ slug: "maps", memberCount: 2 });
    expect(list(organization?.adminProfileIds)).toHaveLength(1);
    const memberships = docs(dir, "organizationMemberships");
    expect(memberships.map((m) => m.order)).toEqual([3, 0]);
  });

  it("resolves problem foreign keys and drops references to missing rows", () => {
    const problems = docs(dir, "problems");
    expect(problems).toHaveLength(2);
    const aplusb = problems[0];
    expect(aplusb).toMatchObject({
      code: "aplusb",
      description: "Add 'em up",
      timeLimit: 2,
      memoryLimit: 65536,
      submissionSourceVisibility: "A",
      date: Date.UTC(2023, 2, 4, 5, 6, 7),
    });
    expect(list(aplusb?.authorProfileIds)).toHaveLength(1);
    expect(list(aplusb?.typeIds)).toHaveLength(1);
    expect(list(aplusb?.allowedLanguageIds)).toHaveLength(1);
    expect(aplusb?.licenseId).toBeDefined();

    const orphan = problems[1];
    expect(orphan?.date).toBe(0);
    expect(orphan?.submissionSourceVisibility).toBe("F");
    expect(orphan?.licenseId).toBeUndefined();
  });

  it("converts a contest duration from microseconds into a window in seconds", () => {
    const contests = docs(dir, "contests");
    expect(contests[0]).toMatchObject({
      key: "week1",
      schedule: { kind: "window", seconds: 18000 },
      formatName: "icpc",
      scoreboard: { audiences: ["everyone"], from: "end" },
      labels: { kind: "letters" },
      pointsPrecision: 2,
    });
    expect(contests[0]?.formatConfig).toEqual({ penalty: 20 });
    expect(contests[0]?.freeze).toBeUndefined();
    expect(contests[1]).toMatchObject({
      schedule: { kind: "together" },
      scoreboard: { audiences: ["everyone"], from: "start" },
    });
  });

  it("letters every contest's problems, whatever its format or label script", () => {
    const contests = docs(dir, "contests");

    // week2 carries a Lua problem_label_script, which is not portable.
    for (const contest of contests) expect(contest.labels).toEqual({ kind: "letters" });
  });

  it("rekeys format_data from ContestProblem ids to the imported ids", () => {
    const [first, second] = docs(dir, "contestParticipations");
    // The dump keys by judge_contestproblem.id: 1 and 4 exist, 999 does not.
    expect(first?.formatData).toEqual({
      dry_contestProblems_1: { points: 100 },
      dry_contestProblems_4: { points: 50 },
    });
    expect(second?.formatData).toBeNull();
  });

  it("folds judge_contestsubmission into the submission", () => {
    const submissions = docs(dir, "submissions");
    expect(submissions).toHaveLength(2);
    expect(submissions[0]).toMatchObject({
      status: "D",
      result: "AC",
      contestPoints: 100,
      isContestPretest: false,
      priority: 1,
      retryCount: 0,
      isArchived: false,
    });
    expect(submissions[0]?.contestId).toBeDefined();
    expect(submissions[0]?.contestProblemId).toBeDefined();
    expect(submissions[0]?.participationId).toBeDefined();
    expect(submissions[1]).toMatchObject({ status: "QU" });
    expect(submissions[1]?.contestProblemId).toBeUndefined();
  });

  it("drops a submission whose profile is gone and reports it", () => {
    const report = reportToJson(ctx);
    expect(report.skipped.some((s) => s.table === "submissions")).toBe(true);
    expect(report.unresolved.some((u) => u.from === "judge_submission" && u.target === "profiles")).toBe(
      true,
    );
  });

  it("maps comment pages to targets and keeps the reply parent", () => {
    const comments = docs(dir, "comments");
    const targets = comments.map((c) => `${c.targetType}:${c.targetKey}`);
    expect(targets).toContain("problem:aplusb");
    expect(targets).toContain("contest:week1");
    expect(targets).toContain("solution:aplusb");
    const blog = comments.find((c) => c.targetType === "blog");
    const blogPost = docs(dir, "blogPosts")[0];
    expect(blog?.targetKey).toBe(blogPost?.legacyId ? `dry_blogPosts_7` : undefined);
    const reply = comments.find((c) => c.legacyId === 2);
    expect(reply?.parentId).toBe("dry_comments_1");
    const report = reportToJson(ctx);
    expect(report.skipped.some((s) => s.reason.includes("unrecognised page x:weird"))).toBe(true);
  });

  it("links a ticket to a problem by code and keeps other links by legacy id", () => {
    const tickets = docs(dir, "tickets");
    expect(tickets[0]).toMatchObject({ linkedType: "problem", linkedKey: "aplusb" });
    expect(tickets[1]).toMatchObject({ linkedType: "profile", linkedKey: "2" });
  });

  it("orders the navigation bar parents before children", () => {
    const nav = docs(dir, "navigationBar");
    expect(nav.map((n) => n.key)).toEqual(["root", "child"]);
    expect(nav[0]?.parentId).toBeUndefined();
    expect(nav[1]?.parentId).toBe("dry_navigationBar_1");
  });

  it("imports only problem, contest and comment revisions", () => {
    const revisions = docs(dir, "revisions");
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      entityType: "problems",
      reason: "Fixed a typo",
      createdAt: Date.UTC(2024, 1, 20),
    });
    expect(revisions[0]?.snapshot).toEqual([{ model: "judge.problem", pk: 1, fields: { name: "A plus B" } }]);
  });

  it("patches the deferred current participation pointer", () => {
    expect(loader).toBeInstanceOf(DryRunLoader);

    if (!(loader instanceof DryRunLoader)) throw new Error("the fixture did not use a dry run loader");

    expect(loader.patched.get("profiles")).toBe(1);
  });

  it("reports the columns it never read", () => {
    const report = reportToJson(ctx);
    const profile = report.unmappedColumns.find((entry) => entry.table === "judge_profile");
    expect(profile?.columns).toContain("user_script");
    expect(profile?.columns).not.toContain("timezone");
  });
});

describe("selected tables", () => {
  it("only writes the tables named in --tables", async () => {
    const fixture = await makeFixtureContext(undefined, new Set(["languages", "problemTypes"]));
    const state: StateFile = { mode: "dry-run", dump: "fixture", startedAt: "", finished: {} };
    await runPipeline(fixture.ctx, state, { resume: false, log: () => {} });
    await fixture.ctx.closeEmitters();
    expect(docs(fixture.dir, "languages").length).toBeGreaterThan(1);
    expect(() => docs(fixture.dir, "profiles")).toThrow();
  });
});
