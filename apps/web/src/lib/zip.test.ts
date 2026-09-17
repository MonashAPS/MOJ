import { describe, expect, it } from "vitest";
import { zipStored } from "./zip";

const MODIFIED = new Date(2026, 0, 2, 3, 4, 6);

function read(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function text(bytes: Uint8Array, at: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(at, at + length));
}

describe("zipStored", () => {
  it("writes a local header, then the file, for each entry", () => {
    const zip = zipStored([{ name: "1.in", text: "1 2\n" }], MODIFIED);
    const view = read(zip);

    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // Stored, not deflated.
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint32(18, true)).toBe(4);
    expect(view.getUint32(22, true)).toBe(4);
    expect(view.getUint16(26, true)).toBe(4);
    expect(text(zip, 30, 4)).toBe("1.in");
    expect(text(zip, 34, 4)).toBe("1 2\n");
  });

  it("checksums the body with CRC-32", () => {
    const zip = zipStored([{ name: "a.txt", text: "hello world" }], MODIFIED);

    // The textbook CRC-32 of "hello world".
    expect(read(zip).getUint32(14, true)).toBe(0x0d4a1185);
  });

  it("closes with a central directory naming every entry", () => {
    const entries = [
      { name: "1.in", text: "1 2\n" },
      { name: "1.ans", text: "3\n" },
      { name: "2.in", text: "4 5\n" },
    ];

    const zip = zipStored(entries, MODIFIED);
    const view = read(zip);
    const end = zip.length - 22;

    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 8, true)).toBe(3);
    expect(view.getUint16(end + 10, true)).toBe(3);

    const centralAt = view.getUint32(end + 16, true);
    const centralSize = view.getUint32(end + 12, true);

    expect(centralAt + centralSize).toBe(end);
    expect(view.getUint32(centralAt, true)).toBe(0x02014b50);
    expect(text(zip, centralAt + 46, 4)).toBe("1.in");

    // Each central entry points back at its own local header.
    const firstOffset = view.getUint32(centralAt + 42, true);

    expect(view.getUint32(firstOffset, true)).toBe(0x04034b50);
  });

  it("dates every entry with the stamp it was given", () => {
    const zip = zipStored([{ name: "1.in", text: "" }], MODIFIED);
    const view = read(zip);

    // 2026-01-02 03:04:06, packed the way MS-DOS did it.
    expect(view.getUint16(10, true)).toBe((3 << 11) | (4 << 5) | 3);
    expect(view.getUint16(12, true)).toBe((46 << 9) | (1 << 5) | 2);
  });

  it("writes an empty archive as an empty archive", () => {
    const zip = zipStored([], MODIFIED);

    expect(zip.length).toBe(22);
    expect(read(zip).getUint32(0, true)).toBe(0x06054b50);
  });
});
