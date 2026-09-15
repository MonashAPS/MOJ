/**
 * The sha256 helpers the judge keys, the API keys and the test-data archives
 * are compared by. Lowercase hex on both sides of every comparison.
 */

/** sha256 of a string, the form `judges.authKeyHash` and `apiKeys.keyHash` hold. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** sha256 of raw bytes, the form `problemTestData.hash` holds. */
export async function sha256OfBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
