/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_blog from "../admin/blog.js";
import type * as admin_contests from "../admin/contests.js";
import type * as admin_dedupe from "../admin/dedupe.js";
import type * as admin_judges from "../admin/judges.js";
import type * as admin_languages from "../admin/languages.js";
import type * as admin_licenses from "../admin/licenses.js";
import type * as admin_organizations from "../admin/organizations.js";
import type * as admin_problems from "../admin/problems.js";
import type * as admin_scoreboards from "../admin/scoreboards.js";
import type * as admin_site from "../admin/site.js";
import type * as admin_submissions from "../admin/submissions.js";
import type * as admin_tags from "../admin/tags.js";
import type * as admin_taxonomy from "../admin/taxonomy.js";
import type * as admin_tickets from "../admin/tickets.js";
import type * as admin_users from "../admin/users.js";
import type * as apiV2 from "../apiV2.js";
import type * as blog from "../blog.js";
import type * as classes from "../classes.js";
import type * as comments from "../comments.js";
import type * as contests from "../contests.js";
import type * as contests_clarifications from "../contests/clarifications.js";
import type * as contests_formats from "../contests/formats.js";
import type * as contests_participation from "../contests/participation.js";
import type * as contests_rankings from "../contests/rankings.js";
import type * as contests_tools from "../contests/tools.js";
import type * as crons from "../crons.js";
import type * as feeds from "../feeds.js";
import type * as http from "../http.js";
import type * as http_judge from "../http/judge.js";
import type * as http_problemsApi from "../http/problemsApi.js";
import type * as importer from "../importer.js";
import type * as jobs from "../jobs.js";
import type * as jobs_contests from "../jobs/contests.js";
import type * as jobs_proctor from "../jobs/proctor.js";
import type * as jobs_users from "../jobs/users.js";
import type * as judgeApi from "../judgeApi.js";
import type * as judges from "../judges.js";
import type * as judging from "../judging.js";
import type * as languages from "../languages.js";
import type * as lib_aggregates from "../lib/aggregates.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bytes from "../lib/bytes.js";
import type * as lib_community from "../lib/community.js";
import type * as lib_dedupe from "../lib/dedupe.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_hash from "../lib/hash.js";
import type * as lib_json from "../lib/json.js";
import type * as lib_proctor from "../lib/proctor.js";
import type * as lib_rateLimiter from "../lib/rateLimiter.js";
import type * as lib_seedData from "../lib/seedData.js";
import type * as lib_testData from "../lib/testData.js";
import type * as organizations from "../organizations.js";
import type * as pages_admin_apiKeys from "../pages/admin/apiKeys.js";
import type * as pages_admin_branding from "../pages/admin/branding.js";
import type * as pages_admin_console from "../pages/admin/console.js";
import type * as pages_admin_contests from "../pages/admin/contests.js";
import type * as pages_admin_jobs from "../pages/admin/jobs.js";
import type * as pages_admin_problems from "../pages/admin/problems.js";
import type * as pages_admin_revisions from "../pages/admin/revisions.js";
import type * as pages_admin_scoreboards from "../pages/admin/scoreboards.js";
import type * as pages_admin_submissions from "../pages/admin/submissions.js";
import type * as pages_admin_users from "../pages/admin/users.js";
import type * as pages_contests from "../pages/contests.js";
import type * as pages_problems from "../pages/problems.js";
import type * as pages_scoreboard from "../pages/scoreboard.js";
import type * as pages_submissions from "../pages/submissions.js";
import type * as pages_users from "../pages/users.js";
import type * as problems from "../problems.js";
import type * as problems_data from "../problems/data.js";
import type * as problems_pdf from "../problems/pdf.js";
import type * as problems_testData from "../problems/testData.js";
import type * as problems_votes from "../problems/votes.js";
import type * as proctor from "../proctor.js";
import type * as profiles from "../profiles.js";
import type * as profiles_apiTokens from "../profiles/apiTokens.js";
import type * as profiles_dataExport from "../profiles/dataExport.js";
import type * as profiles_dedupe from "../profiles/dedupe.js";
import type * as rankings from "../rankings.js";
import type * as ratings from "../ratings.js";
import type * as scoreboard from "../scoreboard.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as site from "../site.js";
import type * as stats from "../stats.js";
import type * as status from "../status.js";
import type * as submissions from "../submissions.js";
import type * as tickets from "../tickets.js";
import type * as viewer from "../viewer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/blog": typeof admin_blog;
  "admin/contests": typeof admin_contests;
  "admin/dedupe": typeof admin_dedupe;
  "admin/judges": typeof admin_judges;
  "admin/languages": typeof admin_languages;
  "admin/licenses": typeof admin_licenses;
  "admin/organizations": typeof admin_organizations;
  "admin/problems": typeof admin_problems;
  "admin/scoreboards": typeof admin_scoreboards;
  "admin/site": typeof admin_site;
  "admin/submissions": typeof admin_submissions;
  "admin/tags": typeof admin_tags;
  "admin/taxonomy": typeof admin_taxonomy;
  "admin/tickets": typeof admin_tickets;
  "admin/users": typeof admin_users;
  apiV2: typeof apiV2;
  blog: typeof blog;
  classes: typeof classes;
  comments: typeof comments;
  contests: typeof contests;
  "contests/clarifications": typeof contests_clarifications;
  "contests/formats": typeof contests_formats;
  "contests/participation": typeof contests_participation;
  "contests/rankings": typeof contests_rankings;
  "contests/tools": typeof contests_tools;
  crons: typeof crons;
  feeds: typeof feeds;
  http: typeof http;
  "http/judge": typeof http_judge;
  "http/problemsApi": typeof http_problemsApi;
  importer: typeof importer;
  jobs: typeof jobs;
  "jobs/contests": typeof jobs_contests;
  "jobs/proctor": typeof jobs_proctor;
  "jobs/users": typeof jobs_users;
  judgeApi: typeof judgeApi;
  judges: typeof judges;
  judging: typeof judging;
  languages: typeof languages;
  "lib/aggregates": typeof lib_aggregates;
  "lib/auth": typeof lib_auth;
  "lib/bytes": typeof lib_bytes;
  "lib/community": typeof lib_community;
  "lib/dedupe": typeof lib_dedupe;
  "lib/errors": typeof lib_errors;
  "lib/hash": typeof lib_hash;
  "lib/json": typeof lib_json;
  "lib/proctor": typeof lib_proctor;
  "lib/rateLimiter": typeof lib_rateLimiter;
  "lib/seedData": typeof lib_seedData;
  "lib/testData": typeof lib_testData;
  organizations: typeof organizations;
  "pages/admin/apiKeys": typeof pages_admin_apiKeys;
  "pages/admin/branding": typeof pages_admin_branding;
  "pages/admin/console": typeof pages_admin_console;
  "pages/admin/contests": typeof pages_admin_contests;
  "pages/admin/jobs": typeof pages_admin_jobs;
  "pages/admin/problems": typeof pages_admin_problems;
  "pages/admin/revisions": typeof pages_admin_revisions;
  "pages/admin/scoreboards": typeof pages_admin_scoreboards;
  "pages/admin/submissions": typeof pages_admin_submissions;
  "pages/admin/users": typeof pages_admin_users;
  "pages/contests": typeof pages_contests;
  "pages/problems": typeof pages_problems;
  "pages/scoreboard": typeof pages_scoreboard;
  "pages/submissions": typeof pages_submissions;
  "pages/users": typeof pages_users;
  problems: typeof problems;
  "problems/data": typeof problems_data;
  "problems/pdf": typeof problems_pdf;
  "problems/testData": typeof problems_testData;
  "problems/votes": typeof problems_votes;
  proctor: typeof proctor;
  profiles: typeof profiles;
  "profiles/apiTokens": typeof profiles_apiTokens;
  "profiles/dataExport": typeof profiles_dataExport;
  "profiles/dedupe": typeof profiles_dedupe;
  rankings: typeof rankings;
  ratings: typeof ratings;
  scoreboard: typeof scoreboard;
  search: typeof search;
  seed: typeof seed;
  site: typeof site;
  stats: typeof stats;
  status: typeof status;
  submissions: typeof submissions;
  tickets: typeof tickets;
  viewer: typeof viewer;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  profilesByPP: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"profilesByPP">;
  profilesByRating: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"profilesByRating">;
  profilesByProblemCount: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"profilesByProblemCount">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
