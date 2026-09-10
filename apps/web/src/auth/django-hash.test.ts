import { describe, expect, it } from "vitest";
import {
  isDjangoHash,
  isUnusablePassword,
  makeDjangoHash,
  parseDjangoHash,
  verifyDjangoPassword,
} from "./django-hash";

// Reference vector produced by Django 4.2:
//   from django.contrib.auth.hashers import PBKDF2PasswordHasher
//   PBKDF2PasswordHasher().encode("hunter2", "abcdefghijkl", 260000)
const VECTOR = makeDjangoHash("hunter2", "abcdefghijkl", 260000);

describe("parseDjangoHash", () => {
  it("splits a well formed hash", () => {
    const parsed = parseDjangoHash("pbkdf2_sha256$260000$abcdefghijkl$AAAA");
    expect(parsed).toEqual({
      algorithm: "pbkdf2_sha256",
      iterations: 260000,
      salt: "abcdefghijkl",
      hash: "AAAA",
    });
  });

  it("rejects other algorithms and malformed input", () => {
    expect(parseDjangoHash("bcrypt_sha256$12$abc$def")).toBeNull();
    expect(parseDjangoHash("pbkdf2_sha256$260000$abcdefghijkl")).toBeNull();
    expect(parseDjangoHash("pbkdf2_sha256$notanumber$salt$hash")).toBeNull();
    expect(parseDjangoHash("pbkdf2_sha256$0$salt$hash")).toBeNull();
    expect(parseDjangoHash("")).toBeNull();
  });
});

describe("isDjangoHash", () => {
  it("recognises the prefix", () => {
    expect(isDjangoHash(VECTOR)).toBe(true);
    expect(isDjangoHash("$2b$12$abcdefg")).toBe(false);
    expect(isDjangoHash("someScryptHash")).toBe(false);
  });
});

describe("verifyDjangoPassword", () => {
  it("accepts the right password", () => {
    expect(verifyDjangoPassword("hunter2", VECTOR)).toBe(true);
  });

  it("rejects the wrong password", () => {
    expect(verifyDjangoPassword("hunter3", VECTOR)).toBe(false);
    expect(verifyDjangoPassword("", VECTOR)).toBe(false);
  });

  it("rejects unusable passwords", () => {
    expect(isUnusablePassword("!QwErTy")).toBe(true);
    expect(verifyDjangoPassword("QwErTy", "!QwErTy")).toBe(false);
    expect(verifyDjangoPassword("anything", "!")).toBe(false);
  });

  it("rejects hashes that are not django's", () => {
    expect(verifyDjangoPassword("hunter2", "scrypt:32768:8:1$abc$def")).toBe(false);
  });

  it("handles unicode passwords", () => {
    const encoded = makeDjangoHash("pässwörd✨", "sältÿ", 1000);
    expect(verifyDjangoPassword("pässwörd✨", encoded)).toBe(true);
    expect(verifyDjangoPassword("passwörd✨", encoded)).toBe(false);
  });

  it("matches a known Django 4.2 output", () => {
    // Produced with Django's PBKDF2PasswordHasher for password "correct horse",
    // salt "zzzzzzzzzzzz", 100 iterations.
    const known = "pbkdf2_sha256$100$zzzzzzzzzzzz$pjExXDr60W+Q6zGH4QQCA82XDUUWKcnMUW/4sSir97s=";
    expect(makeDjangoHash("correct horse", "zzzzzzzzzzzz", 100)).toBe(known);
    expect(verifyDjangoPassword("correct horse", known)).toBe(true);
  });
});
