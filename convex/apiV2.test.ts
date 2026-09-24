// @vitest-environment edge-runtime

/**
 * API v2 object shapes.
 *
 * Every endpoint's `data` block is validated against the zod schema in
 * `@moj/protocol`, which is a transcription of `judge/views/api/api_v2.py`, and
 * then snapshotted so a field rename cannot slip through unnoticed. `strict()`
 * makes an extra field a failure, not a warning: DMOJ clients read these
 * objects by name and an unexpected key is a compatibility break.
 */

import {
  API_PAGE_SIZE,
  apiContestDetailObject,
  apiContestListObject,
  apiJudgeObject,
  apiLanguageObject,
  apiOrganizationObject,
  apiParticipationObject,
  apiProblemDetailObject,
  apiProblemListObject,
  apiSubmissionDetailObject,
  apiSubmissionListObject,
  apiUserDetailObject,
  apiUserListObject,
  listData,
} from "@moj/protocol";
import type { Value } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import type { z } from "zod";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  asUser,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertMembership,
  insertOrganization,
  insertParticipation,
  insertProblem,
  insertProblemGroup,
  insertProblemType,
  insertProfile,
  insertSubmission,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

type Fixture = {
  t: T;
  ids: {
    alice: Id<"profiles">;
    problem: Id<"problems">;
    contest: Id<"contests">;
    submission: Id<"submissions">;
  };
};

/** One small world that every endpoint reads: DMOJ's shapes need real joins. */
async function seed(): Promise<Fixture> {
  const t = setupTest();

  const ids = await t.run(async (ctx) => {
    const alice = await insertProfile(ctx, {
      username: "alice",
      legacyUserId: 1,
      legacyId: 1,
      points: 150,
      performancePoints: 142.5,
      problemCount: 2,
      rating: 1500,
    });

    await insertProfile(ctx, { username: "hidden", isUnlisted: true, legacyId: 2 });
    await insertProfile(ctx, { username: "gone", isActive: false, legacyId: 3 });

    const organization = await insertOrganization(ctx, {
      slug: "maps",
      name: "MAPS",
      shortName: "MAPS",
      legacyId: 11,
    });

    await insertMembership(ctx, { organizationId: organization, profileId: alice });
    await ctx.db.patch(organization, { memberCount: 1 });

    const type = await insertProblemType(ctx, { name: "dp", fullName: "Dynamic Programming" });
    const group = await insertProblemGroup(ctx, { name: "Uncategorised" });

    const language = await insertLanguage(ctx, {
      key: "PY3",
      commonName: "Python",
      legacyId: 21,
    });

    const problem = await insertProblem(ctx, {
      code: "aplusb",
      groupId: group,
      name: "A Plus B",
      points: 100,
      typeIds: [type],
      allowedLanguageIds: [language],
      authorProfileIds: [alice],
    });

    await ctx.db.insert("languageLimits", {
      problemId: problem,
      languageId: language,
      timeLimit: 5,
      memoryLimit: 131072,
    });

    const tag = await ctx.db.insert("contestTags", {
      name: "beginner",
      color: "#fff",
      description: "",
    });

    const contest = await insertContest(ctx, {
      key: "spring",
      name: "Spring Contest",
      startTime: Date.UTC(2024, 2, 1),
      endTime: Date.UTC(2024, 2, 2),
      problemListReleaseAt: "end",
      rating: { everyone: false, excludeProfileIds: [] },
      tagIds: [tag],
      legacyId: 31,
      formatConfig: {},
    });

    const contestProblem = await insertContestProblem(ctx, {
      contestId: contest,
      problemId: problem,
      points: 100,
      order: 0,
      maxSubmissions: 5,
    });

    const participation = await insertParticipation(ctx, {
      contestId: contest,
      profileId: alice,
      realStart: Date.UTC(2024, 2, 1),
      score: 100,
      cumtime: 600,
      formatData: { [contestProblem]: { points: 100, time: 600 } },
    });

    await ctx.db.insert("ratings", {
      profileId: alice,
      contestId: contest,
      participationId: participation,
      rank: 1,
      rating: 1500,
      mean: 1490,
      performance: 1700,
      lastRated: Date.UTC(2024, 2, 2),
    });

    const submission = await insertSubmission(ctx, {
      profileId: alice,
      problemId: problem,
      languageId: language,
      date: Date.UTC(2024, 2, 1, 0, 10),
      points: 100,
      result: "AC",
      casePoints: 1,
      caseTotal: 1,
      time: 0.05,
      memory: 4096,
      legacyId: 41,
    });

    await ctx.db.patch(submission, {
      contestId: contest,
      contestProblemId: contestProblem,
      participationId: participation,
      contestPoints: 100,
    });
    await ctx.db.insert("submissionTestCases", {
      submissionId: submission,
      case: 1,
      status: "AC",
      time: 0.02,
      memory: 2048,
      points: 1,
      total: 1,
      feedback: "",
      extendedFeedback: "",
      output: "",
    });
    await ctx.db.insert("submissionTestCases", {
      submissionId: submission,
      case: 2,
      status: "AC",
      time: 0.03,
      memory: 4096,
      points: 2,
      total: 3,
      batch: 1,
      feedback: "",
      extendedFeedback: "",
      output: "",
    });
    await ctx.db.insert("submissionTestCases", {
      submissionId: submission,
      case: 3,
      status: "WA",
      time: 0.01,
      memory: 4096,
      points: 1,
      total: 4,
      batch: 1,
      feedback: "",
      extendedFeedback: "",
      output: "",
    });

    const judge = await ctx.db.insert("judges", {
      name: "judge-1",
      authKeyHash: "x",
      isBlocked: false,
      isDisabled: false,
      tier: 0,
      online: true,
      startTime: Date.UTC(2024, 2, 1),
      ping: 12.5,
      load: 0.25,
      description: "",
      runtimeKeys: ["PY3"],
    });

    await ctx.db.insert("runtimeVersions", {
      languageId: language,
      judgeId: judge,
      name: "python3",
      version: "3.12.0",
      priority: 0,
    });

    return { alice, problem, contest, submission };
  });

  return { t, ids };
}

