/**
 * `Blob` and Web Crypto take a view over a plain `ArrayBuffer`, while
 * `Uint8Array` types its buffer as `ArrayBufferLike` so that a view over a
 * `SharedArrayBuffer` has the same type. Everything here allocates the plain
 * one, so this is where the two meet.
 */
export function plainBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  // SAFETY: the producers are fflate's `zipSync`, `TextEncoder` and fetched bodies,
  // which all allocate a plain ArrayBuffer; no SharedArrayBuffer exists here.
  return bytes as Uint8Array<ArrayBuffer>;
}
