/** A byte-mode QR encoder at error-correction level M, enough for the otpauth
 *  URIs the two-factor enrolment page renders. Versions 1 to 15 hold 413 bytes,
 *  several times more than a provisioning URI ever needs.
 *
 *  It exists so the enrolment page can draw the code in the browser without
 *  shipping the secret to an image service or pulling in a renderer. */

export type QrMatrix = { size: number; modules: boolean[][] };

/** [error-correction codewords per block, group 1 blocks, group 1 data codewords,
 *   group 2 blocks, group 2 data codewords] for versions 1 to 15 at level M. */
const BLOCKS_M: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
  [30, 1, 50, 4, 51],
  [22, 6, 36, 2, 37],
  [22, 8, 37, 1, 38],
  [24, 4, 40, 5, 41],
  [24, 5, 41, 5, 42],
];

const ALIGNMENT: ReadonlyArray<readonly number[]> = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
];

function blocksFor(version: number): readonly [number, number, number, number, number] {
  const row = BLOCKS_M[version - 1];

  if (!row) throw new Error(`No level-M block layout for QR version ${version}.`);

  return row;
}

const EXP = new Uint8Array(512);

const LOG = new Uint8Array(256);

{
  let value = 1;

  for (let i = 0; i < 255; i++) {
    EXP[i] = value;
    LOG[value] = i;
    value <<= 1;

    if (value & 0x100) value ^= 0x11d;
  }

  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] as number;
}

function multiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;

  return EXP[(LOG[a] as number) + (LOG[b] as number)] as number;
}

function generatorPolynomial(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);

  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);

    for (let j = 0; j < poly.length; j++) {
      const coefficient = poly[j] as number;
      next[j] = (next[j] as number) ^ coefficient;
      next[j + 1] = (next[j + 1] as number) ^ multiply(coefficient, EXP[i] as number);
    }

    poly = next;
  }

  return poly;
}

function remainder(data: Uint8Array, degree: number): Uint8Array {
  const generator = generatorPolynomial(degree);
  const result = new Uint8Array(degree);

  for (const byte of data) {
    const factor = byte ^ (result[0] as number);
    result.copyWithin(0, 1);
    result[degree - 1] = 0;

    if (factor !== 0) {
      for (let i = 0; i < degree; i++) {
        result[i] = (result[i] as number) ^ multiply(generator[i + 1] as number, factor);
      }
    }
  }

  return result;
}

/** BCH(15,5) for the format string and BCH(18,6) for the version string. */
function formatBits(mask: number): number {
  // 00 is level M. The XOR mask stops an all-zero format string.
  const data = (0b00 << 3) | mask;
  let remainder = data;

  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >> 9) * 0x537);

  return (((data << 10) | (remainder & 0x3ff)) ^ 0x5412) & 0x7fff;
}

function versionBits(version: number): number {
  let remainder = version;

  for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >> 11) * 0x1f25);

  return ((version << 12) | (remainder & 0xfff)) & 0x3ffff;
}

function capacityBytes(version: number): number {
  const [, g1, d1, g2, d2] = blocksFor(version);
  const dataCodewords = g1 * d1 + g2 * d2;
  const countBits = version < 10 ? 8 : 16;

  return Math.floor((dataCodewords * 8 - 4 - countBits) / 8);
}

function encodeData(bytes: Uint8Array, version: number): Uint8Array {
  const [ec, g1, d1, g2, d2] = blocksFor(version);
  const dataCodewords = g1 * d1 + g2 * d2;
  const countBits = version < 10 ? 8 : 16;

  const stream: number[] = [];
  let buffer = 0;
  let bufferBits = 0;

  const push = (value: number, bits: number) => {
    for (let i = bits - 1; i >= 0; i--) {
      buffer = (buffer << 1) | ((value >> i) & 1);
      bufferBits += 1;

      if (bufferBits === 8) {
        stream.push(buffer);
        buffer = 0;
        bufferBits = 0;
      }
    }
  };

  push(0b0100, 4);
  push(bytes.length, countBits);

  for (const byte of bytes) push(byte, 8);
  // Terminator, then the byte boundary, then the alternating pad.
  push(0, Math.min(4, dataCodewords * 8 - (stream.length * 8 + bufferBits)));

  if (bufferBits > 0) push(0, 8 - bufferBits);

  for (let i = 0; stream.length < dataCodewords; i++) stream.push(i % 2 === 0 ? 0xec : 0x11);

  const blocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let block = 0; block < g1 + g2; block++) {
    const size = block < g1 ? d1 : d2;
    const slice = new Uint8Array(stream.slice(offset, offset + size));
    offset += size;
    blocks.push(slice);
    eccBlocks.push(remainder(slice, ec));
  }

  const interleaved: number[] = [];
  const longest = Math.max(d1, d2);

  for (let i = 0; i < longest; i++) {
    for (const block of blocks) if (i < block.length) interleaved.push(block[i] as number);
  }

  for (let i = 0; i < ec; i++) {
    for (const block of eccBlocks) interleaved.push(block[i] as number);
  }

  return new Uint8Array(interleaved);
}

type Grid = { modules: Int8Array; reserved: Uint8Array; size: number };

function reserve(grid: Grid, x: number, y: number, value: number) {
  grid.modules[y * grid.size + x] = value;
  grid.reserved[y * grid.size + x] = 1;
}

