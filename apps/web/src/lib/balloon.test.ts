import { describe, expect, it } from "vitest";
import { balloonFor } from "./balloon";

describe("balloonFor", () => {
  it("gives a problem the same balloon every time", () => {
    expect(balloonFor("aplusb")).toEqual(balloonFor("aplusb"));
  });

  it("spreads the problems of a contest around the wheel", () => {
    const hues = new Set(
      ["sushi1", "moneymismanagement", "honourablejob", "teaparty", "primecut", "5bigbooms"].map(
        (code) => balloonFor(code).hue,
      ),
    );

    // Not a proof of no collisions, which no hash can give: a check that a real
    // contest's codes do not all land on one colour.
    expect(hues.size).toBeGreaterThan(4);
  });

  it("stays on the 15 degree stops, so two balloons are never a shade apart", () => {
    for (const code of ["a", "b", "c", "problem-1", "zzz"]) {
      expect(balloonFor(code).hue % 15).toBe(0);
    }
  });

  it("names a fill and a darker line for it", () => {
    const balloon = balloonFor("aplusb");

    expect(balloon.fill).toMatch(/^hsl\(\d+ 70% 72%\)$/);
    expect(balloon.line).toMatch(/^hsl\(\d+ 55% 42%\)$/);
  });
});
