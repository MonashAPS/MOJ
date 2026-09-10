/// <reference types="vite/client" />
/**
 * Fixtures for the Convex tests.
 *
 * The filename carries two dots on purpose: Convex's bundler skips any file
 * under `convex/` whose basename has more than one, so nothing in here is ever
 * pushed to a deployment.
 */

import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest, type TestConvex } from "convex-test";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

export const modules = import.meta.glob("../**/*.*s");

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

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

export async function makeLanguage(t: T, key = "PY3"): Promise<Id<"languages">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("languages", {
      key,
      name: key,
      shortName: key,
      commonName: key,
      editorMode: "python",
      shikiLang: "python",
      template: "",
      info: "",
      description: "",
      extension: "py",
    }),
  );
}

export interface ProfileOptions {
  username?: string;
  permissions?: string[];
  isStaff?: boolean;
  isSuperuser?: boolean;
  isUnlisted?: boolean;
  legacyUserId?: number;
}

export interface TestProfile {
  profileId: Id<"profiles">;
  userId: string;
  username: string;
}

let profileCounter = 0;

export async function makeProfile(t: T, options: ProfileOptions = {}): Promise<TestProfile> {
  profileCounter += 1;
  const username = options.username ?? `user${profileCounter}`;
  const userId = `auth|${username}`;
  const profileId = await t.run(async (ctx) =>
    ctx.db.insert("profiles", {
      userId,
      username,
      about: "",
      timezone: "UTC",
      points: 0,
      performancePoints: 0,
      problemCount: 0,
      displayRank: "user",
      mute: false,
      isUnlisted: options.isUnlisted ?? false,
      isBannedFromProblemVoting: false,
      mathEngine: "auto",
      siteTheme: "auto",
      editorTheme: "auto",
      notes: "",
      isStaff: options.isStaff ?? false,
      isSuperuser: options.isSuperuser ?? false,
      permissions: options.permissions ?? [],
      groups: [],
      joinDate: Date.now(),
      ...(options.legacyUserId === undefined ? {} : { legacyUserId: options.legacyUserId }),
    }),
  );
  return { profileId, userId, username };
}

export interface ProblemOptions {
  code?: string;
  points?: number;
  partial?: boolean;
  isPublic?: boolean;
  isOrganizationPrivate?: boolean;
  shortCircuit?: boolean;
  allowedLanguageIds?: Id<"languages">[];
  authorProfileIds?: Id<"profiles">[];
  testerProfileIds?: Id<"profiles">[];
  bannedProfileIds?: Id<"profiles">[];
  submissionSourceVisibility?: "A" | "S" | "O" | "F";
  timeLimit?: number;
  memoryLimit?: number;
}

export async function makeProblem(t: T, options: ProblemOptions = {}): Promise<Id<"problems">> {
  const groupId = await t.run(async (ctx) => {
    const existing = await ctx.db.query("problemGroups").first();
    if (existing) return existing._id;
    return await ctx.db.insert("problemGroups", {
      name: "uncategorized",
      fullName: "Uncategorized",
    });
  });
  return await t.run(async (ctx) =>
    ctx.db.insert("problems", {
      code: options.code ?? "aplusb",
      name: "A Plus B",
      description: "",
      authorProfileIds: options.authorProfileIds ?? [],
      curatorProfileIds: [],
      testerProfileIds: options.testerProfileIds ?? [],
      typeIds: [],
      groupId,
      timeLimit: options.timeLimit ?? 1,
      memoryLimit: options.memoryLimit ?? 262144,
      shortCircuit: options.shortCircuit ?? false,
      points: options.points ?? 100,
      partial: options.partial ?? true,
      allowedLanguageIds: options.allowedLanguageIds ?? [],
      isPublic: options.isPublic ?? true,
      isManuallyManaged: false,
      date: Date.now(),
      bannedProfileIds: options.bannedProfileIds ?? [],
      userCount: 0,
      acRate: 0,
      isFullMarkup: false,
      submissionSourceVisibility: options.submissionSourceVisibility ?? "F",
      organizationIds: [],
      isOrganizationPrivate: options.isOrganizationPrivate ?? false,
    }),
  );
}

