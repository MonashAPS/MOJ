/** Creates (or repairs) the local development superuser through Better Auth's
 *  server API, so the account is indistinguishable from one made by the sign-up
 *  form. Idempotent: run it as many times as you like.
 *
 *  The superuser is staff, and staff must hold a second factor (SPEC section 3),
 *  so when `MOJ_DEV_TOTP_SECRET` is set the account is also enrolled in TOTP
 *  against that fixed secret. That makes the dev login reproducible: the same
 *  secret always yields the same codes, and a test can generate one. It is a
 *  development affordance and `npm run setup` only writes the variable outside
 *  production.
 *
 *  Usage: npx tsx apps/web/scripts/create-admin.ts [username] [password] [email]
 *  Prints one line of JSON with the created user's id, and the provisioning URI
 *  and scratch codes when TOTP was enrolled. */

import { randomBytes } from "node:crypto";
import { createOTP } from "@better-auth/utils/otp";
import { hashPassword, symmetricEncrypt } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/auth/db";
import { auth } from "../src/auth/server";

const username = process.argv[2] ?? "admin";
const password = process.argv[3] ?? "admin";
const email = process.argv[4] ?? "admin@example.com";

/** Five fixed scratch codes, in the plugin's `xxxxx-xxxxx` shape. */
const DEV_SCRATCH_CODES = [
  "mojde-vcode1",
  "mojde-vcode2",
  "mojde-vcode3",
  "mojde-vcode4",
  "mojde-vcode5",
];

/** Writes the two-factor row Better Auth would have written after a successful
 *  enrolment, with a known secret instead of a random one. */
async function enrolTotp(userId: string, secret: string): Promise<string> {
  const context = await auth.$context;
  const encrypted = await symmetricEncrypt({ key: context.secretConfig, data: secret });

  // The plugin's default is `storeBackupCodes: "encrypted"`, so the codes go in
  // under the same key as the secret; plain JSON here would 500 on first use.
  const encryptedCodes = await symmetricEncrypt({
    key: context.secretConfig,
    data: JSON.stringify(DEV_SCRATCH_CODES),
  });

  await db.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, userId));
  await db.insert(schema.twoFactor).values({
    id: randomBytes(16).toString("hex"),
    secret: encrypted,
    backupCodes: encryptedCodes,
    userId,
    verified: true,
  });
  await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, userId));

  return createOTP(secret, { digits: 6, period: 30 }).url("MOJ", email);
}

async function main() {
  const existing = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  let userId = existing[0]?.id;

  if (!userId) {
    // Sign up with a throwaway strong password so Better Auth builds the user
    // and account rows exactly as the form would, then set the real password
    // below. The dev password "admin" is shorter than minPasswordLength on
    // purpose, and only the sign-up endpoint enforces that.
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password: randomBytes(24).toString("base64url"),
        name: username,
        username,
        timezone: "Australia/Melbourne",
        preferredLanguage: "PY3",
      },
    });
    userId = (result as { user?: { id: string } }).user?.id;
    if (!userId) {
      const created = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
      userId = created[0]?.id;
    }
  }

  if (!userId) throw new Error(`could not create or find the ${username} user`);

  await db
    .update(schema.user)
    .set({
      emailVerified: true,
      isStaff: true,
      isSuperuser: true,
      role: "admin",
      username,
      displayUsername: username,
      name: username,
    })
    .where(eq(schema.user.id, userId));

  await db
    .update(schema.account)
    .set({ password: await hashPassword(password) })
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")));

  const devTotpSecret = process.env.MOJ_DEV_TOTP_SECRET?.trim();
  const totpUri = devTotpSecret ? await enrolTotp(userId, devTotpSecret) : undefined;

  process.stdout.write(
    `${JSON.stringify({
      userId,
      username,
      email,
      ...(totpUri ? { totpUri, scratchCodes: DEV_SCRATCH_CODES } : {}),
    })}\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
