import { createHash } from "node:crypto";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { bytesToHex, hexToBytes, managedNonce, utf8ToBytes } from "@noble/ciphers/utils.js";
import type { JsonValue } from "../json.ts";

/**
 * Better Auth 1.7 stores the TOTP secret and the backup codes with
 * symmetricEncrypt: XChaCha20-Poly1305 under SHA-256(secret), with a managed
 * (prepended) nonce, hex encoded. When the app is configured with a plain
 * `secret` string the value is bare hex, which is what we write here. See
 * better-auth/dist/crypto/index.mjs.
 */
function keyFor(secret: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(secret, "utf8").digest());
}

export function symmetricEncrypt(secret: string, data: string): string {
  const cipher = managedNonce(xchacha20poly1305)(keyFor(secret));

  return bytesToHex(cipher.encrypt(utf8ToBytes(data)));
}

export function symmetricDecrypt(secret: string, hex: string): string {
  const cipher = managedNonce(xchacha20poly1305)(keyFor(secret));

  return new TextDecoder().decode(cipher.decrypt(hexToBytes(hex)));
}

/**
 * Better Auth's default two factor configuration is
 * storeBackupCodes: "encrypted", so the column holds the encrypted JSON array
 * of codes. DMOJ's scratch codes are 16 character base32 strings; Better Auth
 * generates codes shaped `abcde-fghij`, but any string round trips.
 */
export function encodeBackupCodes(secret: string, codes: string[]): string {
  return symmetricEncrypt(secret, JSON.stringify(codes));
}

export function decodeBackupCodes(secret: string, value: string): string[] {
  const parsed: JsonValue = JSON.parse(symmetricDecrypt(secret, value));

  return Array.isArray(parsed) ? parsed.map((code) => String(code)) : [];
}
