/**
 * `@moj/protocol`: zod schemas shared by the judge API, the problems API and
 * API v2. Nothing here does I/O; the schemas are the wire contract, so both
 * sides of a protocol can import the same one.
 */

export * from "./apiV2.js";
export * from "./judge.js";

export {
  API_ERROR_CODES,
  API_ERROR_STATUS,
  type ApiError,
  type ApiErrorCode,
  apiError,
  CREATE_DEFAULTS,
  CREATE_ONLY_FIELDS,
  type EditorialInput,
  editorialInput,
  type ImageUploadResponse,
  imageUploadResponse,
  type LanguageLimitInput,
  languageLimitInput,
  languageLimitsInput,
  MAX_IMAGE_BYTES,
  PROBLEMS_WRITE_SCOPE,
  type ProblemSummary,
  type ProblemUpsertInput,
  type ProblemUpsertResponse,
  problemCode,
  problemSummary,
  problemUpsertInput,
  problemUpsertResponse,
} from "./problems.js";
