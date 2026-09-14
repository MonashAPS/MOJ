/**
 * Safe Exam Browser: the two things MOJ has to compute.
 *
 * Unlike the rest of this package none of it is a port of DMOJ, which has no
 * lockdown-browser support at all.
 *
 * SEB proves itself to an exam server with a header rather than an API. With
 * "Use Browser & Config Keys (send in HTTP header)" switched on it appends the
 * base16 SHA-256 of the requested URL concatenated with a key — the URL first —
 * to every request it makes. The server knows the key, recomputes the hash, and
 * compares. Nothing about that requires talking to SEB Server, which is why a
 * MOJ operator can use any of SEB Server, the standalone Configuration Tool, or
 * a hand-written `.seb` file and MOJ never needs to know which.
 *
 * The second half is MOJ's own. Only Next.js sees HTTP headers; submissions go
 * to Convex over a websocket that has none, so a check that lived only in the
 * page render would leave `submissions:submit` open to anyone holding a session
 * token and a terminal. The web tier therefore verifies the header and mints a
 * short-lived HMAC ticket, and Convex verifies the ticket. The secret is shared
 * between the two tiers and never reaches the browser.
 */

/** Lowercase hex of a SHA-256 digest, the encoding SEB uses for its hashes. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Compare without leaking how far the match got. The inputs here are hashes and
 * signatures, so an early return would hand an attacker a way to find a valid
 * one a byte at a time.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * What SEB puts in `X-SafeExamBrowser-ConfigKeyHash`, and with the Browser Exam
 * Key instead of the Config Key, in `X-SafeExamBrowser-RequestHash`.
 */
export function sebKeyHash(url: string, key: string): Promise<string> {
  return sha256Hex(url + key);
}

export type SebHeaders = {
  /** `X-SafeExamBrowser-ConfigKeyHash`. */
  configKeyHash: string | null;
  /** `X-SafeExamBrowser-RequestHash`. */
  requestHash: string | null;
};

export type SebExpectedKeys = {
  /**
   * Config Keys the contest accepts. A Config Key is derived from the settings
   * alone, so one value covers every platform and every SEB release.
   */
  configKeys: readonly string[];
  /**
   * Browser Exam Keys the contest accepts, for an operator who wants to pin
   * exact builds. A BEK folds in the client's code signature, so it differs per
   * platform and per version and the list has to be maintained by hand.
   */
  browserExamKeys: readonly string[];
};

/**
 * True when the request carries a hash matching one of the keys the contest
 * expects. Either header satisfies the check: an operator who configured only
 * Config Keys should not have to also hand out Browser Exam Keys.
 *
 * `url` must be the URL exactly as SEB requested it. SEB hashes the string it
 * put on the wire, so a normalised, proxied or re-encoded URL produces a
 * different digest and nothing ever matches.
 */
export async function sebHeadersMatch(
  url: string,
  headers: SebHeaders,
  expected: SebExpectedKeys,
): Promise<boolean> {
  if (headers.configKeyHash) {
    for (const key of expected.configKeys) {
      if (constantTimeEquals(headers.configKeyHash.toLowerCase(), await sebKeyHash(url, key))) {
        return true;
      }
    }
  }
  if (headers.requestHash) {
    for (const key of expected.browserExamKeys) {
      if (constantTimeEquals(headers.requestHash.toLowerCase(), await sebKeyHash(url, key))) {
        return true;
      }
    }
  }
  return false;
}

/** A contest with no keys at all cannot be verified, so it cannot be locked. */
export function sebKeysConfigured(expected: SebExpectedKeys): boolean {
  return expected.configKeys.length > 0 || expected.browserExamKeys.length > 0;
}

/* -------------------------------------------------------------------------- */
/* Tickets                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How long a minted ticket stays valid. Long enough to survive a slow submit
 * and a clock a little out of step, short enough that one competitor sitting in
 * SEB cannot usefully feed tickets to a room of people who are not.
 */
export const SEB_TICKET_TTL_MS = 60_000;

export type SebTicketClaims = {
  /** The contest the ticket was minted for. */
  contestKey: string;
  /** The profile it was minted for, so a ticket cannot be passed around. */
  profileId: string;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64UrlEncode(new Uint8Array(signature));
}

/** `v1.<payload>.<signature>`, the payload being base64url JSON. */
export async function mintSebTicket(
  secret: string,
  claims: SebTicketClaims,
  now: number,
  ttlMs: number = SEB_TICKET_TTL_MS,
): Promise<string> {
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ c: claims.contestKey, p: claims.profileId, e: now + ttlMs })),
  );
  return `v1.${payload}.${await sign(secret, `v1.${payload}`)}`;
}

/**
 * Verify the signature, the expiry and the claims together. A ticket for
 * another contest or another person is as invalid as an unsigned one.
 */
export async function verifySebTicket(
  secret: string,
  ticket: string,
  expect: SebTicketClaims,
  now: number,
): Promise<boolean> {
  const parts = ticket.split(".");
  const [version, payload, signature] = parts;
  // The length check is not redundant: without it a valid ticket with anything
  // appended after a further dot would still verify.
  if (parts.length !== 3 || version !== "v1" || !payload || !signature) return false;

  const expectedSignature = await sign(secret, `${version}.${payload}`);
  if (!constantTimeEquals(signature, expectedSignature)) return false;

  let claims: { c?: unknown; p?: unknown; e?: unknown };
  try {
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  } catch {
    return false;
  }

  if (typeof claims.e !== "number" || claims.e <= now) return false;
  return claims.c === expect.contestKey && claims.p === expect.profileId;
}
