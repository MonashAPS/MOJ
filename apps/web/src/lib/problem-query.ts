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

const PROBLEM_SORTS = [
  "code",
  "name",
  "points",
  "acRate",
  "userCount",
  "date",
  "group",
  "solved",
  "type",
  "editorial",
] as const;

export type ProblemSort = (typeof PROBLEM_SORTS)[number];

const PROBLEM_STATUSES = ["all", "solved", "attempted", "unsolved"] as const;

export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

/** DMOJ's `order` is one signed field name, e.g. `-points`. MOJ may follow it
 *  with the previous sort, `-user_count,-ac_rate`, which breaks its ties. */
const PARAM_BY_SORT: Record<ProblemSort, string> = {
  code: "code",
  name: "name",
  points: "points",
  acRate: "ac_rate",
  userCount: "user_count",
  date: "date",
  group: "group",
  solved: "solved",
  type: "type",
  editorial: "editorial",
};

const SORT_BY_PARAM = new Map<string, ProblemSort>();

for (const sort of PROBLEM_SORTS) SORT_BY_PARAM.set(PARAM_BY_SORT[sort], sort);

/** The `status` parameter, and the radio group that writes it. */
export function parseProblemStatus(value: string): ProblemStatus {
  return PROBLEM_STATUSES.find((status) => status === value) ?? "all";
}

/** The `order` parameter without its sign, and the sort select that writes it. */
export function parseProblemSort(value: string): ProblemSort {
  return PROBLEM_SORTS.find((sort) => sort === value) ?? "code";
}

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
  /** The sort before this one, which orders the rows this one ties. */
  thenSort: { sort: ProblemSort; descending: boolean } | null;
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
  thenSort: null,
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

  const [orderRaw = "", thenRaw = ""] = one(get("order"))
    .split(",")
    .map((part) => part.trim());

  const orderKey = orderRaw.startsWith("-") ? orderRaw.slice(1) : orderRaw;
  const sort = SORT_BY_PARAM.get(orderKey) ?? "code";
  const descending = orderRaw ? orderRaw.startsWith("-") : DEFAULT_DESC.has(sort) && sort !== "code";
  const thenSort = SORT_BY_PARAM.get(thenRaw.startsWith("-") ? thenRaw.slice(1) : thenRaw);
  const status = parseProblemStatus(one(get("status")));

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
    thenSort: thenSort && thenSort !== sort ? { sort: thenSort, descending: thenRaw.startsWith("-") } : null,
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

  if (query.sort !== "code" || query.descending || query.thenSort) {
    const signed = (sort: ProblemSort, descending: boolean) =>
      `${descending ? "-" : ""}${PARAM_BY_SORT[sort]}`;

    const then = query.thenSort ? `,${signed(query.thenSort.sort, query.thenSort.descending)}` : "";
    params.set("order", `${signed(query.sort, query.descending)}${then}`);
  }

  if (query.page > 1) params.set("page", String(query.page));
  const encoded = params.toString();

  return encoded ? `?${encoded}` : "";
}

export function problemHref(query: ProblemQuery, base = "/problems/"): string {
  return `${base}${problemQueryString(query)}`;
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

/**
 * Sorts by a column. A new column keeps the one before it as the tie-break, the
 * way a spreadsheet sort is stable: sort by AC rate, then by users, and problems
 * with as many users stay in AC-rate order. Code breaks whatever is left.
 */
export function sortBy(
  query: ProblemQuery,
  sort: ProblemSort,
  descending = DEFAULT_DESC.has(sort),
): ProblemQuery {
  if (query.sort === sort) return { ...query, descending, page: 1 };
  const previousIsDefault = query.sort === "code" && !query.descending;

  return {
    ...query,
    sort,
    descending,
    thenSort: previousIsDefault ? null : { sort: query.sort, descending: query.descending },
    page: 1,
  };
}

/** DMOJ toggles a header between ascending and descending, defaulting to the
 *  direction that column is usually read in. */
export function toggleSort(query: ProblemQuery, sort: ProblemSort): ProblemQuery {
  return sortBy(query, sort, query.sort === sort ? !query.descending : DEFAULT_DESC.has(sort));
}
