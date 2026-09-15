import { pbkdf2Sync, timingSafeEqual } from "node:crypto";

/** Django's default password format, as used by DMOJ:
 *
 *     pbkdf2_sha256$<iterations>$<salt>$<base64 of the 32 byte derived key>
 *
 * The salt is the literal string from the hash, not decoded. Django uses a
 * derived key length equal to the digest size, so 32 bytes for sha256.
 *
 * Hashes that start with "!" are Django's "unusable password" marker (set by
 * `set_unusable_password()`); nothing can ever match them. */

const DJANGO_PREFIX = "pbkdf2_sha256$";

const DERIVED_KEY_LENGTH = 32;

const MAX_ITERATIONS = 5_000_000;

export type DjangoHash = {
  algorithm: "pbkdf2_sha256";
  iterations: number;
  salt: string;
  hash: string;
};

export function isUnusablePassword(encoded: string): boolean {
  return encoded.startsWith("!");
}

export function isDjangoHash(encoded: string): boolean {
  return encoded.startsWith(DJANGO_PREFIX);
}

export function parseDjangoHash(encoded: string): DjangoHash | null {
  if (!isDjangoHash(encoded)) return null;
  const parts = encoded.split("$");

  if (parts.length !== 4) return null;
  const [, rawIterations, salt, hash] = parts;

  if (!rawIterations || !salt || !hash) return null;

  if (!/^\d+$/.test(rawIterations)) return null;
  const iterations = Number.parseInt(rawIterations, 10);

  if (!Number.isSafeInteger(iterations) || iterations <= 0 || iterations > MAX_ITERATIONS) return null;

  return { algorithm: "pbkdf2_sha256", iterations, salt, hash };
}

export function makeDjangoHash(password: string, salt: string, iterations: number): string {
  const derived = pbkdf2Sync(password, salt, iterations, DERIVED_KEY_LENGTH, "sha256");

  return `${DJANGO_PREFIX}${iterations}$${salt}$${derived.toString("base64")}`;
}

/** Constant-time verification of a Django password against its encoded hash. */
export function verifyDjangoPassword(password: string, encoded: string): boolean {
  if (isUnusablePassword(encoded)) return false;
  const parsed = parseDjangoHash(encoded);

  if (!parsed) return false;

  let expected: Buffer;

  try {
    expected = Buffer.from(parsed.hash, "base64");
  } catch {
    return false;
  }

  if (expected.length !== DERIVED_KEY_LENGTH) return false;

  const derived = pbkdf2Sync(password, parsed.salt, parsed.iterations, DERIVED_KEY_LENGTH, "sha256");

  return timingSafeEqual(derived, expected);
}
