/**
 * The judge API wire format, as zod schemas.
 *
 * `apps/judge/README.md` documents this protocol and
 * `apps/judge/judge-server/dmoj/moj_packet.py` is the client that speaks it;
 * between them they are authoritative. These schemas are deliberately tolerant:
 * unknown keys are stripped rather than rejected, numeric fields that DMOJ's
 * `Result` can leave unset accept null, and the submission id is whatever the
 * site handed out on the claim (an integer for a real submission; a string is
 * accepted so a Convex document id also round-trips).
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

/** Every request carries these, in the body for POSTs and the query for the GET. */
export const judgeAuthSchema = z.object({
  judgeName: z.string().min(1).max(200),
  judgeKey: z.string().min(1).max(4096),
});

export type JudgeAuth = z.infer<typeof judgeAuthSchema>;

/* -------------------------------------------------------------------------- */
/* Handshake and heartbeat                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `get_supported_problems_and_mtimes()`: a problem code and the mtime of its
 * directory. The mtime is a float and is only ever compared, never parsed.
 */
export const problemListSchema = z.array(
  z.tuple([z.string(), z.number().nullable().optional()]).rest(z.unknown()),
);

/**
 * `get_runtime_versions()`: `{LANG: [[name, [major, minor, patch]], ...]}`.
 * Version components are integers for every executor DMOJ ships, but a few
 * report a string, so both are accepted.
 */
export const executorMapSchema = z.record(
  z.string(),
  z.array(z.tuple([z.string(), z.array(z.union([z.number(), z.string()]))]).rest(z.unknown())),
);

export const handshakeRequestSchema = judgeAuthSchema.extend({
  problems: problemListSchema,
  executors: executorMapSchema,
});

export type HandshakeRequest = z.infer<typeof handshakeRequestSchema>;

export const heartbeatRequestSchema = judgeAuthSchema.extend({
  load: z.number().nullable().optional(),
  problems: problemListSchema.optional(),
  executors: executorMapSchema.optional(),
});

export type HeartbeatRequest = z.infer<typeof heartbeatRequestSchema>;

export const disconnectRequestSchema = judgeAuthSchema;

/* -------------------------------------------------------------------------- */
/* Claim                                                                      */
/* -------------------------------------------------------------------------- */

export const claimRequestSchema = judgeAuthSchema;

/**
 * The submission id as it travels on the wire.
 *
 * The judge formats it into a process name with `%d` (`dmoj/judge.py`), so a
 * claim must hand back an integer; incoming events accept a string as well so a
 * Convex document id can be used by anything that is not the real judge.
 */
export const submissionIdSchema = z.union([z.number(), z.string().min(1).max(200)]);

export type WireSubmissionId = z.infer<typeof submissionIdSchema>;

export const submissionMetaSchema = z.object({
  pretestsOnly: z.boolean(),
  inContest: z.union([z.number(), z.string(), z.null()]),
  attemptNo: z.number(),
  user: z.union([z.number(), z.string()]),
  userNotes: z.string(),
});

export type SubmissionMeta = z.infer<typeof submissionMetaSchema>;

export const claimedSubmissionSchema = z.object({
  submissionId: submissionIdSchema,
  problemCode: z.string(),
  languageKey: z.string(),
  source: z.string(),
  /** Seconds, already resolved against any per-language override. */
  timeLimit: z.number(),
  /** Kilobytes, likewise resolved. */
  memoryLimit: z.number(),
  shortCircuit: z.boolean(),
  /**
   * sha256 of the archive the site holds for this problem, or null. Non-null
   * means the judge grades from the site's copy at that hash, fetched with
   * `GET /judge/data`; null means it grades from its own disk. A server that
   * predates site-owned data omits the field, which reads as null.
   */
  problemDataHash: z.string().nullable().default(null),
  meta: submissionMetaSchema,
});

export type ClaimedSubmission = z.infer<typeof claimedSubmissionSchema>;

export const claimResponseSchema = z.object({
  submission: claimedSubmissionSchema.nullable(),
});

/* -------------------------------------------------------------------------- */
/* Test data                                                                  */
/* -------------------------------------------------------------------------- */

/** `GET /judge/data`: the archive for one problem, optionally pinned to a hash. */
export const judgeDataQuerySchema = judgeAuthSchema.extend({
  code: z.string().min(1).max(200),
  hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
});

export type JudgeDataQuery = z.infer<typeof judgeDataQuerySchema>;

