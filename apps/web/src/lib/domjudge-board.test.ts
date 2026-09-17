import { describe, expect, it } from "vitest";
import { type BoardCell, type BoardRow, boardStandings, minutesOf, triesOf } from "./domjudge-board";

function solved(timeText: string, penalty = 0): BoardCell {
  return { state: "full-score", points: 1, pointsText: "1", timeText, penalty };
}

function failed(penalty: number): BoardCell {
  return { state: "failed-score", points: 0, pointsText: "0", timeText: "00:00:00", penalty };
}

function row(participationId: string, problems: (BoardCell | null)[], isDisqualified = false): BoardRow {
  return { participationId, isDisqualified, problems };
}

describe("minutesOf", () => {
  it("reads the HH:MM:SS the format writes", () => {
    expect(minutesOf("00:45:00")).toBe(45);
    expect(minutesOf("01:03:59")).toBe(63);
    expect(minutesOf("00:00:30")).toBe(0);
  });

  it("refuses anything that is not that", () => {
    expect(minutesOf("")).toBeNull();
    expect(minutesOf("45")).toBeNull();
    expect(minutesOf("00:99:00")).toBeNull();
  });
});

describe("triesOf", () => {
  it("counts the solve itself, on top of what it was penalised for", () => {
    expect(triesOf(solved("00:20:00", 2))).toBe(3);
    expect(triesOf(solved("00:20:00", 0))).toBe(1);
  });

  it("counts every attempt where there was no solve", () => {
    expect(triesOf(failed(4))).toBe(4);
  });

  it("says nothing where the format does not count rejections", () => {
    expect(triesOf({ state: "full-score", points: 100, pointsText: "100", timeText: "00:10:00" })).toBeNull();
  });
});

describe("boardStandings", () => {
  it("counts who solved and who tried, per problem", () => {
    const standings = boardStandings(
      [
        row("a", [solved("00:10:00"), failed(2)]),
        row("b", [solved("00:30:00", 1), null]),
        row("c", [null, null]),
      ],
      2,
    );

    expect(standings[0]).toEqual({ solved: 2, tried: 2, firstParticipationId: "a" });
    expect(standings[1]).toEqual({ solved: 0, tried: 1, firstParticipationId: null });
  });

  it("gives first blood to the earliest solve, not the best rank", () => {
    // The rows arrive in rank order, and the row above solved it later.
    const standings = boardStandings([row("a", [solved("01:00:00")]), row("b", [solved("00:20:00")])], 1);

    expect(standings[0]?.firstParticipationId).toBe("b");
  });

  it("leaves a disqualified row out of all three", () => {
    const standings = boardStandings(
      [row("cheat", [solved("00:05:00")], true), row("b", [solved("00:40:00")])],
      1,
    );

    expect(standings[0]).toEqual({ solved: 1, tried: 1, firstParticipationId: "b" });
  });

  it("holds a column that nobody has touched at zero", () => {
    expect(boardStandings([row("a", [null])], 1)[0]).toEqual({
      solved: 0,
      tried: 0,
      firstParticipationId: null,
    });
  });
});
