import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { recompute } from "./contests/rankings";
import { SEED_LANGUAGES, SEED_NAVIGATION } from "./lib/seedData";

const MISC_CONFIG_DEFAULTS = new Map<string, string>([
  ["announcement", ""],
  ["footer", ""],
  ["meta_keywords", "competitive programming, online judge, algorithms, contests"],
  ["home_page_top", ""],
  ["analytics", ""],
]);

const ABOUT_PAGE = `# About this judge

This is an online judge running MOJ. It hosts problems and contests, and grades
submissions against the same test data the setters used.

## Getting started

Pick something from the [problem list](/problems/), read the statement, and submit a
solution in any of the supported languages. Every submission is graded case by case and you
can watch the verdict come in live.

## Contact

Open a ticket on a problem if something looks wrong with it.

_Replace this page from the staff console under Config, Flat pages._
`;

const ANNOUNCEMENTS: Array<{
  slug: string;
  title: string;
  summary: string;
  content: string;
  sticky: boolean;
  expanded: boolean;
  daysAgo: number;
}> = [
  {
    slug: "welcome",
    title: "Welcome",
    summary: "This judge's problems and contests live here. How to get started, and where to ask for help.",
    content: `Everything set on this judge ends up here: practice sets, the contests run on it, and the
archive of everything that came before.

## Getting started

1. Pick something from the [problem list](/problems/).
2. Write a solution in any of the supported languages and submit it.
3. Watch the verdict come in case by case, live.

## Where to ask

Open a ticket on a problem if the statement or the test data looks wrong.

_Replace this post from the staff console under Blog._`,
    sticky: true,
    expanded: true,
    daysAgo: 7,
  },
  {
    slug: "contest-season-is-open",
    title: "Contest season is open",
    summary: "Weekly contests start this month. Ratings, virtual participation and editorials all included.",
    content: `Weekly contests run through the semester. Each one is rated, so your rating moves with every
contest you take part in, and each has an editorial published once the contest ends.

Missed one? Join it virtually from the [contest list](/contests/) and the clock starts when you do.`,
    sticky: false,
    expanded: false,
    daysAgo: 2,
  },
];

const APLUSB_STATEMENT = `Given two integers ~A~ and ~B~, compute their sum.

## Input Specification

The first and only line of input contains two space-separated integers ~A~ and ~B~
(~-10^9 \\le A, B \\le 10^9~).

## Output Specification

Output a single integer, the value of ~A + B~.

## Sample Input 1

    1 2

## Sample Output 1

    3

## Sample Input 2

    -5 5

## Sample Output 2

    0
`;

const ATIMESB_STATEMENT = `Given two integers ~A~ and ~B~, compute their product.

## Input Specification

One line containing two space-separated integers ~A~ and ~B~
(~-10000 \\le A, B \\le 10000~).

## Output Specification

Output a single integer, the value of ~A \\times B~.

## Sample Input 1

    3 4

## Sample Output 1

    12

## Sample Input 2

    -5 0

## Sample Output 2

    0
`;

const DEV_PROBLEMS = [
  { code: "atimesb", name: "A Times B", description: ATIMESB_STATEMENT, summary: "Multiply two integers." },
  ...[
    { code: "aminusb", name: "A Minus B", task: "compute A minus B", output: "A - B", sample: "-1" },
    {
      code: "maxab",
      name: "Maximum of A and B",
      task: "find the larger value",
      output: "the maximum of A and B",
      sample: "4",
    },
    {
      code: "minab",
      name: "Minimum of A and B",
      task: "find the smaller value",
      output: "the minimum of A and B",
      sample: "3",
    },
    {
      code: "absdiff",
      name: "Absolute Difference",
      task: "find their absolute difference",
      output: "the absolute value of A - B",
      sample: "1",
    },
  ].map(({ code, name, task, output, sample }) => ({
    code,
    name,
    summary: `Given two integers, ${task}.`,
    description: `Given two integers ~A~ and ~B~, ${task}.

## Input Specification

One line containing two space-separated integers ~A~ and ~B~
(~-10^9 \\le A, B \\le 10^9~).

## Output Specification

Output a single integer, ${output}.

## Sample Input 1

    3 4

## Sample Output 1

    ${sample}
`,
  })),
];