/** Headers `GET /judge/data` answers with, so the judge can verify what it got. */
export const DATA_HASH_HEADER = "X-Moj-Data-Hash";
export const DATA_SIZE_HEADER = "X-Moj-Data-Size";

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

const nullableNumber = z.number().nullable().optional();
const nullableString = z.string().nullable().optional();

/**
 * One graded case. `status` is DMOJ's bitmask; decode it with
 * `decodeCaseStatus` from `@moj/core`.
 *
 * The context switch counters and the runtime version are extra over what SPEC
 * section 6 lists: DMOJ's bridge writes them to its json log and drops them.
 */
export const judgeCaseSchema = z.object({
  /** 1-based across the whole submission, not per batch. */
  position: z.number(),
  status: z.number(),
  /** Seconds. */
  time: nullableNumber,
  /** Kilobytes. */
  memory: nullableNumber,
  points: nullableNumber,
  totalPoints: nullableNumber,
  output: nullableString,
  feedback: nullableString,
  extendedFeedback: nullableString,
  voluntaryContextSwitches: nullableNumber,
  involuntaryContextSwitches: nullableNumber,
  runtimeVersion: nullableString,
});

export type JudgeCase = z.infer<typeof judgeCaseSchema>;

export const gradingBeginEventSchema = z.object({
  type: z.literal("grading-begin"),
  pretested: z.boolean().nullable().optional(),
});

export const batchBeginEventSchema = z.object({ type: z.literal("batch-begin") });
export const batchEndEventSchema = z.object({ type: z.literal("batch-end") });

export const testCaseStatusEventSchema = z.object({
  type: z.literal("test-case-status"),
  cases: z.array(judgeCaseSchema),
});

export const gradingEndEventSchema = z.object({ type: z.literal("grading-end") });

export const compileErrorEventSchema = z.object({
  type: z.literal("compile-error"),
  log: z.string().nullable().optional(),
});

export const compileMessageEventSchema = z.object({
  type: z.literal("compile-message"),
  log: z.string().nullable().optional(),
});

export const internalErrorEventSchema = z.object({
  type: z.literal("internal-error"),
  message: z.string().nullable().optional(),
});

export const submissionTerminatedEventSchema = z.object({
  type: z.literal("submission-terminated"),
});

export const judgeEventSchema = z.discriminatedUnion("type", [
  gradingBeginEventSchema,
  batchBeginEventSchema,
  batchEndEventSchema,
  testCaseStatusEventSchema,
  gradingEndEventSchema,
  compileErrorEventSchema,
  compileMessageEventSchema,
  internalErrorEventSchema,
  submissionTerminatedEventSchema,
]);

export type JudgeEvent = z.infer<typeof judgeEventSchema>;
export type JudgeEventType = JudgeEvent["type"];

export const JUDGE_EVENT_TYPES: readonly JudgeEventType[] = [
  "grading-begin",
  "batch-begin",
  "batch-end",
  "test-case-status",
  "grading-end",
  "compile-error",
  "compile-message",
  "internal-error",
  "submission-terminated",
];

export const eventRequestSchema = judgeAuthSchema.extend({
  submissionId: submissionIdSchema,
  event: judgeEventSchema,
});

export type EventRequest = z.infer<typeof eventRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Abort                                                                      */
/* -------------------------------------------------------------------------- */

export const abortQuerySchema = judgeAuthSchema.extend({
  submissionId: submissionIdSchema,
});

export const abortResponseSchema = z.object({ abort: z.boolean() });

/* -------------------------------------------------------------------------- */
/* Responses                                                                  */
/* -------------------------------------------------------------------------- */

export const handshakeResponseSchema = z.object({ ok: z.literal(true), judgeId: z.string() });
export const heartbeatResponseSchema = z.object({ ok: z.literal(true), serverTime: z.number() });
export const eventResponseSchema = z.object({ ok: z.boolean(), error: z.string().optional() });
export const disconnectResponseSchema = z.object({ ok: z.literal(true) });
export const errorResponseSchema = z.object({ error: z.string() });

export type HandshakeResponse = z.infer<typeof handshakeResponseSchema>;
export type HeartbeatResponse = z.infer<typeof heartbeatResponseSchema>;
export type ClaimResponse = z.infer<typeof claimResponseSchema>;
export type AbortResponse = z.infer<typeof abortResponseSchema>;
