/**
 * `@moj/protocol`: the wire formats MOJ speaks to things that are not the web
 * app. Pure zod, no Convex and no I/O, so both sides of a protocol can import
 * the same schema.
 */

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
