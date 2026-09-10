/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_problems from "../admin/problems.js";
import type * as blog from "../blog.js";
import type * as comments from "../comments.js";
import type * as contests from "../contests.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as http_problemsApi from "../http/problemsApi.js";
import type * as languages from "../languages.js";
import type * as lib_aggregates from "../lib/aggregates.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_rateLimiter from "../lib/rateLimiter.js";
import type * as lib_seedData from "../lib/seedData.js";
import type * as maintenance from "../maintenance.js";
import type * as problemData from "../problemData.js";
import type * as problems from "../problems.js";
import type * as profiles from "../profiles.js";
import type * as rankings from "../rankings.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as site from "../site.js";
import type * as viewer from "../viewer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/problems": typeof admin_problems;
  blog: typeof blog;
  comments: typeof comments;
  contests: typeof contests;
  crons: typeof crons;
  http: typeof http;
  "http/problemsApi": typeof http_problemsApi;
  languages: typeof languages;
  "lib/aggregates": typeof lib_aggregates;
  "lib/auth": typeof lib_auth;
  "lib/errors": typeof lib_errors;
  "lib/rateLimiter": typeof lib_rateLimiter;
  "lib/seedData": typeof lib_seedData;
  maintenance: typeof maintenance;
  problemData: typeof problemData;
  problems: typeof problems;
  profiles: typeof profiles;
  rankings: typeof rankings;
  search: typeof search;
  seed: typeof seed;
  site: typeof site;
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
