/**
 * The SEB header check and the ticket that carries its result to Convex.
 *
 * The known-answer hash was produced with `sha256sum` rather than by this
 * implementation, so the test would catch the concatenation being reversed —
 * SEB hashes the URL first and the key second, and getting that backwards is
 * the kind of mistake that still passes a round-trip test.
 */

import { describe, expect, it } from "vitest";
import {
  constantTimeEquals,
  mintSebTicket,
  sebHeadersMatch,
  sebKeyHash,
  sebKeysConfigured,
  verifySebTicket,
} from "../src/seb";

const URL = "https://judge.example.org/contest/mcpc";
const CONFIG_KEY = "9b1f0f0a1f6e4c2d8a7b5c3e1d0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f";
const SECRET = "a-shared-secret-between-the-web-tier-and-convex";

describe("sebKeyHash", () => {
  it("hashes the URL then the key", async () => {
    expect(await sebKeyHash(URL, CONFIG_KEY)).toBe(
      "e45baa1317024e4b437341f4f91b3e5d6ee81d8babd116e52fe9093f59d6fbf7",
    );
  });

  it("changes with the URL, so one hash does not unlock every page", async () => {
    const other = await sebKeyHash(`${URL}/rank`, CONFIG_KEY);
    expect(other).not.toBe(await sebKeyHash(URL, CONFIG_KEY));
  });
});

describe("sebHeadersMatch", () => {
  const keys = { configKeys: [CONFIG_KEY], browserExamKeys: [] };

  it("accepts the Config Key hash SEB would send", async () => {
    const configKeyHash = await sebKeyHash(URL, CONFIG_KEY);
    expect(await sebHeadersMatch(URL, { configKeyHash, requestHash: null }, keys)).toBe(true);
  });

  it("accepts it in either case, since the header's encoding is base16", async () => {
    const configKeyHash = (await sebKeyHash(URL, CONFIG_KEY)).toUpperCase();
    expect(await sebHeadersMatch(URL, { configKeyHash, requestHash: null }, keys)).toBe(true);
  });

  it("refuses a hash computed for another URL", async () => {
    const configKeyHash = await sebKeyHash(`${URL}/rank`, CONFIG_KEY);
    expect(await sebHeadersMatch(URL, { configKeyHash, requestHash: null }, keys)).toBe(false);
  });

  it("refuses a request with no headers at all", async () => {
    expect(await sebHeadersMatch(URL, { configKeyHash: null, requestHash: null }, keys)).toBe(false);
  });

  it("takes a Browser Exam Key hash when one is configured", async () => {
    const bek = "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff";
    const requestHash = await sebKeyHash(URL, bek);
    expect(
      await sebHeadersMatch(
        URL,
        { configKeyHash: null, requestHash },
        { configKeys: [], browserExamKeys: [bek] },
      ),
    ).toBe(true);
  });

  it("matches any one of several accepted keys", async () => {
    const configKeyHash = await sebKeyHash(URL, CONFIG_KEY);
    expect(
      await sebHeadersMatch(
        URL,
        { configKeyHash, requestHash: null },
        { configKeys: ["some-other-key", CONFIG_KEY], browserExamKeys: [] },
      ),
    ).toBe(true);
  });
});

describe("sebKeysConfigured", () => {
  it("is false when a contest has nothing to check against", () => {
    expect(sebKeysConfigured({ configKeys: [], browserExamKeys: [] })).toBe(false);
    expect(sebKeysConfigured({ configKeys: ["k"], browserExamKeys: [] })).toBe(true);
  });
});

describe("tickets", () => {
  const claims = { contestKey: "mcpc", profileId: "j57abc" };
  const now = 1_750_000_000_000;

  it("verifies one it just minted", async () => {
    const ticket = await mintSebTicket(SECRET, claims, now);
    expect(await verifySebTicket(SECRET, ticket, claims, now + 1_000)).toBe(true);
  });

  it("expires", async () => {
    const ticket = await mintSebTicket(SECRET, claims, now, 60_000);
    expect(await verifySebTicket(SECRET, ticket, claims, now + 59_999)).toBe(true);
    expect(await verifySebTicket(SECRET, ticket, claims, now + 60_001)).toBe(false);
  });

  it("refuses a ticket minted for another contest", async () => {
    const ticket = await mintSebTicket(SECRET, { ...claims, contestKey: "other" }, now);
    expect(await verifySebTicket(SECRET, ticket, claims, now)).toBe(false);
  });

  it("refuses a ticket minted for someone else, so they cannot be shared", async () => {
    const ticket = await mintSebTicket(SECRET, { ...claims, profileId: "j57zzz" }, now);
    expect(await verifySebTicket(SECRET, ticket, claims, now)).toBe(false);
  });

  it("refuses a ticket signed with another secret", async () => {
    const ticket = await mintSebTicket("a-different-secret", claims, now);
    expect(await verifySebTicket(SECRET, ticket, claims, now)).toBe(false);
  });

  it("refuses an edited payload", async () => {
    const ticket = await mintSebTicket(SECRET, claims, now);
    const [version, payload, signature] = ticket.split(".");
    const forged = btoa(JSON.stringify({ c: "mcpc", p: "j57abc", e: now + 86_400_000 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(payload).not.toBe(forged);
    expect(await verifySebTicket(SECRET, `${version}.${forged}.${signature}`, claims, now)).toBe(false);
  });

  it("refuses a valid ticket with anything appended", async () => {
    const ticket = await mintSebTicket(SECRET, claims, now);
    expect(await verifySebTicket(SECRET, `${ticket}.`, claims, now)).toBe(false);
    expect(await verifySebTicket(SECRET, `${ticket}.x`, claims, now)).toBe(false);
  });

  it("refuses malformed tickets rather than throwing", async () => {
    for (const ticket of ["", "v1", "v1.a", "v2.a.b", "v1..", "not-a-ticket"]) {
      expect(await verifySebTicket(SECRET, ticket, claims, now)).toBe(false);
    }
  });
});

describe("constantTimeEquals", () => {
  it("compares as == would, for equal-length strings", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("abc", "abd")).toBe(false);
    expect(constantTimeEquals("abc", "abcd")).toBe(false);
    expect(constantTimeEquals("", "")).toBe(true);
  });
});
