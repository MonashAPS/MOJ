/**
 * Shared `convex-test` harness for the Convex function tests.
 *
 * The filename carries two dots on purpose: `convex/`'s bundler skips any entry
 * point whose basename contains more than one dot, so this helper never reaches
 * a deployment even though it sits inside the functions directory.
 */

/// <reference types="vite/client" />

import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.{ts,js}", "!../tests/**"]);

/** A test deployment with every component in convex/convex.config.ts registered. */
export function setupConvexTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "profilesByPP");
  aggregateTest.register(t, "profilesByRating");
  aggregateTest.register(t, "profilesByProblemCount");
  aggregateTest.register(t, "submissionsByProblemResult");
  rateLimiterTest.register(t, "rateLimiter");
  return t;
}

export type TestConvex = ReturnType<typeof setupConvexTest>;
