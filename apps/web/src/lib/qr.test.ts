import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encodeQr, qrPath } from "./qr";

/** Captured from the `qrcode` reference encoder at level M in single-segment
 *  byte mode; every module matched. */
const HELLO = [
  "#######..##...#######",
  "#.....#.##....#.....#",
  "#.###.#..#.##.#.###.#",
  "#.###.#...##..#.###.#",
  "#.###.#.##..#.#.###.#",
  "#.....#.....#.#.....#",
  "#######.#.#.#.#######",
  "..........###........",
  "#.#.#.#..#.#....#..#.",
  "..#.##....#...#....##",
  ".#.#..#.###.#...#####",
  "##..#.........#....#.",
  ".##.#.##..#.#.#.#....",
  "........####.#.#..###",
  "#######...##.###..###",
  "#.....#...####.##....",
  "#.###.#.#.##.###...##",
  "#.###.#..#....##..##.",
  "#.###.#.###.#...#.#.#",
  "#.....#..#....#.#..#.",
  "#######.###.#.##...##",
].join("\n");

const OTPAUTH = "otpauth://totp/MOJ:admin@example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=MOJ";

function render(text: string): string {
  const { modules } = encodeQr(text);
  return modules.map((row) => row.map((module) => (module ? "#" : ".")).join("")).join("\n");
}

describe("encodeQr", () => {
  it("matches the reference encoder module for module", () => {
    expect(render("hello")).toBe(HELLO);
  });

  it("picks the smallest version that fits", () => {
    expect(encodeQr("a").size).toBe(21);
    expect(encodeQr("a".repeat(100)).size).toBe(41);
    expect(encodeQr("a".repeat(200)).size).toBe(57);
  });

  it("encodes a provisioning URI as the reference encoder does", () => {
    expect(encodeQr(OTPAUTH).size).toBe(41);
    expect(createHash("sha256").update(render(OTPAUTH)).digest("hex")).toBe(
      "b38c8119022e9d2ba77ef84d1da91c6ea099119724b586247452ed0828b3430f",
    );
  });

  it("encodes multi-byte characters as UTF-8", () => {
    expect(() => encodeQr("漢字 é ✓")).not.toThrow();
  });

  it("refuses text it cannot hold", () => {
    expect(() => encodeQr("a".repeat(5000))).toThrow(/too long/);
  });

  it("draws one square per dark module", () => {
    const matrix = encodeQr("hello");
    const dark = matrix.modules.flat().filter(Boolean).length;
    expect(qrPath(matrix).split("M").length - 1).toBe(dark);
  });
});
