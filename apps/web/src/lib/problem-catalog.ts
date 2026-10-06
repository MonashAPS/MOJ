import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { ProblemQuery, ProblemSort } from "./problem-query";

/**
 * `/problems/` filtered, sorted and paged in the browser.
 *
 * The catalog holds every problem the viewer may see, so a filter or a sort is
 * a pass over a few hundred rows rather than a request. Only the two filters
 * that need the server arrive from outside: the problems whose statement
 * matches the search, and the problems the "solved by" users have solved.
 */

export type Catalog = FunctionReturnType<typeof api.problems.catalog>;

export type CatalogRow = Catalog["rows"][number];

/** A row as the table draws it, with its label in the filtered contest. */
export type CatalogItem = CatalogRow & { contestLabel: string | null };

export type CatalogView = {
  items: CatalogItem[];
  groups: { contestKey: string; contestName: string; startTime: number; items: CatalogItem[] }[] | null;
  /** On a grouped page, the problems that were in no contest, drawn after the groups. */
  ungrouped: CatalogItem[];
  total: number;
  page: number;
  totalPages: number;
  /** The point values left once every filter but points applies, for the slider. */
  pointValues: { min: number; max: number; values: number[] };
};

export type CatalogExtras = {
  /** Problems whose name or statement the server matched, for a full-text search. */
  readonly searchIds?: ReadonlySet<string> | null;
  /** Problems every "solved by" user has solved. */
  readonly solvedByIds?: ReadonlySet<string> | null;
  /** Status filters only mean something for a signed-in viewer. */
  readonly authenticated: boolean;
};

const PAGE_SIZE = 50;

function stateRank(row: CatalogRow): number {
  if (row.state === "solved") return 1;

  return row.state === "none" ? -1 : 0;
}

function compareBy(sort: ProblemSort, a: CatalogRow, b: CatalogRow): number {
  switch (sort) {
    case "name":
      return a.name.localeCompare(b.name);
    case "points":
      return a.points - b.points;
    case "acRate":
      return a.acRate - b.acRate;
    case "userCount":
      return a.userCount - b.userCount;
    case "date":
      return a.date - b.date;
    case "group":
      return (a.group?.name ?? "").localeCompare(b.group?.name ?? "");
    case "editorial":
      return Number(a.hasPublicEditorial) - Number(b.hasPublicEditorial);
    case "type":
      return (a.types[0]?.fullName ?? "").localeCompare(b.types[0]?.fullName ?? "");
    case "solved":
      return stateRank(a) - stateRank(b);
    default:
      return a.code.localeCompare(b.code);
  }
}

/** The sort, then the sort before it, then the code, so the order never depends on how rows arrived. */
function comparator(query: ProblemQuery): (a: CatalogRow, b: CatalogRow) => number {
  const keys = [
    { sort: query.sort, descending: query.descending },
    ...(query.thenSort ? [query.thenSort] : []),
    { sort: "code" as const, descending: false },
  ];

  return (a, b) => {
    for (const { sort, descending } of keys) {
      const order = compareBy(sort, a, b);

      if (order !== 0) return descending ? -order : order;
    }

    return 0;
  };
}

function matchesFilters(row: CatalogRow, query: ProblemQuery, extras: CatalogExtras): boolean {
  const search = query.search.trim().toLowerCase();

  if (search) {
    const local = row.code.includes(search) || row.name.toLowerCase().includes(search);

    if (!local && !(query.fullText && extras.searchIds?.has(row.id))) return false;
  }

  if (query.category && row.group?.name !== query.category) return false;

  if (query.types.length > 0 && !row.types.some((type) => query.types.includes(type.name))) return false;

  if (query.author) {
    const author = query.author.toLowerCase();

    if (!row.authors.some((name) => name.toLowerCase() === author)) return false;
  }

  if (query.hasEditorial && !row.hasPublicEditorial) return false;
  const status = query.hideSolved ? "unsolved" : query.status;

  if (extras.authenticated && status !== "all") {
    if (status === "solved" && row.state !== "solved") return false;

    if (status === "attempted" && (row.state === "solved" || row.state === "none")) return false;

    if (status === "unsolved" && row.state === "solved") return false;
  }

  if (query.solvedBy.length > 0) {
    if (!extras.solvedByIds?.has(row.id)) return false;

    if (query.notByMe && extras.authenticated && row.state === "solved") return false;
  }

  if (query.contests.length > 0 && !row.contests.some((contest) => query.contests.includes(contest.key))) {
    return false;
  }

  return true;
}

export function viewCatalog(
  catalog: Catalog,
  query: ProblemQuery,
  extras: CatalogExtras,
  pageSize = PAGE_SIZE,
): CatalogView {
  const filtered = catalog.rows.filter((row) => matchesFilters(row, query, extras));

  // The slider is built before the point filter applies, as DMOJ does.
  const values = [...new Set(filtered.map((row) => row.points))].sort((a, b) => a - b);

  const ranged = filtered.filter(
    (row) =>
      (query.pointStart === null || row.points >= query.pointStart) &&
      (query.pointEnd === null || row.points <= query.pointEnd),
  );

  ranged.sort(comparator(query));

  const total = ranged.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // A filter that shrinks the list under a later page lands on its last one.
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * pageSize;

  const items = ranged.slice(start, start + pageSize).map((row) => ({
    ...row,
    contestLabel:
      query.contests.length > 0
        ? (row.contests.find((contest) => query.contests.includes(contest.key))?.label ?? null)
        : null,
  }));

  let groups: CatalogView["groups"] = null;
  const ungrouped: CatalogItem[] = [];

  if (query.groupByContest || query.contests.length > 0) {
    const named = new Map(catalog.contests.map((contest) => [contest.key, contest]));
    const buckets = new Map<string, CatalogItem[]>();

    for (const item of items) {
      if (item.contests.length === 0) ungrouped.push(item);

      for (const contest of item.contests) {
        if (query.contests.length > 0 && !query.contests.includes(contest.key)) continue;
        const bucket = buckets.get(contest.key) ?? [];
        bucket.push({ ...item, contestLabel: contest.label });
        buckets.set(contest.key, bucket);
      }
    }

    groups = [...buckets].flatMap(([key, bucketItems]) => {
      const contest = named.get(key);

      return contest
        ? [{ contestKey: key, contestName: contest.name, startTime: contest.startTime, items: bucketItems }]
        : [];
    });
    groups.sort((a, b) => b.startTime - a.startTime);
  }

  return {
    items,
    groups,
    ungrouped,
    total,
    page,
    totalPages,
    pointValues: { min: values[0] ?? 0, max: values[values.length - 1] ?? 0, values },
  };
}
