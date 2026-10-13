import { describe, expect, it } from "vitest";
import {
  diminishingSum,
  entrantOrganization,
  formatDataScore,
  isValidDecay,
  organizationStandings,
  problemScores,
  type StandingsEntrant,
} from "./organizationStandings";

/** Two contests of two problems each, as the event lists them. */
const PROBLEMS = ["first-a", "first-b", "second-a", "second-b"];

function entrant(
  id: string,
  organizationId: string | null,
  scores: Record<string, number>,
): StandingsEntrant {
  return { id, organizationId, scores };
}

describe("the diminishing sum", () => {
  it("weighs each further score by one more power of the decay, best first", () => {
    expect(diminishingSum([40, 100, 70], 0.5)).toBe(100 + 70 * 0.5 + 40 * 0.25);
  });

  it("adds everything up at decay 1 and keeps only the best at decay 0", () => {
    expect(diminishingSum([40, 100, 70], 1)).toBe(210);
    expect(diminishingSum([40, 100, 70], 0)).toBe(100);
  });

  it("ignores scores that are not above zero, so they take no place in the order", () => {
    expect(diminishingSum([0, 50, -3, 50], 0.5)).toBe(75);
    expect(diminishingSum([], 0.5)).toBe(0);
    expect(diminishingSum([0, 0], 0)).toBe(0);
  });
});

describe("an entrant's organisation", () => {
  const memberships = [
    { organizationId: "rmit", order: 2 },
    { organizationId: "monash", order: 1 },
    { organizationId: "maps", order: 0 },
  ];

  it("is the first membership by order among the event's organisations", () => {
    expect(entrantOrganization(memberships, ["rmit", "monash"])).toBe("monash");
    expect(entrantOrganization(memberships, ["rmit"])).toBe("rmit");
  });

  it("is the first membership of all when the event lists none", () => {
    expect(entrantOrganization(memberships, [])).toBe("maps");
  });

  it("is nothing for an entrant in none of them", () => {
    expect(entrantOrganization(memberships, ["deakin"])).toBeNull();
    expect(entrantOrganization([], [])).toBeNull();
  });
});

describe("a participation's problem scores", () => {
  it("are its points plus any bonus, per contest problem", () => {
    expect(formatDataScore({ time: 0, points: 50 })).toBe(50);
    expect(formatDataScore({ time: 0, points: 50, bonus: 7 })).toBe(57);
    expect(
      problemScores({ "first-a": { time: 10, points: 100, penalty: 1 }, "first-b": { time: 20, points: 0 } }),
    ).toEqual({ "first-a": 100, "first-b": 0 });
    expect(problemScores(null)).toEqual({});
  });
});

describe("the decay", () => {
  it("is valid from 0 to 1 inclusive", () => {
    expect([0, 0.5, 1].every(isValidDecay)).toBe(true);
    expect([-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY].some(isValidDecay)).toBe(false);
  });
});

