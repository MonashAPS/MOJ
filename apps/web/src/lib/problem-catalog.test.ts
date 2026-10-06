import { describe, expect, it } from "vitest";
import { type Catalog, type CatalogRow, viewCatalog } from "./problem-catalog";
import {
  EMPTY_QUERY,
  type ProblemQuery,
  parseProblemQuery,
  problemQueryString,
  toggleSort,
} from "./problem-query";

function row(code: string, patch: Partial<CatalogRow> = {}): CatalogRow {
  return {
    // SAFETY: the view only compares ids for equality, so any distinct string stands in for one.
    id: `id-${code}` as CatalogRow["id"],
    code,
    name: code.toUpperCase(),
    group: { name: "uncategorized", fullName: "Uncategorized" },
    types: [],
    points: 1,
    partial: false,
    acRate: 50,
    userCount: 10,
    date: 0,
    hasPublicEditorial: false,
    state: "none",
    bestPoints: null,
    authors: [],
    contests: [],
    ...patch,
  };
}

function catalog(rows: CatalogRow[]): Catalog {
  return { viewer: "me", contestLock: null, rows, contests: [{ key: "cup", name: "Cup", startTime: 1 }] };
}

const signedIn = { authenticated: true };

const codes = (rows: { code: string }[]) => rows.map((item) => item.code);

const query = (patch: Partial<ProblemQuery>): ProblemQuery => ({ ...EMPTY_QUERY, ...patch });

describe("viewCatalog sorting", () => {
  // Same AC rate in pairs, and user counts that tie across them.
  const rows = [
    row("a", { acRate: 30, userCount: 5 }),
    row("b", { acRate: 60, userCount: 5 }),
    row("c", { acRate: 30, userCount: 9 }),
    row("d", { acRate: 60, userCount: 9 }),
    row("e", { acRate: 60, userCount: 5 }),
  ];

  it("keeps the previous sort among the rows the new one ties", () => {
    const byAc = toggleSort(EMPTY_QUERY, "acRate");
    const thenUsers = toggleSort(byAc, "userCount");

    expect(codes(viewCatalog(catalog(rows), byAc, signedIn).items)).toEqual(["b", "d", "e", "a", "c"]);
    expect(codes(viewCatalog(catalog(rows), thenUsers, signedIn).items)).toEqual(["d", "c", "b", "e", "a"]);
  });

  it("orders by code whatever order the rows arrive in", () => {
    const byUsers = toggleSort(EMPTY_QUERY, "userCount");
    const reversed = [...rows].reverse();

    expect(codes(viewCatalog(catalog(reversed), byUsers, signedIn).items)).toEqual(
      codes(viewCatalog(catalog(rows), byUsers, signedIn).items),
    );
  });

  it("writes the tie-break into the address and reads it back", () => {
    const thenUsers = toggleSort(toggleSort(EMPTY_QUERY, "acRate"), "userCount");
    const encoded = problemQueryString(thenUsers);

    expect(encoded).toBe("?order=-user_count%2C-ac_rate");
    expect(parseProblemQuery(new URLSearchParams(encoded.slice(1)))).toEqual(thenUsers);
  });

  it("flips a column without forgetting what it ties on", () => {
    const thenUsers = toggleSort(toggleSort(EMPTY_QUERY, "acRate"), "userCount");
    const flipped = toggleSort(thenUsers, "userCount");

    expect(flipped).toMatchObject({ sort: "userCount", descending: false, thenSort: thenUsers.thenSort });
  });
});

describe("viewCatalog filters", () => {
  const rows = [
    row("aplusb", { name: "A Plus B", points: 3, state: "solved", authors: ["Setter"] }),
    row("graphs", {
      name: "Shortest Paths",
      points: 10,
      state: "attempted",
      // SAFETY: type ids are only used as React keys; the filter matches on the name.
      types: [{ id: "t1" as CatalogRow["types"][number]["id"], name: "graphs", fullName: "Graphs" }],
      hasPublicEditorial: true,
      contests: [{ key: "cup", label: "B" }],
    }),
    row("olympiad", { name: "Olympiad", points: 25, group: { name: "olympiad", fullName: "Olympiad" } }),
  ];

  const view = (patch: Partial<ProblemQuery>, extras: Partial<Parameters<typeof viewCatalog>[2]> = {}) =>
    codes(viewCatalog(catalog(rows), query(patch), { ...signedIn, ...extras }).items);

  it("matches the code or the name, adding statement matches only for a full-text search", () => {
    expect(view({ search: "plus" })).toEqual(["aplusb"]);
    expect(view({ search: "GRAPH" })).toEqual(["graphs"]);
    expect(view({ search: "pendulum" }, { searchIds: new Set(["id-olympiad"]) })).toEqual([]);
    expect(view({ search: "pendulum", fullText: true }, { searchIds: new Set(["id-olympiad"]) })).toEqual([
      "olympiad",
    ]);
  });

  it("filters by status, and ignores status for a signed-out viewer", () => {
    expect(view({ status: "solved" })).toEqual(["aplusb"]);
    expect(view({ status: "attempted" })).toEqual(["graphs"]);
    expect(view({ hideSolved: true })).toEqual(["graphs", "olympiad"]);
    expect(view({ status: "solved" }, { authenticated: false })).toEqual(["aplusb", "graphs", "olympiad"]);
  });

  it("filters by category, type, author, editorial and contest", () => {
    expect(view({ category: "olympiad" })).toEqual(["olympiad"]);
    expect(view({ types: ["graphs"] })).toEqual(["graphs"]);
    expect(view({ author: "setter" })).toEqual(["aplusb"]);
    expect(view({ hasEditorial: true })).toEqual(["graphs"]);
    expect(view({ contests: ["cup"] })).toEqual(["graphs"]);
  });

  it("keeps what the solved-by users solved, less the viewer's own when asked", () => {
    const solvedByIds = new Set(["id-aplusb", "id-graphs"]);

    expect(view({ solvedBy: ["them"] }, { solvedByIds })).toEqual(["aplusb", "graphs"]);
    expect(view({ solvedBy: ["them"], notByMe: true }, { solvedByIds })).toEqual(["graphs"]);
  });

  it("builds the point slider before the point range applies", () => {
    const result = viewCatalog(catalog(rows), query({ pointStart: 5, pointEnd: 20 }), signedIn);

    expect(codes(result.items)).toEqual(["graphs"]);
    expect(result.pointValues).toEqual({ min: 3, max: 25, values: [3, 10, 25] });
  });
});

describe("viewCatalog pages and groups", () => {
  const rows = ["a", "b", "c"].map((code) => row(code));

  it("pages, and lands on the last page when a filter leaves fewer", () => {
    const second = viewCatalog(catalog(rows), query({ page: 2 }), signedIn, 2);

    expect(codes(second.items)).toEqual(["c"]);
    expect(second.totalPages).toBe(2);
    expect(viewCatalog(catalog(rows), query({ page: 9 }), signedIn, 2).page).toBe(2);
  });

  it("groups by contest with each problem's label, and keeps the problems in none", () => {
    const grouped = viewCatalog(
      catalog([row("a", { contests: [{ key: "cup", label: "A" }] }), row("b")]),
      query({ groupByContest: true }),
      signedIn,
    );

    expect(
      grouped.groups?.map((group) => [group.contestName, group.items.map((item) => item.contestLabel)]),
    ).toEqual([["Cup", ["A"]]]);
    expect(codes(grouped.ungrouped)).toEqual(["b"]);
  });
});
