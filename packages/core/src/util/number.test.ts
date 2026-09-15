/**
 * The Python and Django numeric behaviour DMOJ depends on.
 *
 * The expectations were produced by running CPython's `round` and Django's
 * `floatformat` (`Decimal(repr(x)).quantize(exp, ROUND_HALF_UP)`) on the same
 * inputs.
 */

import { describe, expect, it } from "vitest";
import { floatformat, niceRepr, pyRound, roundHalfUp } from "./number";

describe("pyRound", () => {
  it("rounds halves to even, like CPython", () => {
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(3.5)).toBe(4);
    expect(pyRound(-2.5)).toBe(-2);
    expect(pyRound(0.5)).toBe(0);
    expect(pyRound(1.5)).toBe(2);
  });

  it("rounds the exact binary value, not its decimal shorthand", () => {
    // 2.675 is really 2.67499999999999982..., so it rounds down.
    expect(pyRound(2.675, 2)).toBe(2.67);
    expect(pyRound(1.005, 2)).toBe(1.0);
    expect(pyRound(2.345, 2)).toBe(2.35);
    expect(pyRound(-0.15, 1)).toBe(-0.1);
  });

  it("rounds to a number of digits", () => {
    expect(pyRound(0.1 + 0.2, 3)).toBe(0.3);
    expect(pyRound(33.333333, 3)).toBe(33.333);
    expect(pyRound(100 / 3, 1)).toBe(33.3);
    expect(pyRound(1e-7, 3)).toBe(0);
    expect(pyRound(123456.789, 1)).toBe(123456.8);
    expect(pyRound(2.3333333333, 3)).toBe(2.333);
    expect(pyRound(7, 3)).toBe(7);
    expect(pyRound(0, 3)).toBe(0);
  });

  it("handles negative digits and non-finite values", () => {
    expect(pyRound(1234, -2)).toBe(1200);
    expect(pyRound(1250, -2)).toBe(1200);
    expect(pyRound(1350, -2)).toBe(1400);
    expect(pyRound(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(pyRound(Number.NaN))).toBe(true);
    expect(() => pyRound(1.5, 0.5)).toThrow(RangeError);
  });

  it("survives very small and very large magnitudes", () => {
    expect(pyRound(5e-324, 3)).toBe(0);
    expect(pyRound(1.7976931348623157e308, 0)).toBe(1.7976931348623157e308);
  });
});

describe("floatformat", () => {
  const cases: [number, number, string][] = [
    [1.0, -1, "1"],
    [1.5, -1, "1.5"],
    [1.0, 2, "1.00"],
    [1.25, -1, "1.3"],
    [1.24, -1, "1.2"],
    [2.675, -2, "2.68"],
    [2.675, 2, "2.68"],
    [0.0, -3, "0"],
    [100.0, -3, "100"],
    [33.333333, -3, "33.333"],
    [-1.25, -1, "-1.3"],
    [1.005, -2, "1.01"],
    [12345.678, -1, "12345.7"],
    [0.5, 0, "1"],
    [1.5, 0, "2"],
  ];

  it("matches Django", () => {
    for (const [value, arg, expected] of cases) {
      expect(floatformat(value, arg), `floatformat(${value}, ${arg})`).toBe(expected);
    }
  });

  it("defaults to one optional decimal", () => {
    expect(floatformat(3)).toBe("3");
    expect(floatformat(3.14)).toBe("3.1");
  });

  it("renders exponential values as plain decimals", () => {
    // Django would hand these to `number_format`, which keeps Decimal's
    // scientific notation; scores never reach these magnitudes, and a plain
    // decimal is the more useful rendering here.
    expect(floatformat(1e-7, -8)).toBe("0.00000010");
    expect(floatformat(1e21, -1)).toBe("1000000000000000000000");
  });

  it("rounds half away from zero", () => {
    expect(roundHalfUp(2.5, 0)).toBe("3");
    expect(roundHalfUp(-2.5, 0)).toBe("-3");
    expect(roundHalfUp(1.05, 1)).toBe("1.1");
    expect(roundHalfUp(9.99, 1)).toBe("10.0");
    expect(roundHalfUp(9.99, 0)).toBe("10");
  });
});

describe("niceRepr", () => {
  it("renders HH:MM:SS with days folded into the hours", () => {
    expect(niceRepr(0)).toBe("00:00:00");
    expect(niceRepr(59)).toBe("00:00:59");
    expect(niceRepr(60)).toBe("00:01:00");
    expect(niceRepr(3600)).toBe("01:00:00");
    expect(niceRepr(86400)).toBe("24:00:00");
    expect(niceRepr(90061)).toBe("25:01:01");
    expect(niceRepr(59.9)).toBe("00:00:59");
  });
});
