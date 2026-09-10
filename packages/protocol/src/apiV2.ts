/**
 * API v2: the envelope and object shapes DMOJ serves from
 * `judge/views/api/api_v2.py`.
 *
 * Field names are DMOJ's verbatim (snake_case), including the ones that look
 * redundant (`rate_all` is `is_rated and rate_all`, `is_pretested` is
 * `is_pretested and run_pretests_only`). Clients written against
 * judge.monashaps.com must keep working, so nothing here is "improved".
 *
 * Numeric object ids: DMOJ exposes Django primary keys. MOJ keeps them in
 * `legacyId` for imported rows and has none for rows created after the import,
 * so `apiId` is `number | string`: the Django id where there is one, the Convex
 * document id otherwise. Filters accept either form.
 */

import { z } from "zod";

/** `settings.DMOJ_API_PAGE_SIZE`. */
export const API_PAGE_SIZE = 1000;

export const API_VERSION = "2.0";

/** DMOJ ids are integers; MOJ falls back to the Convex document id. */
export const apiId = z.union([z.number(), z.string()]);
export type ApiId = z.infer<typeof apiId>;

/* -------------------------------------------------------------------------- */
/* Envelope                                                                   */
/* -------------------------------------------------------------------------- */

export const apiErrorBody = z.object({
  code: z.number(),
  message: z.string(),
});
export type ApiErrorBody = z.infer<typeof apiErrorBody>;

const baseResponse = {
  api_version: z.literal(API_VERSION),
  method: z.string(),
  fetched: z.string(),
};

export const apiErrorResponse = z.object({ ...baseResponse, error: apiErrorBody });
export type ApiErrorResponse = z.infer<typeof apiErrorResponse>;

/**
 * `APIListView.get_api_data`. `total_objects` and `total_pages` are absent when
 * the view paginates infinitely (submissions with no basic filter).
 */
export function listData<T extends z.ZodTypeAny>(object: T) {
  return z.object({
    current_object_count: z.number(),
    objects_per_page: z.number(),
    page_index: z.number(),
    has_more: z.boolean(),
    objects: z.array(object),
    total_objects: z.number().optional(),
    total_pages: z.number().optional(),
  });
}

export function listResponse<T extends z.ZodTypeAny>(object: T) {
  return z.object({ ...baseResponse, data: listData(object) });
}

export function detailResponse<T extends z.ZodTypeAny>(object: T) {
  return z.object({ ...baseResponse, data: z.object({ object }) });
}

export type ApiListData<T> = {
  current_object_count: number;
  objects_per_page: number;
  page_index: number;
  has_more: boolean;
  objects: T[];
  total_objects?: number;
  total_pages?: number;
};

/* -------------------------------------------------------------------------- */
/* Contests                                                                   */
/* -------------------------------------------------------------------------- */

export const apiContestListObject = z.object({
  key: z.string(),
  name: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  time_limit: z.number().nullable(),
  is_rated: z.boolean(),
  rate_all: z.boolean(),
  tags: z.array(z.string()),
});
export type ApiContestListObject = z.infer<typeof apiContestListObject>;

export const apiContestProblem = z.object({
  points: z.number(),
  partial: z.boolean(),
  is_pretested: z.boolean(),
  max_submissions: z.number().nullable(),
  label: z.string(),
  name: z.string(),
  code: z.string(),
});
export type ApiContestProblem = z.infer<typeof apiContestProblem>;

/** `ContestFormat.get_problem_breakdown` output, one entry per contest problem. */
export const apiSolution = z
  .object({
    points: z.number(),
    time: z.number(),
  })
  .nullable();

export const apiContestRanking = z.object({
  user: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  score: z.number(),
  cumulative_time: z.number(),
  tiebreaker: z.number(),
  old_rating: z.number().nullable(),
  new_rating: z.number().nullable(),
  is_disqualified: z.boolean(),
  solutions: z.array(apiSolution),
});
export type ApiContestRanking = z.infer<typeof apiContestRanking>;

