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
import { beforeEach, describe, expect, test } from "vitest";
import type { z } from "zod";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { setupConvexTest } from "./convexTest.setup";
import {
  makeContest,
  makeGroup,
  makeLanguage,
  makeOrganization,
  makeProblem,
  makeProfile,
  makeSubmission,
} from "./fixtures.setup";

type Fixture = {
  t: ReturnType<typeof setupConvexTest>;
  ids: {
    alice: Id<"profiles">;
    problem: Id<"problems">;
    contest: Id<"contests">;
    submission: Id<"submissions">;
  };
};

/** One small world that every endpoint reads: DMOJ's shapes need real joins. */
async function seed(): Promise<Fixture> {
  const t = setupConvexTest();
  const ids = await t.run(async (ctx) => {
    const alice = await makeProfile(ctx, "alice", {
      legacyUserId: 1,
      legacyId: 1,
      points: 150,
      performancePoints: 142.5,
      problemCount: 2,
      rating: 1500,
    });
    await makeProfile(ctx, "hidden", { isUnlisted: true, legacyId: 2 });
    await makeProfile(ctx, "gone", { isActive: false, legacyId: 3 });

    const organization = await makeOrganization(ctx, "maps", {
      name: "MAPS",
      shortName: "MAPS",
      legacyId: 11,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: organization,
      profileId: alice,
      order: 0,
    });
    await ctx.db.patch(organization, { memberCount: 1 });

    const type = await ctx.db.insert("problemTypes", { name: "dp", fullName: "Dynamic Programming" });
    const group = await makeGroup(ctx, "Uncategorised");
    const language = await makeLanguage(ctx, "PY3", { legacyId: 21 });

    const problem = await makeProblem(ctx, "aplusb", group, {
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
    const contest = await makeContest(ctx, "spring", {
      name: "Spring Contest",
      startTime: Date.UTC(2024, 2, 1),
      endTime: Date.UTC(2024, 2, 2),
      isRated: true,
      tagIds: [tag],
      legacyId: 31,
    });
    const contestProblem = await ctx.db.insert("contestProblems", {
      contestId: contest,
      problemId: problem,
      points: 100,
      partial: false,
      isPretested: false,
      order: 0,
      maxSubmissions: 5,
    });
    const participation = await ctx.db.insert("contestParticipations", {
      contestId: contest,
      profileId: alice,
      realStart: Date.UTC(2024, 2, 1),
      score: 100,
      cumtime: 600,
      isDisqualified: false,
      tiebreaker: 0,
      virtual: 0,
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

    const submission = await makeSubmission(ctx, alice, problem, language, {
      date: Date.UTC(2024, 2, 1, 0, 10),
      points: 100,
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
      problemCodes: ["aplusb"],
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
function expectListShape<T extends z.ZodTypeAny>(object: T, data: unknown) {
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
    const parsed = expectListShape(apiContestListObject, data);
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

  test("an unknown contest is a not-found error", async () => {
    await expect(fixture.t.query(api.apiV2.contest, { key: "nope" })).rejects.toThrow(/not found/);
  });

  test("an invisible contest is not found for anonymous callers", async () => {
    await fixture.t.run(async (ctx) => {
      await makeContest(ctx, "secret", { isVisible: false });
    });
    await expect(fixture.t.query(api.apiV2.contest, { key: "secret" })).rejects.toThrow(/not found/);
    expect((await fixture.t.query(api.apiV2.contests, {})).objects).toHaveLength(1);
  });
});

describe("participations", () => {
  test("the object is DMOJ's", async () => {
    const data = await fixture.t.query(api.apiV2.participations, {});
    const parsed = expectListShape(apiParticipationObject, data);
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
    const parsed = expectListShape(apiProblemListObject, data);
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
      const group = await makeGroup(ctx, "Hidden");
      await makeProblem(ctx, "secret", group, { isPublic: false });
    });
    expect((await fixture.t.query(api.apiV2.problems, {})).objects).toHaveLength(1);
    await expect(fixture.t.query(api.apiV2.problem, { code: "secret" })).rejects.toThrow(/not found/);
  });
});

describe("users", () => {
  test("the list object is DMOJ's and skips unlisted and inactive users", async () => {
    const data = await fixture.t.query(api.apiV2.users, {});
    const parsed = expectListShape(apiUserListObject, data);
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
    const parsed = expectListShape(apiSubmissionListObject, rest);
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

    const object = await fixture.t
      .withIdentity({ subject: "user_alice" })
      .query(api.apiV2.submission, { id: "41" });
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
      await makeProfile(ctx, "nosy");
    });
    await expect(
      fixture.t.withIdentity({ subject: "user_nosy" }).query(api.apiV2.submission, { id: "41" }),
    ).rejects.toThrow(/permission/);
  });
});

describe("organizations, languages and judges", () => {
  test("the organisation object is DMOJ's", async () => {
    const data = await fixture.t.query(api.apiV2.organizations, {});
    const parsed = expectListShape(apiOrganizationObject, data);
    expect(parsed.objects).toEqual([
      { id: 11, slug: "maps", short_name: "MAPS", is_open: true, member_count: 1 },
    ]);
    expect((await fixture.t.query(api.apiV2.organizations, { is_open: false })).objects).toHaveLength(0);
  });

  test("the language object is DMOJ's", async () => {
    const data = await fixture.t.query(api.apiV2.languages, {});
    const parsed = expectListShape(apiLanguageObject, data);
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
    const parsed = expectListShape(apiJudgeObject, data);
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
        problemCodes: [],
        runtimeKeys: [],
      });
    });
    expect((await fixture.t.query(api.apiV2.judges, {})).objects).toHaveLength(1);
  });
});
