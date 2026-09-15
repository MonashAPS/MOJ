import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { base64urlToBase64 } from "./build.ts";
import {
  deriveFernetKey,
  fernetDecrypt,
  fernetDecryptString,
  fernetEncrypt,
  fernetKeyToBase64,
  parseSecretKeyFile,
} from "./fernet.ts";
import { decodeBackupCodes, encodeBackupCodes, symmetricDecrypt, symmetricEncrypt } from "./secretbox.ts";

// Everything here uses throwaway keys generated in the test. No production
// secret or value appears in this file.
const SECRET_KEY = "not-a-real-secret-key-0123456789abcdef";

describe("django-fernet-fields key derivation", () => {
  it("derives a stable 32 byte key", () => {
    const key = deriveFernetKey(SECRET_KEY);
    expect(key).toHaveLength(32);
    expect(deriveFernetKey(SECRET_KEY).equals(key)).toBe(true);
    expect(deriveFernetKey(`${SECRET_KEY}x`).equals(key)).toBe(false);
    expect(fernetKeyToBase64(key)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("matches the Python reference implementation", () => {
    // Generated with cryptography's Fernet and django-fernet-fields' HKDF over
    // the throwaway SECRET_KEY above.
    const key = deriveFernetKey(SECRET_KEY);
    expect(key.toString("base64")).toBe("cm3PvUHkj8tCygjeV3W0VuNAxi6u76IXNUIqwhc61H4=");

    const token =
      "gAAAAABqoo5FSprdcwrjOYh-g3IXMCdEfYLGSnxgrrUjvn52QEHeUi0bI0XlGkHM6CB3OYeyFD4Nzpx75IjPy8QujLiLJ4_KSx64utpr_MjPPpxajr9UGOza_iWXtH2da_PrPPur9Rn7";

    expect(fernetDecryptString(key, token)).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567");
    expect(fernetDecryptString(key, Buffer.from(token, "ascii"))).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567");
  });

  it("round trips a TOTP secret through a Fernet token", () => {
    const key = deriveFernetKey(SECRET_KEY);
    const totp = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const token = fernetEncrypt(key, Buffer.from(totp, "utf8"), randomBytes(16), 1_700_000_000);
    expect(fernetDecryptString(key, token)).toBe(totp);
    // The DB column holds the token bytes, which is what the dump gives us.
    expect(fernetDecryptString(key, Buffer.from(token, "ascii"))).toBe(totp);
  });

  it("round trips scratch codes", () => {
    const key = deriveFernetKey(SECRET_KEY);
    const codes = ["ABCDEFGHIJKLMNOP", "QRSTUVWXYZ234567"];
    const token = fernetEncrypt(key, Buffer.from(JSON.stringify(codes), "utf8"), randomBytes(16), 0);
    expect(JSON.parse(fernetDecryptString(key, token))).toEqual(codes);
  });

  it("rejects a token signed with a different secret key", () => {
    const token = fernetEncrypt(deriveFernetKey(SECRET_KEY), Buffer.from("x"), randomBytes(16), 0);
    expect(() => fernetDecrypt(deriveFernetKey("other-secret"), token)).toThrow(/signature/);
  });

  it("rejects a truncated or reversioned token", () => {
    const key = deriveFernetKey(SECRET_KEY);
    expect(() => fernetDecrypt(key, "gAAAA")).toThrow(/too short/);
    const token = Buffer.from(fernetEncrypt(key, Buffer.from("hello"), randomBytes(16), 0), "base64url");
    token[0] = 0x81;
    expect(() => fernetDecrypt(key, token.toString("base64url"))).toThrow(/version/);
  });
});

describe("secret key file", () => {
  it("reads SECRET_KEY with or without quotes", () => {
    expect(parseSecretKeyFile("# comment\nSECRET_KEY=abc123\n").secretKey).toBe("abc123");
    expect(parseSecretKeyFile('SECRET_KEY="a b c"').secretKey).toBe("a b c");
    expect(parseSecretKeyFile("DJANGO_SECRET_KEY='x=y'").secretKey).toBe("x=y");
    expect(() => parseSecretKeyFile("NOTHING=1")).toThrow(/SECRET_KEY/);
  });
});

describe("better auth symmetric encryption", () => {
  const authSecret = "moj-test-secret-0123456789";

  it("decrypts a value produced by better-auth 1.7", () => {
    // Produced with better-auth 1.7.3: symmetricEncrypt({ key, data }).
    const vector =
      "ec0269d76a3c1e866205d46fca7f2c3e1af3f2a4ed7271dc932c412e56f2a2744927977e9fe533238533aef7960518cdcbe1d2025a9d7dc4aa16a5f966486671fae11388fc";

    expect(symmetricDecrypt(authSecret, vector)).toBe('["ABCDE-FGHIJ","KLMNO-PQRST"]');
    expect(decodeBackupCodes(authSecret, vector)).toEqual(["ABCDE-FGHIJ", "KLMNO-PQRST"]);
  });

  it("round trips and uses a fresh nonce every time", () => {
    const first = symmetricEncrypt(authSecret, "SECRETVALUE");
    const second = symmetricEncrypt(authSecret, "SECRETVALUE");
    expect(first).not.toBe(second);
    expect(symmetricDecrypt(authSecret, first)).toBe("SECRETVALUE");
    expect(symmetricDecrypt(authSecret, second)).toBe("SECRETVALUE");
    expect(first).toMatch(/^[0-9a-f]+$/);
  });

  it("fails to decrypt with the wrong app secret", () => {
    const value = encodeBackupCodes(authSecret, ["AAAAA-BBBBB"]);
    expect(() => symmetricDecrypt("another-secret", value)).toThrow();
  });
});

describe("passkey encoding", () => {
  it("turns DMOJ's base64url public key into standard base64", () => {
    const cose = Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0xff, 0xfe]);
    const dmojValue = cose.toString("base64url").replace(/=+$/, "");
    expect(base64urlToBase64(dmojValue)).toBe(cose.toString("base64"));
  });
});