export const apiContestDetailObject = apiContestListObject.extend({
  has_rating: z.boolean(),
  rating_floor: z.number().nullable(),
  rating_ceiling: z.number().nullable(),
  performance_ceiling: z.number().nullable(),
  hidden_scoreboard: z.boolean(),
  scoreboard_visibility: z.string(),
  is_organization_private: z.boolean(),
  organizations: z.array(apiId),
  is_private: z.boolean(),
  format: z.object({ name: z.string(), config: z.unknown() }),
  problems: z.array(apiContestProblem),
  rankings: z.array(apiContestRanking),
});
export type ApiContestDetailObject = z.infer<typeof apiContestDetailObject>;

export const apiParticipationObject = z.object({
  user: z.string(),
  contest: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  score: z.number(),
  cumulative_time: z.number(),
  tiebreaker: z.number(),
  is_disqualified: z.boolean(),
  virtual_participation_number: z.number(),
});
export type ApiParticipationObject = z.infer<typeof apiParticipationObject>;

/* -------------------------------------------------------------------------- */
/* Problems                                                                   */
/* -------------------------------------------------------------------------- */

export const apiProblemListObject = z.object({
  code: z.string(),
  name: z.string(),
  types: z.array(z.string()),
  group: z.string(),
  points: z.number(),
  partial: z.boolean(),
  is_organization_private: z.boolean(),
  is_public: z.boolean(),
});
export type ApiProblemListObject = z.infer<typeof apiProblemListObject>;

export const apiLanguageResourceLimit = z.object({
  language: z.string(),
  time_limit: z.number(),
  memory_limit: z.number(),
});

export const apiProblemDetailObject = z.object({
  code: z.string(),
  name: z.string(),
  authors: z.array(z.string()),
  types: z.array(z.string()),
  group: z.string(),
  time_limit: z.number(),
  memory_limit: z.number(),
  language_resource_limits: z.array(apiLanguageResourceLimit),
  points: z.number(),
  partial: z.boolean(),
  short_circuit: z.boolean(),
  languages: z.array(z.string()),
  is_organization_private: z.boolean(),
  organizations: z.array(apiId),
  is_public: z.boolean(),
});
export type ApiProblemDetailObject = z.infer<typeof apiProblemDetailObject>;

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export const apiUserListObject = z.object({
  id: apiId,
  username: z.string(),
  points: z.number(),
  performance_points: z.number(),
  problem_count: z.number(),
  rank: z.string(),
  rating: z.number().nullable(),
});
export type ApiUserListObject = z.infer<typeof apiUserListObject>;

export const apiUserContestHistory = z.object({
  key: z.string(),
  score: z.number(),
  cumulative_time: z.number(),
  rating: z.number().nullable(),
  raw_rating: z.number().nullable(),
  performance: z.number().nullable(),
});

export const apiUserDetailObject = z.object({
  id: apiId,
  username: z.string(),
  about: z.string().nullable(),
  points: z.number(),
  performance_points: z.number(),
  problem_count: z.number(),
  solved_problems: z.array(z.string()),
  rank: z.string(),
  rating: z.number().nullable(),
  organizations: z.array(apiId),
  contests: z.array(apiUserContestHistory),
});
export type ApiUserDetailObject = z.infer<typeof apiUserDetailObject>;

/* -------------------------------------------------------------------------- */
/* Submissions                                                                */
/* -------------------------------------------------------------------------- */

export const apiSubmissionContest = z
  .object({
    key: z.string(),
    points: z.number().nullable(),
    virtual_participation_number: z.number(),
    time_since_start_of_participation: z.number(),
  })
  .nullable();

