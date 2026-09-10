import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { SEED_LANGUAGES, SEED_NAVIGATION } from "./lib/seedData";

const MISC_CONFIG_DEFAULTS: Record<string, string> = {
  announcement: "",
  footer: 'run by <a href="https://monashaps.com/">Monash Algorithms and Problem Solving</a>',
  meta_keywords: "competitive programming, online judge, MAPS, Monash, algorithms",
  home_page_top: "",
  analytics: "",
};

const ABOUT_PAGE = `# About MOJ

MOJ is the MAPS Online Judge, run by Monash Algorithms and Problem Solving. It hosts the
problems and contests we write for our members, and grades your submissions against the
same test data the setters used.

## Getting started

Pick something from the [problem list](/problems/), read the statement, and submit a
solution in any of the supported languages. Every submission is graded case by case and you
can watch the verdict come in live.

## Contact

Open a ticket on a problem if something looks wrong with it, or find us in the club Discord.
`;

const ANNOUNCEMENTS: Array<{
  slug: string;
  title: string;
  summary: string;
  content: string;
  sticky: boolean;
  daysAgo: number;
}> = [
  {
    slug: "welcome-to-moj",
    title: "Welcome to the MAPS Online Judge",
    summary:
      "MOJ is where the club's problems and contests live. Here is how to get started and where to ask for help.",
    content: `MOJ is the judge Monash Algorithms and Problem Solving runs for its members. Everything the
club writes ends up here: weekly practice sets, the contests we run in person, and the archive of
everything that came before.

## Getting started

1. Pick something from the [problem list](/problems/).
2. Write a solution in any of the supported languages and submit it.
3. Watch the verdict come in case by case, live.

## Where to ask

Open a ticket on a problem if the statement or the test data looks wrong, and find us in the club
Discord for everything else.`,
    sticky: true,
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

export const run = internalMutation({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }) => {
    const report: Record<string, number> = {};

    // Languages ------------------------------------------------------------
    let languagesWritten = 0;
    for (const language of SEED_LANGUAGES) {
      const existing = await ctx.db
        .query("languages")
        .withIndex("by_key", (q) => q.eq("key", language.key))
        .unique();
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
        .unique();
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
    for (const [key, value] of Object.entries(MISC_CONFIG_DEFAULTS)) {
      const existing = await ctx.db
        .query("miscConfig")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
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
        siteName: "MOJ",
        siteLongName: "MAPS Online Judge",
        siteAdminEmail: "admin@example.com",
        registrationOpen: true,
        defaultUserTimezone: "Australia/Melbourne",
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
      report.siteSettings = 0;
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
      .unique();
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
        publishOn: Date.now() - announcement.daysAgo * 24 * 60 * 60 * 1000,
        content: announcement.content,
        summary: announcement.summary,
      });
      announcementsWritten++;
    }
    report.blogPosts = announcementsWritten;

    // Sample problem -------------------------------------------------------
    const existingProblem = await ctx.db
      .query("problems")
      .withIndex("by_code", (q) => q.eq("code", "aplusb"))
      .unique();
    if (existingProblem) {
      report.problems = 0;
    } else {
      const allLanguages = await ctx.db.query("languages").collect();
      const problemId = await ctx.db.insert("problems", {
        code: "aplusb",
        name: "A Plus B",
        description: APLUSB_STATEMENT,
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
        summary: "Add two integers. The traditional first problem.",
      });

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
      report.problems = 1;
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
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("problemGroups", { name, fullName });
}

async function ensureType(ctx: any, name: string, fullName: string): Promise<Id<"problemTypes">> {
  const existing = await ctx.db
    .query("problemTypes")
    .withIndex("by_name", (q: any) => q.eq("name", name))
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("problemTypes", { name, fullName });
}
