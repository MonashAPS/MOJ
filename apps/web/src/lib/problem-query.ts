/**
 * `/problems/`'s state, which lives entirely in the URL query so a filtered list
 * is a shareable link (spec section 20).
 *
 * The parameter names are DMOJ's wherever DMOJ has one — `search`, `full_text`,
 * `hide_solved`, `has_public_editorial`, `show_types`, `category`, `type`,
 * `point_start`, `point_end`, `order`, `page` — so an old bookmark still resolves.
 * The parameters MOJ adds (`status`, `solved_by`, `not_by_me`, `author`,
 * `contest`, `group_by_contest`) follow the same spelling.
 */

export type ProblemSort =
  | "code"
  | "name"
  | "points"
  | "acRate"
  | "userCount"
  | "date"
  | "group"
  | "solved"
  | "type"
  | "editorial";

export type ProblemStatus = "all" | "solved" | "attempted" | "unsolved";

/** DMOJ's `order` is one signed field name, e.g. `-points`. */
const SORT_BY_PARAM: Record<string, ProblemSort> = {
  code: "code",
  name: "name",
  points: "points",
  ac_rate: "acRate",
  user_count: "userCount",
  date: "date",
  group: "group",
  solved: "solved",
  type: "type",
  editorial: "editorial",
};
const PARAM_BY_SORT = Object.fromEntries(
  Object.entries(SORT_BY_PARAM).map(([param, sort]) => [sort, param]),
) as Record<ProblemSort, string>;

/** DMOJ's `default_desc`, extended with the two sorts the panel adds. */
const DEFAULT_DESC = new Set<ProblemSort>(["points", "acRate", "userCount", "date", "solved"]);

export type ProblemQuery = {
  search: string;
  fullText: boolean;
  hideSolved: boolean;
  hasEditorial: boolean;
  showTypes: boolean;
  category: string;
  types: string[];
  pointStart: number | null;
  pointEnd: number | null;
  sort: ProblemSort;
  descending: boolean;
  page: number;
  status: ProblemStatus;
  solvedBy: string[];
  notByMe: boolean;
  author: string;
  contests: string[];
  groupByContest: boolean;
};

export const EMPTY_QUERY: ProblemQuery = {
  search: "",
  fullText: false,
  hideSolved: false,
  hasEditorial: false,
  showTypes: false,
  category: "",
  types: [],
  pointStart: null,
  pointEnd: null,
  sort: "code",
  descending: false,
  page: 1,
  status: "all",
  solvedBy: [],
  notByMe: false,
  author: "",
  contests: [],
  groupByContest: false,
};

/** Next hands a server component `string | string[] | undefined` per key. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function many(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function flag(value: string | string[] | undefined): boolean {
  const raw = one(value);
  return raw === "1" || raw === "true" || raw === "on";
}

function integer(value: string | string[] | undefined): number | null {
  const raw = one(value).trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function parseProblemQuery(params: RawSearchParams | URLSearchParams): ProblemQuery {
  const get = (key: string): string | string[] | undefined =>
    params instanceof URLSearchParams ? params.getAll(key) : params[key];

  const orderRaw = one(get("order")).trim();
  const orderKey = orderRaw.startsWith("-") ? orderRaw.slice(1) : orderRaw;
  const sort = SORT_BY_PARAM[orderKey] ?? "code";
  const descending = orderRaw ? orderRaw.startsWith("-") : DEFAULT_DESC.has(sort) && sort !== "code";

  const statusRaw = one(get("status")) as ProblemStatus;
  const status: ProblemStatus = ["all", "solved", "attempted", "unsolved"].includes(statusRaw)
    ? statusRaw
    : "all";

  return {
    search: one(get("search")),
    fullText: flag(get("full_text")),
    hideSolved: flag(get("hide_solved")),
    hasEditorial: flag(get("has_public_editorial")),
    showTypes: flag(get("show_types")),
    category: one(get("category")),
    types: many(get("type")),
    pointStart: integer(get("point_start")),
    pointEnd: integer(get("point_end")),
    sort,
    descending,
    page: Math.max(1, integer(get("page")) ?? 1),
    status,
    solvedBy: many(get("solved_by")),
    notByMe: flag(get("not_by_me")),
    author: one(get("author")),
    contests: many(get("contest")),
    groupByContest: flag(get("group_by_contest")),
  };
}

/** The inverse: only what differs from the default is written, so a plain list
 *  stays `/problems/` and every filtered one is a short, readable link. */
export function problemQueryString(query: ProblemQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.fullText) params.set("full_text", "1");
  if (query.hideSolved) params.set("hide_solved", "1");
  if (query.hasEditorial) params.set("has_public_editorial", "1");
  if (query.showTypes) params.set("show_types", "1");
  if (query.category) params.set("category", query.category);
  for (const type of query.types) params.append("type", type);
  if (query.pointStart !== null) params.set("point_start", String(query.pointStart));
  if (query.pointEnd !== null) params.set("point_end", String(query.pointEnd));
  if (query.status !== "all") params.set("status", query.status);
  for (const username of query.solvedBy) params.append("solved_by", username);
  if (query.notByMe) params.set("not_by_me", "1");
  if (query.author) params.set("author", query.author);
  for (const key of query.contests) params.append("contest", key);
  if (query.groupByContest) params.set("group_by_contest", "1");
  if (query.sort !== "code" || query.descending) {
    params.set("order", `${query.descending ? "-" : ""}${PARAM_BY_SORT[query.sort]}`);
  }
  if (query.page > 1) params.set("page", String(query.page));
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function problemHref(query: ProblemQuery, base = "/problems/"): string {
  return `${base}${problemQueryString(query)}`;
}

/** The args `problems.list` takes. `hide_solved` is DMOJ's spelling of
 *  `status=unsolved`, and it wins when both are set, as DMOJ's form does. */
export function problemListArgs(query: ProblemQuery, pageSize = 50) {
  return {
    search: query.search || undefined,
    fullText: query.fullText,
    status: query.hideSolved ? ("unsolved" as const) : query.status,
    solvedBy: query.solvedBy.length > 0 ? query.solvedBy : undefined,
    solvedByNotMe: query.notByMe || undefined,
    types: query.types.length > 0 ? query.types : undefined,
    group: query.category || undefined,
    pointStart: query.pointStart ?? undefined,
    pointEnd: query.pointEnd ?? undefined,
    author: query.author || undefined,
    hasEditorial: query.hasEditorial || undefined,
    contestKeys: query.contests.length > 0 ? query.contests : undefined,
    groupByContest: query.groupByContest || undefined,
    showTypes: query.showTypes,
    sort: query.sort,
    order: (query.descending ? "desc" : "asc") as "asc" | "desc",
    page: query.page,
    pageSize,
  };
}

/** How many filters are on, for the "Filters (3)" button and the group counts. */
export function activeFilterCount(query: ProblemQuery): number {
  let count = 0;
  if (query.search) count += 1;
  if (query.hideSolved || query.status !== "all") count += 1;
  if (query.hasEditorial) count += 1;
  if (query.category) count += 1;
  count += query.types.length;
  if (query.pointStart !== null || query.pointEnd !== null) count += 1;
  count += query.solvedBy.length;
  if (query.author) count += 1;
  count += query.contests.length;
  return count;
}

/** DMOJ toggles a header between ascending and descending, defaulting to the
 *  direction that column is usually read in. */
export function toggleSort(query: ProblemQuery, sort: ProblemSort): ProblemQuery {
  const descending = query.sort === sort ? !query.descending : DEFAULT_DESC.has(sort);
  return { ...query, sort, descending, page: 1 };
}