/** DMOJ's list block, with the extra-key check zod does not do by default. */
function expectListBlock<T extends z.ZodTypeAny>(object: T, data: Value) {
  const parsed = listData(object).parse(data);
  expect(parsed.objects_per_page).toBe(API_PAGE_SIZE);
  expect(parsed.page_index).toBe(1);
  expect(parsed.current_object_count).toBe(parsed.objects.length);

  return parsed;
}

let fixture: Fixture;

beforeEach(async () => {
  fixture = await seed();
});

describe("contests", () => {
  test("the list object is DMOJ's", async () => {
    const data = await fixture.t.query(api.apiV2.contests, {});
    const parsed = expectListBlock(apiContestListObject, data);
    expect(parsed.objects).toEqual([
      {
        key: "spring",
        name: "Spring Contest",
        start_time: "2024-03-01T00:00:00.000Z",
        end_time: "2024-03-02T00:00:00.000Z",
        time_limit: null,
        is_rated: true,
        rate_all: false,
        tags: ["beginner"],
      },
    ]);
    expect(parsed.total_objects).toBe(1);
    expect(parsed.total_pages).toBe(1);
    expect(parsed.has_more).toBe(false);
  });

  test("filters narrow the list", async () => {
    expect((await fixture.t.query(api.apiV2.contests, { key: ["nope"] })).objects).toHaveLength(0);
    expect((await fixture.t.query(api.apiV2.contests, { tag: ["beginner"] })).objects).toHaveLength(1);
    expect((await fixture.t.query(api.apiV2.contests, { is_rated: false })).objects).toHaveLength(0);
  });

  test("the detail object carries problems and rankings", async () => {
    const object = await fixture.t.query(api.apiV2.contest, { key: "spring" });
    const parsed = apiContestDetailObject.parse(object);

    expect(parsed.problems).toEqual([
      {
        points: 100,
        partial: false,
        is_pretested: false,
        max_submissions: 5,
        label: "A",
        name: "A Plus B",
        code: "aplusb",
      },
    ]);
    expect(parsed.rankings).toHaveLength(1);
    expect(parsed.rankings[0]).toMatchObject({
      user: "alice",
      score: 100,
      cumulative_time: 600,
      tiebreaker: 0,
      old_rating: null,
      new_rating: 1500,
      is_disqualified: false,
    });
    expect(parsed.rankings[0]?.solutions).toEqual([{ points: 100, time: 600 }]);
    expect(parsed).toMatchObject({
      has_rating: true,
      hidden_scoreboard: false,
      scoreboard_visibility: "V",
      is_organization_private: false,
      organizations: [],
      is_private: false,
      format: { name: "default", config: {} },
    });
  });

  test("an ended contest with no list release does not expose its problem association", async () => {
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.ids.contest, { problemListReleaseAt: null });
    });

    const object = await fixture.t.query(api.apiV2.contest, { key: "spring" });

    expect(object.problems).toEqual([
      {
        kind: "restricted",
        points: 100,
        partial: false,
        is_pretested: false,
        max_submissions: 5,
        label: "A",
      },
    ]);
    expect(apiContestDetailObject.parse(object)).toEqual(object);
    expect(object.rankings[0]?.solutions).toEqual([{ points: 100, time: 600 }]);
  });

  test.each(["private", "missing"])(
    "%s problem A retains its score slot before accessible B",
    async (state) => {
      await fixture.t.run(async (ctx) => {
        if (state === "private") {
          await ctx.db.patch(fixture.ids.problem, { isPublic: false });
        } else {
          await ctx.db.delete(fixture.ids.problem);
        }

        const problemId = await insertProblem(ctx, { code: "second" });

        const linkId = await insertContestProblem(ctx, {
          contestId: fixture.ids.contest,
          problemId,
          order: 1,
        });

        const participation = await ctx.db
          .query("contestParticipations")
          .withIndex("by_profile_contest", (q) =>
            q.eq("profileId", fixture.ids.alice).eq("contestId", fixture.ids.contest),
          )
          .first();

        if (!participation) throw new Error("Missing participation fixture");
        await ctx.db.patch(participation._id, {
          formatData: { ...participation.formatData, [linkId]: { points: 25, time: 900 } },
        });
      });

      const object = await fixture.t.query(api.apiV2.contest, { key: "spring" });
      expect(apiContestDetailObject.parse(object)).toEqual(object);
      expect(object.problems).toEqual([
        {
          kind: "restricted",
          label: "A",
          points: 100,
          partial: false,
          is_pretested: false,
          max_submissions: 5,
        },
        {
          label: "B",
          points: 100,
          partial: false,
          is_pretested: false,
          max_submissions: null,
          name: "SECOND",
          code: "second",
        },
      ]);
      expect(object.rankings[0]?.solutions).toEqual([
        { points: 100, time: 600 },
        { points: 25, time: 900 },
      ]);
    },
  );

  test("an unknown contest is a not-found error", async () => {
    await expect(fixture.t.query(api.apiV2.contest, { key: "nope" })).rejects.toThrow(/not found/);
  });

  test("an invisible contest is not found for anonymous callers", async () => {
    await fixture.t.run(async (ctx) => {
      await insertContest(ctx, { key: "secret", isVisible: false });
    });
    await expect(fixture.t.query(api.apiV2.contest, { key: "secret" })).rejects.toThrow(/not found/);
    expect((await fixture.t.query(api.apiV2.contests, {})).objects).toHaveLength(1);
  });
});

