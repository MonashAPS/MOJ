/**
 * Problems API wire schemas (SPEC section 8).
 *
 * `PUT /api/problems/:code` replaces driving the Django admin form with a
 * browser, which is how a problem repository used to publish, so the semantics
 * here are that era's, field for field:
 *
 *   - an absent key means "leave unchanged" on an existing problem;
 *   - `authors: []` means "leave unchanged" too, because the uploader writes
 *     `authors` from config.json where an empty list is the common no-op;
 *   - `group`, `types`, `publishOn` and `checkAll` are create-only: the
 *     uploader sets the taxonomy and the publish date on the add form and
 *     never touches them again;
 *   - `name` is required to create, optional to update.
 */

import { z } from "zod";

/** DMOJ's `Problem.code` validator: `^[a-z0-9]+$` plus dots, max 20 characters. */
export const problemCode = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[a-z.0-9]+$/, "Problem codes may only contain lowercase letters, digits and dots.");

export const editorialInput = z.object({
  content: z.string(),
  isPublic: z.boolean().optional(),
  publishOn: z.number().optional(),
});

export const languageLimitInput = z.object({
  timeLimit: z.number().positive(),
  memoryLimit: z.number().positive(),
});

/**
 * The uploader only ever writes python3 and pypy3 limits, but the endpoint
 * accepts any language key so a repo can pin, say, `java` as well.
 */
export const languageLimitsInput = z.record(z.string(), languageLimitInput);

export const problemUpsertInput = z
  .object({
    name: z.string().min(1).optional(),
    statement: z.string().optional(),
    editorial: editorialInput.nullable().optional(),
    points: z.number().positive().optional(),
    timeLimit: z.number().positive().optional(),
    memoryLimit: z.number().positive().optional(),
    shortCircuit: z.boolean().optional(),
    partial: z.boolean().optional(),
    isPublic: z.boolean().optional(),
    authors: z.array(z.string()).optional(),
    testers: z.array(z.string()).optional(),
    curators: z.array(z.string()).optional(),
    summary: z.string().optional(),
    // Create-only below this line.
    group: z.string().optional(),
    types: z.array(z.string()).optional(),
    publishOn: z.number().optional(),
    checkAll: z.boolean().optional(),
    languageLimits: languageLimitsInput.optional(),
  })
  .strict();

export type ProblemUpsertInput = z.infer<typeof problemUpsertInput>;
export type EditorialInput = z.infer<typeof editorialInput>;
export type LanguageLimitInput = z.infer<typeof languageLimitInput>;

/** Keys the endpoint honours only when it is creating the problem. */
export const CREATE_ONLY_FIELDS = ["group", "types", "publishOn", "checkAll"] as const;

/** What `create-problem.mjs` used when config.json left the field out. */
export const CREATE_DEFAULTS = {
  points: 100,
  timeLimit: 1,
  memoryLimit: 1_000_000,
  shortCircuit: true,
  group: "uncategorized",
  types: ["uncategorized"],
} as const;

export const problemSummary = z.object({
  code: z.string(),
  name: z.string(),
  points: z.number(),
  timeLimit: z.number(),
  memoryLimit: z.number(),
  shortCircuit: z.boolean(),
  partial: z.boolean(),
  isPublic: z.boolean(),
  group: z.string(),
  types: z.array(z.string()),
  authors: z.array(z.string()),
  testers: z.array(z.string()),
  date: z.number(),
  hasEditorial: z.boolean(),
  languageLimits: z.record(z.string(), languageLimitInput),
  allowedLanguages: z.array(z.string()),
});

export type ProblemSummary = z.infer<typeof problemSummary>;

export const problemUpsertResponse = z.object({
  ok: z.literal(true),
  created: z.boolean(),
  problem: problemSummary,
  /** Names the request asked for that no profile matched; the write still went through. */
  warnings: z.array(z.string()).optional(),
});

export type ProblemUpsertResponse = z.infer<typeof problemUpsertResponse>;

/** DMOJ's martor image endpoint answered with exactly this shape. */
export const imageUploadResponse = z.object({
  status: z.literal(200),
  link: z.string(),
});

export type ImageUploadResponse = z.infer<typeof imageUploadResponse>;

export const API_ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "invalid",
  "conflict",
  "payload_too_large",
  "internal",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiError = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
  }),
});

export type ApiError = z.infer<typeof apiError>;

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid: 422,
  conflict: 409,
  payload_too_large: 413,
  internal: 500,
};

/** The scope an API key must carry to write problems. */
export const PROBLEMS_WRITE_SCOPE = "problems:write";

/** Reading API v2, limited to what the key's owner can already see. */
export const READ_SCOPE = "read";

/** Every scope a key can hold. There are exactly two, and both `/admin/api-keys`
 *  and `/accounts/api/token/generate/` offer the same pair. */
export const API_SCOPES = [READ_SCOPE, PROBLEMS_WRITE_SCOPE] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

/** Largest statement image the endpoint accepts, matching DMOJ's martor limit. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
