import { createCipheriv, createDecipheriv, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * django-fernet-fields derives the Fernet key from Django's SECRET_KEY with
 * HKDF-SHA256, a fixed salt and a fixed info string, then urlsafe base64
 * encodes the 32 bytes. See fernet_fields/hkdf.py in DMOJ's fork.
 */
const HKDF_SALT = Buffer.from("django-fernet-fields-hkdf-salt", "utf8");

const HKDF_INFO = Buffer.from("django-fernet-fields", "utf8");

export function deriveFernetKey(secretKey: string): Buffer {
  const bits = hkdfSync("sha256", Buffer.from(secretKey, "utf8"), HKDF_SALT, HKDF_INFO, 32);

  return Buffer.from(bits);
}

export function fernetKeyToBase64(key: Buffer): string {
  return key.toString("base64url");
}

function decodeToken(token: Buffer | string): Buffer {
  if (Buffer.isBuffer(token)) {
    // Fernet tokens are urlsafe base64 ASCII; a blob column holds those bytes.
    return Buffer.from(token.toString("ascii"), "base64url");
  }

  return Buffer.from(token, "base64url");
}

export class FernetError extends Error {}

export function fernetDecrypt(key: Buffer, token: Buffer | string): Buffer {
  const raw = decodeToken(token);

  if (raw.length < 1 + 8 + 16 + 32) throw new FernetError("fernet token is too short");

  if (raw[0] !== 0x80) throw new FernetError(`unsupported fernet version ${raw[0]}`);

  const signingKey = key.subarray(0, 16);
  const encryptionKey = key.subarray(16, 32);

  const body = raw.subarray(0, raw.length - 32);
  const signature = raw.subarray(raw.length - 32);
  const expected = createHmac("sha256", signingKey).update(body).digest();

  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    throw new FernetError("fernet signature does not match, wrong SECRET_KEY?");
  }

  const iv = raw.subarray(9, 25);
  const ciphertext = raw.subarray(25, raw.length - 32);
  const decipher = createDecipheriv("aes-128-cbc", encryptionKey, iv);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function fernetDecryptString(key: Buffer, token: Buffer | string): string {
  return fernetDecrypt(key, token).toString("utf8");
}

/** Only used by the tests, mirrored on cryptography's Fernet.encrypt. */
export function fernetEncrypt(key: Buffer, data: Buffer, iv: Buffer, timestampSeconds: number): string {
  const signingKey = key.subarray(0, 16);
  const encryptionKey = key.subarray(16, 32);
  const header = Buffer.alloc(9);
  header[0] = 0x80;
  header.writeBigUInt64BE(BigInt(timestampSeconds), 1);
  const cipher = createCipheriv("aes-128-cbc", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const body = Buffer.concat([header, iv, ciphertext]);
  const signature = createHmac("sha256", signingKey).update(body).digest();

  return Buffer.concat([body, signature]).toString("base64url");
}

export interface SecretKeyFile {
  secretKey: string;
}

/** Parses tools/import/secrets.env style files: SECRET_KEY=... */
export function parseSecretKeyFile(contents: string): SecretKeyFile {
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");

    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();

    if (key !== "SECRET_KEY" && key !== "DJANGO_SECRET_KEY") continue;
    let value = line.slice(eq + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    return { secretKey: value };
  }

  throw new Error("secret key file has no SECRET_KEY= line");
}
