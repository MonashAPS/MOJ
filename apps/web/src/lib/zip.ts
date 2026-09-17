/**
 * A zip of small text files, written by hand.
 *
 * The only archive this site hands out is a problem's sample data — a few
 * kilobytes of digits — and pulling in a compressor to squeeze that would save
 * nothing worth the dependency. Entries go in stored, which is a format every
 * unzip tool has read since 1989, and the file names are ASCII by construction.
 */

export type ZipEntry = { name: string; text: string };

const LOCAL_HEADER = 0x04034b50;

const CENTRAL_HEADER = 0x02014b50;

const END_OF_CENTRAL = 0x06054b50;

/** DOS 2.0, which is what "stored, no directory entries" needs. */
const VERSION = 20;

/** Bit 11: the names and contents below are UTF-8. */
const UTF8_FLAG = 0x0800;

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);

  return (crc ^ 0xffffffff) >>> 0;
}

/** The two packed 16-bit fields MS-DOS dated a file with, which zip still uses. */
function dosStamp(at: Date) {
  const year = Math.max(at.getFullYear(), 1980);

  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

/**
 * The entries as one zip archive.
 *
 * `modified` is the timestamp every entry carries; it is an argument so that a
 * test can read the bytes back without the clock in them.
 */
export function zipStored(
  entries: readonly ZipEntry[],
  modified: Date = new Date(),
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const stamp = dosStamp(modified);

  const files = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    const body = encoder.encode(entry.text);

    return { name, body, crc: crc32(body) };
  });

  const localSize = files.reduce((total, file) => total + 30 + file.name.length + file.body.length, 0);
  const centralSize = files.reduce((total, file) => total + 46 + file.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let at = 0;

  const offsets: number[] = [];

  for (const file of files) {
    offsets.push(at);
    view.setUint32(at, LOCAL_HEADER, true);
    view.setUint16(at + 4, VERSION, true);
    view.setUint16(at + 6, UTF8_FLAG, true);
    // 0: stored.
    view.setUint16(at + 8, 0, true);
    view.setUint16(at + 10, stamp.time, true);
    view.setUint16(at + 12, stamp.date, true);
    view.setUint32(at + 14, file.crc, true);
    view.setUint32(at + 18, file.body.length, true);
    view.setUint32(at + 22, file.body.length, true);
    view.setUint16(at + 26, file.name.length, true);
    view.setUint16(at + 28, 0, true);
    out.set(file.name, at + 30);
    out.set(file.body, at + 30 + file.name.length);
    at += 30 + file.name.length + file.body.length;
  }

  const centralAt = at;

  for (const [index, file] of files.entries()) {
    view.setUint32(at, CENTRAL_HEADER, true);
    view.setUint16(at + 4, VERSION, true);
    view.setUint16(at + 6, VERSION, true);
    view.setUint16(at + 8, UTF8_FLAG, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, stamp.time, true);
    view.setUint16(at + 14, stamp.date, true);
    view.setUint32(at + 16, file.crc, true);
    view.setUint32(at + 20, file.body.length, true);
    view.setUint32(at + 24, file.body.length, true);
    view.setUint16(at + 28, file.name.length, true);
    view.setUint16(at + 30, 0, true);
    view.setUint16(at + 32, 0, true);
    view.setUint16(at + 34, 0, true);
    view.setUint16(at + 36, 0, true);
    // 0o644, in the high half where Unix permissions live.
    view.setUint32(at + 38, 0o644 << 16, true);
    view.setUint32(at + 42, offsets[index] ?? 0, true);
    out.set(file.name, at + 46);
    at += 46 + file.name.length;
  }

  view.setUint32(at, END_OF_CENTRAL, true);
  view.setUint16(at + 4, 0, true);
  view.setUint16(at + 6, 0, true);
  view.setUint16(at + 8, files.length, true);
  view.setUint16(at + 10, files.length, true);
  view.setUint32(at + 12, centralSize, true);
  view.setUint32(at + 16, centralAt, true);
  view.setUint16(at + 20, 0, true);

  return out;
}