export const run = internalMutation({
  args: {
    force: v.optional(v.boolean()),
    devContests: v.optional(v.boolean()),
    /** `npm run setup` passes MOJ_SITE_NAME / MOJ_SITE_LONG_NAME through so a
     *  fresh instance is named for its club rather than for MOJ. */
    siteName: v.optional(v.string()),
    siteLongName: v.optional(v.string()),
  },
  handler: async (ctx, { force, devContests, siteName, siteLongName }) => {
    const report: Record<string, number> = {};

    // Languages ------------------------------------------------------------
    let languagesWritten = 0;

    for (const language of SEED_LANGUAGES) {
      const existing = await ctx.db
        .query("languages")
        .withIndex("by_key", (q) => q.eq("key", language.key))
        .first();

      if (existing) {
        if (force) {
          await ctx.db.patch(existing._id, language);
          languagesWritten++;
        }

        continue;
      }

      await ctx.db.insert("languages", language);
      languagesWritten++;
    }

    report.languages = languagesWritten;

    // Navigation bar -------------------------------------------------------
    const navIdByLegacyId = new Map<number, Id<"navigationBar">>();
    let navWritten = 0;

    for (const item of SEED_NAVIGATION) {
      const existing = await ctx.db
        .query("navigationBar")
        .withIndex("by_key", (q) => q.eq("key", item.key))
        .first();

      const parentId = item.parentLegacyId === null ? undefined : navIdByLegacyId.get(item.parentLegacyId);

      const row = {
        order: item.order,
        key: item.key,
        label: item.label,
        path: item.path,
        regex: item.regex,
        parentId,
        legacyId: item.legacyId,
      };

      if (existing) {
        navIdByLegacyId.set(item.legacyId, existing._id);

        if (force) {
          await ctx.db.patch(existing._id, row);
          navWritten++;
        }

        continue;
      }

      const id = await ctx.db.insert("navigationBar", row);
      navIdByLegacyId.set(item.legacyId, id);
      navWritten++;
    }

    report.navigationBar = navWritten;

    // Misc config ----------------------------------------------------------
    let miscWritten = 0;

    for (const [key, value] of MISC_CONFIG_DEFAULTS) {
      const existing = await ctx.db
        .query("miscConfig")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();

      if (existing) continue;
      await ctx.db.insert("miscConfig", { key, value });
      miscWritten++;
    }

    report.miscConfig = miscWritten;

    // Site settings --------------------------------------------------------
    const settings = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
      .unique();

    if (!settings) {
      await ctx.db.insert("siteSettings", {
        singleton: "site",
        siteName: siteName?.trim() || "MOJ",
        siteLongName: siteLongName?.trim() || "MAPS Online Judge",
        siteAdminEmail: "admin@example.com",
        registrationOpen: true,
        defaultUserLanguageKey: "PY3",
        problemsPerPage: 50,
        commentsPerPage: 50,
        submissionsPerPage: 50,
        userRankingsPerPage: 100,
        blogPostsPerPage: 10,
        ratingRatios: [0.0, 0.05, 0.15, 0.4, 0.7, 0.9],
        requireStaffTwoFactor: true,
        pdfEnabled: true,
      });
      report.siteSettings = 1;
    } else {
      // Renaming an existing instance is the console's job, except when setup
      // is re-run with an explicit name and `force`.
      const rename: Partial<typeof settings> = {};

      if (force && siteName?.trim()) rename.siteName = siteName.trim();

      if (force && siteLongName?.trim()) rename.siteLongName = siteLongName.trim();

      if (Object.keys(rename).length > 0) await ctx.db.patch(settings._id, rename);
      report.siteSettings = Object.keys(rename).length > 0 ? 1 : 0;
    }

    // Problem groups and types --------------------------------------------
    const uncategorizedGroupId = await ensureGroup(ctx, "uncategorized", "Uncategorized");
    await ensureGroup(ctx, "beginner", "Beginner");
    await ensureGroup(ctx, "easy", "Easy");
    await ensureGroup(ctx, "normal", "Normal");
    await ensureGroup(ctx, "hard", "Hard");
    await ensureGroup(ctx, "expert", "Expert");
    const uncategorizedTypeId = await ensureType(ctx, "uncategorized", "Uncategorized");

    for (const [name, fullName] of [
      ["ad-hoc", "Ad Hoc"],
      ["data-structures", "Data Structures"],
      ["dynamic-programming", "Dynamic Programming"],
      ["geometry", "Geometry"],
      ["graph-theory", "Graph Theory"],
      ["greedy", "Greedy Algorithms"],
      ["math", "Math"],
      ["string-algorithms", "String Algorithms"],
    ] as const) {
      await ensureType(ctx, name, fullName);
    }

    // Flat pages -----------------------------------------------------------
    const about = await ctx.db
      .query("flatPages")
      .withIndex("by_url", (q) => q.eq("url", "/about/"))
      .first();

    if (!about) {
      await ctx.db.insert("flatPages", {
        url: "/about/",
        title: "About",
        content: ABOUT_PAGE,
        enableComments: false,
      });
      report.flatPages = 1;
    } else {
      report.flatPages = 0;
    }

    // Announcements --------------------------------------------------------
    let announcementsWritten = 0;

    for (const announcement of ANNOUNCEMENTS) {
      const existing = await ctx.db
        .query("blogPosts")
        .withIndex("by_slug", (q) => q.eq("slug", announcement.slug))
        .unique();

      if (existing) continue;
      await ctx.db.insert("blogPosts", {
        title: announcement.title,
        authorProfileIds: [],
        slug: announcement.slug,
        visible: true,
        sticky: announcement.sticky,
        expanded: announcement.expanded,
        publishOn: Date.now() - announcement.daysAgo * 24 * 60 * 60 * 1000,
        content: announcement.content,
        summary: announcement.summary,
      });
      announcementsWritten++;
    }

    report.blogPosts = announcementsWritten;

    // Sample problems ------------------------------------------------------
    const samples = [
      {
        code: "aplusb",
        name: "A Plus B",
        description: APLUSB_STATEMENT,
        summary: "Add two integers. The traditional first problem.",
      },
    ];

    if (devContests) samples.push(...DEV_PROBLEMS);

    const sampleProblemIds = new Map<string, Id<"problems">>();
    report.problems = 0;

    for (const sample of samples) {
      const existingProblem = await ctx.db
        .query("problems")
        .withIndex("by_code", (q) => q.eq("code", sample.code))
        .unique();

      if (existingProblem) {
        sampleProblemIds.set(sample.code, existingProblem._id);
      } else {
        const allLanguages = await ctx.db.query("languages").collect();

        const problemId = await ctx.db.insert("problems", {
          code: sample.code,
          name: sample.name,
          description: sample.description,
          authorProfileIds: [],
          curatorProfileIds: [],
          testerProfileIds: [],
          typeIds: [uncategorizedTypeId],
          groupId: uncategorizedGroupId,
          timeLimit: 1.0,
          memoryLimit: 262144,
          shortCircuit: false,
          points: 100,
          partial: true,
          allowedLanguageIds: allLanguages.map((row) => row._id),
          isPublic: true,
          isManuallyManaged: false,
          date: Date.now(),
          bannedProfileIds: [],
          userCount: 0,
          acRate: 0,
          isFullMarkup: false,
          submissionSourceVisibility: "F",
          organizationIds: [],
          isOrganizationPrivate: false,
          summary: sample.summary,
        });

        sampleProblemIds.set(sample.code, problemId);

        await ctx.db.insert("problemData", {
          problemId,
          feedback: "",
          unicode: false,
          nobigmath: false,
        });

        const cases: Array<Omit<Doc<"problemTestCases">, "_id" | "_creationTime">> = [
          mkCase(problemId, 0, "S", "", "", 0),
          mkCase(problemId, 1, "C", "00.in", "00.out", 0),
          mkCase(problemId, 2, "C", "01.in", "01.out", 0),
          mkCase(problemId, 3, "E", "", "", 0),
          mkCase(problemId, 4, "S", "", "", 100),
          mkCase(problemId, 5, "C", "02.in", "02.out", 0),
          mkCase(problemId, 6, "C", "03.in", "03.out", 0),
          mkCase(problemId, 7, "E", "", "", 0),
        ];

        for (const row of cases) await ctx.db.insert("problemTestCases", row);
        report.problems++;
      }
    }

    // Development fixtures are opt-in; setup refreshes their dates on every run.
    if (devContests) {
      const hour = 60 * 60 * 1000;
      const now = Date.now();
      const seededProblemIds = new Set(sampleProblemIds.values());
      report.contests = 0;
      report.contestProblems = 0;

      for (const fixture of [
        {
          key: "dev-ended",
          name: "Development contest (ended)",
          startTime: now - 26 * hour,
          endTime: now - 24 * hour,
          problemCodes: ["aplusb", "atimesb"],
        },
        {
          key: "dev-running",
          name: "Development contest (running)",
          startTime: now - hour,
          endTime: now + 7 * 24 * hour,
          problemCodes: ["aminusb", "maxab"],
        },
        {
          key: "dev-upcoming",
          name: "Development contest (upcoming)",
          startTime: now + 24 * hour,
          endTime: now + 26 * hour,
          problemCodes: ["minab", "absdiff"],
        },
      ]) {
        const existing = await ctx.db
          .query("contests")
          .withIndex("by_key", (q) => q.eq("key", fixture.key))
          .unique();

        let contestId = existing?._id;

        if (contestId) {
          await ctx.db.patch(contestId, { startTime: fixture.startTime, endTime: fixture.endTime });
        } else {
          contestId = await ctx.db.insert("contests", {
            key: fixture.key,
            name: fixture.name,
            startTime: fixture.startTime,
            endTime: fixture.endTime,
            description: "A development contest for testing with its own pair of sample problems.",
            authorProfileIds: [],
            curatorProfileIds: [],
            testerProfileIds: [],
            spectatorProfileIds: [],
            testerSeeScoreboard: false,
            testerSeeSubmissions: false,
            spectatorSeeScoreboard: true,
            spectatorSeeProblemsEarly: false,
            schedule: { kind: "together" },
            isVisible: true,
            entry: { kind: "open" },
            isOpenEntry: true,
            labels: { kind: "letters" },
            alwaysAdmitProfileIds: [],
            viewContestSubmissionsProfileIds: [],
            scoreboard: { audiences: ["everyone"], from: "start" },
            useClarifications: true,
            hideProblemTags: false,
            hideProblemAuthors: false,
            runPretestsOnly: false,
            tagIds: [],
            userCount: 0,
            bannedProfileIds: [],
            formatName: "default",
            formatConfig: null,
            pointsPrecision: 3,
          });
        }

        report.contests++;

        const existingProblems = await ctx.db
          .query("contestProblems")
          .withIndex("by_contest_order", (q) => q.eq("contestId", contestId))
          .collect();

        const fixtureProblemIds = new Set(fixture.problemCodes.map((code) => sampleProblemIds.get(code)!));
        const problems: Doc<"contestProblems">[] = [];
        const affectedParticipations = new Set<Id<"contestParticipations">>();

        // Keep legacy attempts as practice submissions, including attempts whose
        // links were already removed by an earlier seed. Grading data stays intact.
        const submissions = await ctx.db
          .query("submissions")
          .withIndex("by_contest_date", (q) => q.eq("contestId", contestId))
          .collect();

        for (const submission of submissions) {
          if (!seededProblemIds.has(submission.problemId) || fixtureProblemIds.has(submission.problemId))
            continue;

          if (submission.participationId) affectedParticipations.add(submission.participationId);
          await ctx.db.patch(submission._id, {
            contestId: undefined,
            contestProblemId: undefined,
            participationId: undefined,
            contestPoints: undefined,
            isContestPretest: undefined,
            lockedAfter: undefined,
          });
        }

        // Older seeds shared the same pair across all three fixtures. Reconcile
        // seeded links while preserving any problems added locally by developers.
        for (const problem of existingProblems) {
          if (seededProblemIds.has(problem.problemId) && !fixtureProblemIds.has(problem.problemId)) {
            await ctx.db.delete(problem._id);
          } else {
            problems.push(problem);
          }
        }

        if (problems.length !== existingProblems.length) {
          for (const [index, problem] of problems.entries()) {
            problem.order = index + 1;
            await ctx.db.patch(problem._id, { order: problem.order });
          }
        }

        let order = Math.max(0, ...problems.map((problem) => problem.order));

        for (const code of fixture.problemCodes) {
          const problemId = sampleProblemIds.get(code)!;

          if (problems.some((problem) => problem.problemId === problemId)) continue;
          await ctx.db.insert("contestProblems", {
            contestId,
            problemId,
            points: 100,
            partial: true,
            isPretested: false,
            order: ++order,
          });
          report.contestProblems++;
        }

        for (const participationId of affectedParticipations) await recompute(ctx, participationId);
      }
    }

    return report;
  },
});

function mkCase(
  problemId: Id<"problems">,
  order: number,
  type: "C" | "S" | "E",
  inputFile: string,
  outputFile: string,
  points: number,
): Omit<Doc<"problemTestCases">, "_id" | "_creationTime"> {
  return {
    problemId,
    order,
    type,
    inputFile,
    outputFile,
    generatorArgs: "",
    points,
    isPretest: false,
    batchDependencies: [],
  };
}

async function ensureGroup(ctx: any, name: string, fullName: string): Promise<Id<"problemGroups">> {
  const existing = await ctx.db
    .query("problemGroups")
    .withIndex("by_name", (q: any) => q.eq("name", name))
    .first();

  if (existing) return existing._id;

  return await ctx.db.insert("problemGroups", { name, fullName });
}

async function ensureType(ctx: any, name: string, fullName: string): Promise<Id<"problemTypes">> {
  const existing = await ctx.db
    .query("problemTypes")
    .withIndex("by_name", (q: any) => q.eq("name", name))
    .first();

  if (existing) return existing._id;

  return await ctx.db.insert("problemTypes", { name, fullName });
}
