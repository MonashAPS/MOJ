/** The leaderboard's sort state, in DMOJ's `QueryStringSortMixin` spelling:
 *  `?order=-performance_points`, a leading minus for descending, and clicking the
 *  column that is already active flips it. */

export type UserSortKey = "points" | "problem_count" | "rating" | "performance_points";

/** `UserList.all_sorts`, in the order the columns are drawn. The header text is
 *  a key into `users.table` rather than the text itself, because this module is
 *  shared by pages that render in whichever language the viewer reads in. */
export const USER_SORTS: { key: UserSortKey; message: string }[] = [
  { key: "points", message: "points" },
  { key: "problem_count", message: "problems" },
  { key: "performance_points", message: "performance" },
  { key: "rating", message: "rating" },
];

/** `UserList.default_sort`. Every sort is descending first (`default_desc`). */
export const DEFAULT_USER_ORDER = "-performance_points";

const CONVEX_SORT = {
  points: "points",
  problem_count: "problemCount",
  rating: "rating",
  performance_points: "performancePoints",
} as const;

export type UserSortState = {
  order: string;
  key: UserSortKey;
  descending: boolean;
  /** The argument name `rankings.users` and `organizations.members` take. */
  sort: (typeof CONVEX_SORT)[UserSortKey];
};

export function parseUserOrder(raw: string | null | undefined): UserSortState {
  // `order.lstrip('-') in all_sorts`, with at most one leading minus.
  const candidate = raw ?? "";
  const bare = candidate.startsWith("-") ? candidate.slice(1) : candidate;
  const order = bare in CONVEX_SORT && !bare.startsWith("-") ? candidate : DEFAULT_USER_ORDER;
  const descending = order.startsWith("-");
  const key = (descending ? order.slice(1) : order) as UserSortKey;
  return { order, key, descending, sort: CONVEX_SORT[key] };
}

/** The href a column header points at: the same query with `order` replaced. */
export function sortHref(basePath: string, params: URLSearchParams, key: UserSortKey, state: UserSortState) {
  const next = new URLSearchParams(params);
  next.delete("order");
  next.delete("page");
  // `links[current]` flips the active column; every other column starts descending.
  next.set("order", key === state.key ? (state.descending ? key : `-${key}`) : `-${key}`);
  return `${basePath}?${next.toString()}`;
}

export function pageHref(basePath: string, params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}