describe("the organisation standings", () => {
  const entrants = [
    entrant("ada", "monash", { "first-a": 100, "first-b": 40, "second-a": 30 }),
    entrant("bob", "monash", { "first-a": 60, "second-b": 50 }),
    entrant("cid", "monash", { "first-a": 80 }),
    entrant("dot", "rmit", { "first-a": 100, "first-b": 100, "second-a": 100 }),
    entrant("eve", null, { "first-a": 1000 }),
  ];

  it("pools each problem with the decay and sums every problem of every contest", () => {
    const rows = organizationStandings({
      decay: 0.5,
      problemIds: PROBLEMS,
      organizationIds: ["monash", "rmit"],
      entrants,
    });

    const monash = rows.find((row) => row.organizationId === "monash");
    const rmit = rows.find((row) => row.organizationId === "rmit");

    // 100 + 80/2 + 60/4 on the first problem, then one score each elsewhere.
    expect(monash?.problems).toEqual([155, 40, 30, 50]);
    expect(monash?.total).toBe(275);
    expect(rmit?.problems).toEqual([100, 100, 100, 0]);
    expect(rmit?.total).toBe(300);
  });

  it("ranks by total, highest first", () => {
    const rows = organizationStandings({
      decay: 0.5,
      problemIds: PROBLEMS,
      organizationIds: ["monash", "rmit"],
      entrants,
    });

    expect(rows.map((row) => [row.organizationId, row.rank])).toEqual([
      ["rmit", 1],
      ["monash", 2],
    ]);
  });

  it("adds everyone in full at decay 1 and keeps only the best at decay 0", () => {
    const full = organizationStandings({
      decay: 1,
      problemIds: PROBLEMS,
      organizationIds: ["monash", "rmit"],
      entrants,
    });

    expect(full.find((row) => row.organizationId === "monash")?.total).toBe(360);
    expect(full[0]?.organizationId).toBe("monash");

    const best = organizationStandings({
      decay: 0,
      problemIds: PROBLEMS,
      organizationIds: ["monash", "rmit"],
      entrants,
    });

    expect(best.find((row) => row.organizationId === "monash")?.problems).toEqual([100, 40, 30, 50]);
  });

  it("leaves out entrants without an organisation, or with one not in the standings", () => {
    const rows = organizationStandings({
      decay: 0.5,
      problemIds: PROBLEMS,
      organizationIds: ["rmit"],
      entrants,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.entrants.map((row) => row.id)).toEqual(["dot"]);
    expect(rows[0]?.total).toBe(300);
  });

  it("lists the entrants by their own totals, best first", () => {
    const [, monash] = organizationStandings({
      decay: 0.5,
      problemIds: PROBLEMS,
      organizationIds: ["monash", "rmit"],
      entrants,
    });

    expect(monash?.entrants).toEqual([
      { id: "ada", total: 170 },
      { id: "bob", total: 110 },
      { id: "cid", total: 80 },
    ]);
  });

  it("only counts the problems it is given", () => {
    const [row] = organizationStandings({
      decay: 0.5,
      problemIds: ["first-b"],
      organizationIds: ["monash"],
      entrants: [entrant("ada", "monash", { "first-a": 100, "first-b": 40, gone: 999 })],
    });

    expect(row?.total).toBe(40);
    expect(row?.entrants).toEqual([{ id: "ada", total: 40 }]);
  });

  it("shares a rank between equal totals and keeps the listed order between them", () => {
    const rows = organizationStandings({
      decay: 0.5,
      problemIds: PROBLEMS,
      organizationIds: ["deakin", "rmit", "monash", "acu"],
      entrants: [
        entrant("ada", "monash", { "first-a": 50 }),
        entrant("bob", "rmit", { "second-b": 50 }),
        entrant("cid", "deakin", { "first-a": 20 }),
      ],
    });

    expect(rows.map((row) => [row.organizationId, row.rank, row.total])).toEqual([
      ["rmit", 1, 50],
      ["monash", 1, 50],
      ["deakin", 3, 20],
      ["acu", 4, 0],
    ]);
  });

  it("treats totals that differ only by floating-point noise as a tie", () => {
    const rows = organizationStandings({
      decay: 1,
      problemIds: PROBLEMS,
      organizationIds: ["monash", "rmit"],
      entrants: [
        entrant("ada", "monash", { "first-a": 0.1, "first-b": 0.2 }),
        entrant("bob", "rmit", { "first-a": 0.3 }),
      ],
    });

    expect(rows.map((row) => [row.total, row.rank])).toEqual([
      [0.3, 1],
      [0.3, 1],
    ]);
  });

  it("gives an organisation with no entrants a row of zeroes", () => {
    const [row] = organizationStandings({
      decay: 0.5,
      problemIds: PROBLEMS,
      organizationIds: ["acu"],
      entrants: [],
    });

    expect(row).toEqual({ organizationId: "acu", rank: 1, total: 0, problems: [0, 0, 0, 0], entrants: [] });
  });
});