describe("participations", () => {
  test("the object is DMOJ's", async () => {
    const data = await fixture.t.query(api.apiV2.participations, {});
    const parsed = expectListBlock(apiParticipationObject, data);
    expect(parsed.objects).toEqual([
      {
        user: "alice",
        contest: "spring",
        start_time: "2024-03-01T00:00:00.000Z",
        end_time: "2024-03-02T00:00:00.000Z",
        score: 100,
        cumulative_time: 600,
        tiebreaker: 0,
        is_disqualified: false,
        virtual_participation_number: 0,
      },
    ]);
  });

  test("filters narrow the list", async () => {
    expect((await fixture.t.query(api.apiV2.participations, { user: "nobody" })).objects).toHaveLength(0);
    expect((await fixture.t.query(api.apiV2.participations, { contest: "spring" })).objects).toHaveLength(1);
    expect((await fixture.t.query(api.apiV2.participations, { is_disqualified: true })).objects).toHaveLength(
      0,
    );
  });
});

describe("problems", () => {
  test("the list object is DMOJ's", async () => {
    const data = await fixture.t.query(api.apiV2.problems, {});
    const parsed = expectListBlock(apiProblemListObject, data);
    expect(parsed.objects).toEqual([
      {
        code: "aplusb",
        name: "A Plus B",
        types: ["Dynamic Programming"],
        group: "Uncategorised",
        points: 100,
        partial: false,
        is_organization_private: false,
        is_public: true,
      },
    ]);
  });

  test("the detail object is DMOJ's", async () => {
    const object = await fixture.t.query(api.apiV2.problem, { code: "aplusb" });
    expect(apiProblemDetailObject.parse(object)).toEqual({
      code: "aplusb",
      name: "A Plus B",
      authors: ["alice"],
      types: ["Dynamic Programming"],
      group: "Uncategorised",
      time_limit: 1,
      memory_limit: 65536,
      language_resource_limits: [{ language: "PY3", time_limit: 5, memory_limit: 131072 }],
      points: 100,
      partial: false,
      short_circuit: false,
      languages: ["PY3"],
      is_organization_private: false,
      organizations: [],
      is_public: true,
    });
  });

  test("a private problem is hidden from anonymous callers", async () => {
    await fixture.t.run(async (ctx) => {
      const group = await insertProblemGroup(ctx, { name: "Hidden" });
      await insertProblem(ctx, { code: "secret", groupId: group, isPublic: false });
    });
    expect((await fixture.t.query(api.apiV2.problems, {})).objects).toHaveLength(1);
    await expect(fixture.t.query(api.apiV2.problem, { code: "secret" })).rejects.toThrow(/not found/);
  });
});