export interface JudgeOptions {
  name?: string;
  key?: string;
  tier?: number;
  online?: boolean;
  isDisabled?: boolean;
  isBlocked?: boolean;
  problemCodes?: string[];
  runtimeKeys?: string[];
  lastSeen?: number;
  currentSubmissionId?: Id<"submissions">;
}

export interface TestJudge {
  judgeId: Id<"judges">;
  name: string;
  key: string;
}

let judgeCounter = 0;

export async function makeJudge(t: T, options: JudgeOptions = {}): Promise<TestJudge> {
  judgeCounter += 1;
  const name = options.name ?? `judge${judgeCounter}`;
  const key = options.key ?? `${name}-key`;
  const authKeyHash = await sha256Hex(key);
  const judgeId = await t.run(async (ctx) =>
    ctx.db.insert("judges", {
      name,
      authKeyHash,
      isBlocked: options.isBlocked ?? false,
      isDisabled: options.isDisabled ?? false,
      tier: options.tier ?? 0,
      online: options.online ?? true,
      description: "",
      problemCodes: options.problemCodes ?? ["aplusb"],
      runtimeKeys: options.runtimeKeys ?? ["PY3"],
      lastSeen: options.lastSeen ?? Date.now(),
      startTime: Date.now(),
      ...(options.currentSubmissionId ? { currentSubmissionId: options.currentSubmissionId } : {}),
    }),
  );
  return { judgeId, name, key };
}

export interface SubmissionOptions {
  profileId: Id<"profiles">;
  problemId: Id<"problems">;
  languageId: Id<"languages">;
  status?: "QU" | "P" | "G" | "D" | "IE" | "CE" | "AB";
  priority?: number;
  date?: number;
  legacyId?: number;
  source?: string;
  judgePin?: Id<"judges">;
  claimedByJudgeId?: Id<"judges">;
  claimedAt?: number;
  retryCount?: number;
  currentTestcase?: number;
  participationId?: Id<"contestParticipations">;
  contestId?: Id<"contests">;
  contestProblemId?: Id<"contestProblems">;
  lockedAfter?: number;
  rejudgedDate?: number;
  result?: "AC" | "WA" | "TLE" | "MLE" | "OLE" | "IR" | "RTE" | "CE" | "IE" | "SC" | "AB";
  casePoints?: number;
  caseTotal?: number;
  points?: number;
}

let submissionCounter = 0;

export async function makeSubmission(t: T, options: SubmissionOptions): Promise<Id<"submissions">> {
  submissionCounter += 1;
  const legacyId = options.legacyId ?? submissionCounter;
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert("submissions", {
      profileId: options.profileId,
      problemId: options.problemId,
      languageId: options.languageId,
      date: options.date ?? Date.now(),
      status: options.status ?? "QU",
      currentTestcase: options.currentTestcase ?? 0,
      batch: false,
      casePoints: options.casePoints ?? 0,
      caseTotal: options.caseTotal ?? 0,
      isPretested: false,
      isArchived: false,
      priority: options.priority ?? 1,
      retryCount: options.retryCount ?? 0,
      legacyId,
      ...(options.result ? { result: options.result } : {}),
      ...(options.points === undefined ? {} : { points: options.points }),
      ...(options.judgePin ? { judgePin: options.judgePin } : {}),
      ...(options.claimedByJudgeId ? { claimedByJudgeId: options.claimedByJudgeId } : {}),
      ...(options.claimedAt === undefined ? {} : { claimedAt: options.claimedAt }),
      ...(options.participationId ? { participationId: options.participationId } : {}),
      ...(options.contestId ? { contestId: options.contestId } : {}),
      ...(options.contestProblemId ? { contestProblemId: options.contestProblemId } : {}),
      ...(options.lockedAfter === undefined ? {} : { lockedAfter: options.lockedAfter }),
      ...(options.rejudgedDate === undefined ? {} : { rejudgedDate: options.rejudgedDate }),
    });
    await ctx.db.insert("submissionSources", {
      submissionId: id,
      source: options.source ?? "print(1)",
    });
    return id;
  });
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

export function judgeClient(t: T, judge: TestJudge): JudgeClient {
  return new JudgeClient(t, judge.name, judge.key);
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
