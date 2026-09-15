/// <reference types="vite/client" />
/**
 * The `convex-test` harness for the Convex function tests, and the judge wire
 * protocol the HTTP tests speak.
 *
 * The filename carries two dots on purpose: Convex's bundler skips any file
 * under `convex/` whose basename has more than one, so nothing in here is ever
 * pushed to a deployment.
 */

import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest, type TestConvex } from "convex-test";
import schema from "./schema";

/** The function modules, plus the `_generated` path convex-test takes its module root from. */
const modules = import.meta.glob([
  "./**/*.ts",
  "!./**/*.test.ts",
  "!./test.*.ts",
  "!./node_modules/**",
  "!./vitest.config.ts",
]);

export type T = TestConvex<typeof schema>;

/** Every component in convex/convex.config.ts, or a mutation that touches one
 *  fails with "component not registered". */
export function setupTest(): T {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "profilesByPP");
  aggregateTest.register(t, "profilesByRating");
  aggregateTest.register(t, "profilesByProblemCount");
  rateLimiterTest.register(t, "rateLimiter");

  return t;
}

/** The key `insertJudge` hashes into `judges.authKeyHash` for a judge of this name. */
export function judgeKey(name: string): string {
  return `${name}-key`;
}

/* -------------------------------------------------------------------------- */
/* The judge API over HTTP                                                    */
/* -------------------------------------------------------------------------- */

/** Speaks the wire format in apps/judge/README.md, exactly as `moj_packet.py` does. */
export class JudgeClient {
  constructor(
    private readonly t: T,
    readonly judgeName: string,
    readonly judgeKey: string,
  ) {}

  private post(path: string, body: Record<string, unknown>): Promise<Response> {
    return this.t.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ judgeName: this.judgeName, judgeKey: this.judgeKey, ...body }),
    });
  }

  handshake(
    problems: Array<[string, number]> = [["aplusb", 1789036959.9853778]],
    executors: Record<string, Array<[string, number[]]>> = { PY3: [["python3", [3, 9, 10]]] },
  ) {
    return this.post("/judge/handshake", { problems, executors });
  }

  heartbeat(body: Record<string, unknown> = { load: 0.42 }) {
    return this.post("/judge/heartbeat", body);
  }

  claim() {
    return this.post("/judge/claim", {});
  }

  event(submissionId: number | string, event: Record<string, unknown>) {
    return this.post("/judge/event", { submissionId, event });
  }

  abortFlag(submissionId: number | string) {
    const query = new URLSearchParams({
      judgeName: this.judgeName,
      judgeKey: this.judgeKey,
      submissionId: String(submissionId),
    });

    return this.t.fetch(`/judge/abort?${query.toString()}`, { method: "GET" });
  }

  disconnect() {
    return this.post("/judge/disconnect", {});
  }
}

export function judgeClient(t: T, name: string, key: string = judgeKey(name)): JudgeClient {
  return new JudgeClient(t, name, key);
}

/** One graded case, with the extra fields the judge sends over SPEC section 6. */
export function judgeCase(
  position: number,
  status: number,
  points: number,
  totalPoints: number,
  extra: Record<string, unknown> = {},
) {
  return {
    position,
    status,
    time: 0.016,
    memory: 9644,
    points,
    totalPoints,
    output: "3\n",
    feedback: "",
    extendedFeedback: "",
    voluntaryContextSwitches: 359,
    involuntaryContextSwitches: 3,
    runtimeVersion: "python3 3.9.10",
    ...extra,
  };
}