describe("users", () => {
  test("the list object is DMOJ's and skips unlisted and inactive users", async () => {
    const data = await fixture.t.query(api.apiV2.users, {});
    const parsed = expectListBlock(apiUserListObject, data);
    expect(parsed.objects).toEqual([
      {
        id: 1,
        username: "alice",
        points: 150,
        performance_points: 142.5,
        problem_count: 2,
        rank: "user",
        rating: 1500,
      },
    ]);
  });

  test("the detail object is DMOJ's", async () => {
    const object = await fixture.t.query(api.apiV2.user, { user: "alice" });
    const parsed = apiUserDetailObject.parse(object);
    expect(parsed).toEqual({
      id: 1,
      username: "alice",
      about: "",
      points: 150,
      performance_points: 142.5,
      problem_count: 2,
      solved_problems: ["aplusb"],
      rank: "user",
      rating: 1500,
      organizations: [11],
      contests: [
        {
          key: "spring",
          score: 100,
          cumulative_time: 600,
          rating: 1500,
          raw_rating: 1490,
          performance: 1700,
        },
      ],
    });
  });

  test("an organisation filter is by id", async () => {
    expect((await fixture.t.query(api.apiV2.users, { organization: ["11"] })).objects).toHaveLength(1);
    expect((await fixture.t.query(api.apiV2.users, { organization: ["99"] })).objects).toHaveLength(0);
  });

  test("an unknown user is a not-found error", async () => {
    await expect(fixture.t.query(api.apiV2.user, { user: "nobody" })).rejects.toThrow(/not found/);
  });
});