export const apiSubmissionListObject = z.object({
  id: apiId,
  problem: z.string(),
  user: z.string(),
  date: z.string(),
  language: z.string(),
  time: z.number().nullable(),
  memory: z.number().nullable(),
  points: z.number().nullable(),
  result: z.string().nullable(),
  contest: apiSubmissionContest,
});
export type ApiSubmissionListObject = z.infer<typeof apiSubmissionListObject>;

export const apiSubmissionCase = z.object({
  type: z.literal("case"),
  case_id: z.number(),
  status: z.string(),
  time: z.number(),
  memory: z.number(),
  points: z.number(),
  total: z.number(),
});

export const apiSubmissionBatch = z.object({
  type: z.literal("batch"),
  batch_id: z.number(),
  cases: z.array(apiSubmissionCase),
  points: z.number(),
  total: z.number(),
});

export const apiSubmissionCaseEntry = z.union([apiSubmissionCase, apiSubmissionBatch]);
export type ApiSubmissionCaseEntry = z.infer<typeof apiSubmissionCaseEntry>;

export const apiSubmissionDetailObject = z.object({
  id: apiId,
  problem: z.string(),
  user: z.string(),
  date: z.string(),
  time: z.number().nullable(),
  memory: z.number().nullable(),
  points: z.number().nullable(),
  language: z.string(),
  status: z.string(),
  result: z.string().nullable(),
  case_points: z.number(),
  case_total: z.number(),
  cases: z.array(apiSubmissionCaseEntry),
});
export type ApiSubmissionDetailObject = z.infer<typeof apiSubmissionDetailObject>;

/* -------------------------------------------------------------------------- */
/* Organizations, languages, judges                                           */
/* -------------------------------------------------------------------------- */

export const apiOrganizationObject = z.object({
  id: apiId,
  slug: z.string(),
  short_name: z.string(),
  is_open: z.boolean(),
  member_count: z.number(),
});
export type ApiOrganizationObject = z.infer<typeof apiOrganizationObject>;

export const apiLanguageObject = z.object({
  id: apiId,
  key: z.string(),
  short_name: z.string().nullable(),
  common_name: z.string(),
  ace_mode_name: z.string(),
  pygments_name: z.string(),
  code_template: z.string(),
});
export type ApiLanguageObject = z.infer<typeof apiLanguageObject>;

export const apiJudgeObject = z.object({
  name: z.string(),
  start_time: z.string(),
  ping: z.number().nullable(),
  load: z.number().nullable(),
  languages: z.array(z.string()),
});
export type ApiJudgeObject = z.infer<typeof apiJudgeObject>;

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * DMOJ's `basic_filters` take a single value from the query string and
 * `list_filters` take every repetition of the key (`?id=1&id=2`).
 */
export const API_BASIC_FILTERS: Readonly<Record<string, readonly string[]>> = {
  contests: ["is_rated"],
  problems: ["partial"],
  submissions: ["user", "problem", "contest"],
  participations: ["contest", "user", "is_disqualified", "virtual_participation_number"],
  organizations: ["is_open"],
  languages: ["common_name"],
};

export const API_LIST_FILTERS: Readonly<Record<string, readonly string[]>> = {
  contests: ["key", "tag", "organization"],
  problems: ["code", "group", "type", "organization"],
  users: ["id", "username", "organization"],
  submissions: ["id", "language", "result"],
  organizations: ["id"],
  languages: ["id", "key"],
};

/** `?partial=true` and friends: Django's `BooleanField.to_python`. */
export function parseApiBoolean(value: string): boolean {
  const lowered = value.trim().toLowerCase();
  if (lowered === "true" || lowered === "1") return true;
  if (lowered === "false" || lowered === "0") return false;
  throw new TypeError("invalid filter value type");
}

/** `?page=`: DMOJ 404s on a page that is not a positive integer. */
export function parsePageNumber(value: string | null): number {
  if (value === null || value === "") return 1;
  if (!/^\d+$/.test(value)) return Number.NaN;
  const page = Number.parseInt(value, 10);
  return page >= 1 ? page : Number.NaN;
}
