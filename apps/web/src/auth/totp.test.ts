/**
 * The enrolment page hands a phone an `otpauth://` URI and then asks for the
 * code the phone shows. This checks the two halves agree: `otpauth`, the
 * reference RFC 6238 implementation an authenticator app is written against,
 * produces codes Better Auth's verifier accepts with the options this site
 * configures (six digits, a 30 second period, one period of tolerance).
 *
 * The URI is built the way the two-factor plugin builds it, so a change to
 * either library shows up here rather than on somebody's phone.
 */

import { createOTP } from "@better-auth/utils/otp";
import { TOTP, URI } from "otpauth";
import { describe, expect, it } from "vitest";

/** `generateRandomString(32)`, the shape of the secret the plugin stores. */
const SECRET = "3xK9pQ2mVn7RtY4wZ8bC5dF6gH1jL0sA";

/** `auth/server.ts`: `totpOptions: { period: 30, digits: 6 }`. */
const OPTIONS = { digits: 6, period: 30 } as const;

const TOTP_URI = createOTP(SECRET, OPTIONS).url("MOJ", "member@example.org");

function phone(): TOTP {
  const parsed = URI.parse(TOTP_URI);

  if (!(parsed instanceof TOTP)) throw new Error("The enrolment URI is not a TOTP URI.");

  return parsed;
}

describe("TOTP enrolment", () => {
  it("hands an authenticator app a URI it understands", () => {
    const totp = phone();
    expect(totp.issuer).toBe("MOJ");
    expect(totp.label).toBe("member@example.org");
    expect(totp.digits).toBe(6);
    expect(totp.period).toBe(30);
    expect(totp.algorithm).toBe("SHA1");
  });

  it("accepts the code that app would be showing", async () => {
    const code = phone().generate();
    expect(code).toMatch(/^\d{6}$/);
    await expect(createOTP(SECRET, OPTIONS).verify(code)).resolves.toBe(true);
  });

  it("tolerates a phone one period out, as DMOJ does", async () => {
    const totp = phone();
    const behind = totp.generate({ timestamp: Date.now() - 30_000 });
    const ahead = totp.generate({ timestamp: Date.now() + 30_000 });
    await expect(createOTP(SECRET, OPTIONS).verify(behind)).resolves.toBe(true);
    await expect(createOTP(SECRET, OPTIONS).verify(ahead)).resolves.toBe(true);
  });

  it("rejects a code from another secret", async () => {
    const other = URI.parse(createOTP("aB3dE6gH9jK2mN5pQ8sT1vW4xY7zC0fI", OPTIONS).url("MOJ", "someone"));
    const code = (other as TOTP).generate();
    await expect(createOTP(SECRET, OPTIONS).verify(code)).resolves.toBe(false);
  });

  it("rejects a code that has drifted out of the window", async () => {
    const stale = phone().generate({ timestamp: Date.now() - 10 * 60_000 });
    await expect(createOTP(SECRET, OPTIONS).verify(stale)).resolves.toBe(false);
  });
});