describe("submissions", () => {
  test("the list object is DMOJ's", async () => {
    const data = await fixture.t.query(api.apiV2.submissions, {});
    const { used_basic_filters: usedBasic, ...rest } = data;
    expect(usedBasic).toBe(false);
    const parsed = expectListBlock(apiSubmissionListObject, rest);
    expect(parsed.objects).toEqual([
      {
        id: 41,
        problem: "aplusb",
        user: "alice",
        date: "2024-03-01T00:10:00.000Z",
        language: "PY3",
        time: 0.05,
        memory: 4096,
        points: 100,
        result: "AC",
        contest: {
          key: "spring",
          points: 100,
          virtual_participation_number: 0,
          time_since_start_of_participation: 600,
        },
      },
    ]);
    expect(parsed.total_objects).toBe(1);
  });

  test("the list is oldest first, as `order_by('id')` is", async () => {
    await fixture.t.run(async (ctx) => {
      const group = await ctx.db
        .query("problemGroups")
        .withIndex("by_name", (q) => q.eq("name", "Uncategorised"))
        .unique();

      const language = await ctx.db
        .query("languages")
        .withIndex("by_key", (q) => q.eq("key", "PY3"))
        .unique();

      if (!group || !language) throw new Error("fixture is missing");
      const later = await insertProblem(ctx, { code: "later", groupId: group._id, points: 10 });
      await insertSubmission(ctx, {
        profileId: fixture.ids.alice,
        problemId: later,
        languageId: language._id,
        date: Date.UTC(2024, 4, 1),
        points: 10,
        result: "AC",
        casePoints: 1,
        caseTotal: 1,
        time: 0.1,
        memory: 1024,
        legacyId: 42,
      });
      await insertSubmission(ctx, {
        profileId: fixture.ids.alice,
        problemId: later,
        languageId: language._id,
        date: Date.UTC(2024, 5, 1),
        points: 10,
        result: "AC",
        casePoints: 1,
        caseTotal: 1,
        time: 0.1,
        memory: 1024,
        legacyId: 43,
      });
    });

    const unfiltered = await fixture.t.query(api.apiV2.submissions, {});
    expect(unfiltered.objects.map((row) => row.id)).toEqual([41, 42, 43]);

    const filtered = await fixture.t.query(api.apiV2.submissions, { user: "alice" });
    expect(filtered.objects.map((row) => row.id)).toEqual([41, 42, 43]);

    const byProblem = await fixture.t.query(api.apiV2.submissions, { problem: "later" });
    expect(byProblem.objects.map((row) => row.id)).toEqual([42, 43]);
  });

  test("a basic filter switches to infinite pagination", async () => {
    const data = await fixture.t.query(api.apiV2.submissions, { user: "alice" });
    expect(data.used_basic_filters).toBe(true);
    expect(data.total_objects).toBeUndefined();
    expect(data.total_pages).toBeUndefined();
    expect(data.objects).toHaveLength(1);
  });

  test("an unknown key in a basic filter matches nothing", async () => {
    const data = await fixture.t.query(api.apiV2.submissions, { user: "nobody" });
    expect(data.objects).toHaveLength(0);
  });

  test("list filters narrow the list", async () => {
    expect((await fixture.t.query(api.apiV2.submissions, { language: ["PY3"] })).objects).toHaveLength(1);
    expect((await fixture.t.query(api.apiV2.submissions, { language: ["CPP20"] })).objects).toHaveLength(0);
    expect((await fixture.t.query(api.apiV2.submissions, { result: ["WA"] })).objects).toHaveLength(0);
    expect((await fixture.t.query(api.apiV2.submissions, { id: ["41"] })).objects).toHaveLength(1);
  });

  test("the detail object groups batches and needs a login", async () => {
    await expect(fixture.t.query(api.apiV2.submission, { id: "41" })).rejects.toThrow(/login required/);

    const object = await asUser(fixture.t, "alice").query(api.apiV2.submission, { id: "41" });
    const parsed = apiSubmissionDetailObject.parse(object);
    expect(parsed).toMatchObject({
      id: 41,
      problem: "aplusb",
      user: "alice",
      language: "PY3",
      status: "D",
      result: "AC",
      case_points: 1,
      case_total: 1,
    });
    expect(parsed.cases).toEqual([
      { type: "case", case_id: 1, status: "AC", time: 0.02, memory: 2048, points: 1, total: 1 },
      {
        type: "batch",
        batch_id: 1,
        points: 1,
        total: 4,
        cases: [
          { type: "case", case_id: 2, status: "AC", time: 0.03, memory: 4096, points: 2, total: 3 },
          { type: "case", case_id: 3, status: "WA", time: 0.01, memory: 4096, points: 1, total: 4 },
        ],
      },
    ]);
  });

  test("someone else's submission is denied", async () => {
    await fixture.t.run(async (ctx) => {
      await insertProfile(ctx, { username: "nosy" });
    });
    await expect(asUser(fixture.t, "nosy").query(api.apiV2.submission, { id: "41" })).rejects.toThrow(
      /permission/,
    );
  });
});

describe("organizations, languages and judges", () => {
  test("the organisation object is DMOJ's", async () => {
    const data = await fixture.t.query(api.apiV2.organizations, {});
    const parsed = expectListBlock(apiOrganizationObject, data);
    expect(parsed.objects).toEqual([
      { id: 11, slug: "maps", short_name: "MAPS", is_open: true, member_count: 1 },
    ]);
    expect((await fixture.t.query(api.apiV2.organizations, { is_open: false })).objects).toHaveLength(0);
  });

  test("the language object is DMOJ's", async () => {
    const data = await fixture.t.query(api.apiV2.languages, {});
    const parsed = expectListBlock(apiLanguageObject, data);
    expect(parsed.objects).toEqual([
      {
        id: 21,
        key: "PY3",
        short_name: "py3",
        common_name: "Python",
        ace_mode_name: "python",
        pygments_name: "python",
        code_template: "",
      },
    ]);
    expect((await fixture.t.query(api.apiV2.languages, { common_name: "Python" })).objects).toHaveLength(1);
    expect((await fixture.t.query(api.apiV2.languages, { key: ["CPP20"] })).objects).toHaveLength(0);
  });

  test("the judge object is DMOJ's and only online judges appear", async () => {
    const data = await fixture.t.query(api.apiV2.judges, {});
    const parsed = expectListBlock(apiJudgeObject, data);
    expect(parsed.objects).toEqual([
      {
        name: "judge-1",
        start_time: "2024-03-01T00:00:00.000Z",
        ping: 12.5,
        load: 0.25,
        languages: ["PY3"],
      },
    ]);

    await fixture.t.run(async (ctx) => {
      await ctx.db.insert("judges", {
        name: "judge-2",
        authKeyHash: "y",
        isBlocked: false,
        isDisabled: false,
        tier: 0,
        online: false,
        description: "",
        runtimeKeys: [],
      });
    });
    expect((await fixture.t.query(api.apiV2.judges, {})).objects).toHaveLength(1);
  });
});