function drawFunctionPatterns(grid: Grid, version: number) {
  const { size } = grid;

  const finders: Array<[number, number]> = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ];

  for (const [ox, oy] of finders) {
    // The finder itself, then the one-module separator around it.
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const px = ox + x;
        const py = oy + y;

        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const inRing = x >= 0 && x <= 6 && y >= 0 && y <= 6;

        const dark =
          inRing && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));

        reserve(grid, px, py, dark ? 1 : 0);
      }
    }
  }

  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0 ? 1 : 0;
    reserve(grid, i, 6, dark);
    reserve(grid, 6, i, dark);
  }

  const centres = ALIGNMENT[version - 1] ?? [];

  for (const cy of centres) {
    for (const cx of centres) {
      // Alignment patterns never overlap a finder.
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;

      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          const ring = Math.max(Math.abs(x), Math.abs(y));
          reserve(grid, cx + x, cy + y, ring === 1 ? 0 : 1);
        }
      }
    }
  }

  // Format information areas, filled in once the mask is chosen.
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserve(grid, i, 8, 0);
      reserve(grid, 8, i, 0);
    }
  }

  for (let i = 0; i < 8; i++) {
    reserve(grid, size - 1 - i, 8, 0);
    reserve(grid, 8, size - 1 - i, 0);
  }

  reserve(grid, 8, size - 8, 1); // the always-dark module

  if (version >= 7) {
    const bits = versionBits(version);

    for (let i = 0; i < 18; i++) {
      const bit = (bits >> i) & 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      reserve(grid, a, b, bit);
      reserve(grid, b, a, bit);
    }
  }
}

function drawCodewords(grid: Grid, codewords: Uint8Array) {
  const { size } = grid;
  let bit = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern and is not part of the zigzag.
    const column = right <= 6 ? right - 1 : right;

    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;

      for (const x of [column, column - 1]) {
        if (grid.reserved[y * size + x]) continue;
        const byte = codewords[bit >> 3];
        grid.modules[y * size + x] = byte === undefined ? 0 : (byte >> (7 - (bit & 7))) & 1;
        bit += 1;
      }
    }

    upward = !upward;
  }
}

function maskCondition(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(grid: Grid, mask: number) {
  const { size } = grid;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid.reserved[y * size + x]) continue;

      if (maskCondition(mask, x, y)) grid.modules[y * size + x] = (grid.modules[y * size + x] as number) ^ 1;
    }
  }
}

function drawFormat(grid: Grid, mask: number) {
  const { size } = grid;
  const bits = formatBits(mask);

  const set = (x: number, y: number, bit: number) => {
    grid.modules[y * size + x] = bit;
  };

  for (let i = 0; i < 15; i++) {
    const bit = (bits >> i) & 1;

    // Copy one hugs the top-left finder: down its right edge, then along its foot.
    if (i < 6) set(8, i, bit);
    else if (i === 6) set(8, 7, bit);
    else if (i === 7) set(8, 8, bit);
    else if (i === 8) set(7, 8, bit);
    else set(14 - i, 8, bit);

    // Copy two runs along the top-right and down the bottom-left.
    if (i < 8) set(size - 1 - i, 8, bit);
    else set(8, size - 15 + i, bit);
  }

  set(8, size - 8, 1);
}

function penalty(grid: Grid): number {
  const { size, modules } = grid;
  const at = (x: number, y: number) => modules[y * size + x] as number;
  let score = 0;

  // Rule 1: runs of five or more.
  for (let i = 0; i < size; i++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      let previous = horizontal ? at(0, i) : at(i, 0);

      for (let j = 1; j < size; j++) {
        const current = horizontal ? at(j, i) : at(i, j);

        if (current === previous) {
          run += 1;

          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          previous = current;
          run = 1;
        }
      }
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const value = at(x, y);

      if (value === at(x + 1, y) && value === at(x, y + 1) && value === at(x + 1, y + 1)) score += 3;
    }
  }

  // Rule 3: the finder-like 1:1:3:1:1 run with four light modules beside it.
  const patterns = [
    [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1],
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (const pattern of patterns) {
        if (x + pattern.length <= size && pattern.every((bit, i) => at(x + i, y) === bit)) score += 40;

        if (y + pattern.length <= size && pattern.every((bit, i) => at(x, y + i) === bit)) score += 40;
      }
    }
  }

  // Rule 4: deviation from an even split of dark and light.
  let dark = 0;

  for (let i = 0; i < size * size; i++) dark += modules[i] as number;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/** Encodes `text` and returns the finished module grid, `true` meaning dark. */
export function encodeQr(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const version = BLOCKS_M.findIndex((_, index) => capacityBytes(index + 1) >= bytes.length) + 1;

  if (version === 0) throw new Error("The text is too long for a QR code at this error-correction level.");

  const codewords = encodeData(bytes, version);
  const size = version * 4 + 17;

  let best: { grid: Grid; score: number } | null = null;

  for (let mask = 0; mask < 8; mask++) {
    const grid: Grid = {
      modules: new Int8Array(size * size),
      reserved: new Uint8Array(size * size),
      size,
    };

    drawFunctionPatterns(grid, version);
    drawCodewords(grid, codewords);
    applyMask(grid, mask);
    drawFormat(grid, mask);
    const score = penalty(grid);

    if (!best || score < best.score) best = { grid, score };
  }

  const grid = (best as { grid: Grid }).grid;
  const modules: boolean[][] = [];

  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];

    for (let x = 0; x < size; x++) row.push(grid.modules[y * size + x] === 1);
    modules.push(row);
  }

  return { size, modules };
}

/** The matrix as one SVG path, which draws in a single fill and scales cleanly. */
export function qrPath({ size, modules }: QrMatrix): string {
  const parts: string[] = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y]?.[x]) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }

  return parts.join("");
}
