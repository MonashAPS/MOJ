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
import type * as admin_judges from "../admin/judges.js";
import type * as admin_languages from "../admin/languages.js";
import type * as admin_licenses from "../admin/licenses.js";
import type * as admin_site from "../admin/site.js";
import type * as admin_tags from "../admin/tags.js";
import type * as admin_tickets from "../admin/tickets.js";
import type * as blog from "../blog.js";
import type * as comments from "../comments.js";
import type * as contests from "../contests.js";
import type * as crons from "../crons.js";
import type * as feeds from "../feeds.js";
import type * as http from "../http.js";
import type * as judges from "../judges.js";
import type * as languages from "../languages.js";
import type * as lib_aggregates from "../lib/aggregates.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_community from "../lib/community.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_rateLimiter from "../lib/rateLimiter.js";
import type * as lib_seedData from "../lib/seedData.js";
import type * as lib_testing from "../lib/testing.js";
import type * as maintenance from "../maintenance.js";
import type * as problems from "../problems.js";
import type * as profiles from "../profiles.js";
import type * as rankings from "../rankings.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as site from "../site.js";
import type * as stats from "../stats.js";
import type * as status from "../status.js";
import type * as tickets from "../tickets.js";
import type * as viewer from "../viewer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/blog": typeof admin_blog;
  "admin/judges": typeof admin_judges;
  "admin/languages": typeof admin_languages;
  "admin/licenses": typeof admin_licenses;
  "admin/site": typeof admin_site;
  "admin/tags": typeof admin_tags;
  "admin/tickets": typeof admin_tickets;
  blog: typeof blog;
  comments: typeof comments;
  contests: typeof contests;
  crons: typeof crons;
  feeds: typeof feeds;
  http: typeof http;
  judges: typeof judges;
  languages: typeof languages;
  "lib/aggregates": typeof lib_aggregates;
  "lib/auth": typeof lib_auth;
  "lib/community": typeof lib_community;
  "lib/errors": typeof lib_errors;
  "lib/rateLimiter": typeof lib_rateLimiter;
  "lib/seedData": typeof lib_seedData;
  "lib/testing": typeof lib_testing;
  maintenance: typeof maintenance;
  problems: typeof problems;
  profiles: typeof profiles;
  rankings: typeof rankings;
  search: typeof search;
  seed: typeof seed;
  site: typeof site;
  stats: typeof stats;
  status: typeof status;
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
  submissionsByProblemResult: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"submissionsByProblemResult">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
