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
import { symmetricEncrypt } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/auth/db";
import { auth } from "../src/auth/server";
import { ensureDevAccount } from "./dev-account";

const username = process.argv[2] ?? "admin";

const password = process.argv[3] ?? "moj-admin-local";

const email = process.argv[4] ?? "admin@example.com";

type AdminSummary = {
  userId: string;
  username: string;
  email: string;
  totpUri?: string;
  scratchCodes?: string[];
};

/** Five fixed scratch codes, in the plugin's `xxxxx-xxxxx` form. */
const DEV_SCRATCH_CODES = ["mojde-vcode1", "mojde-vcode2", "mojde-vcode3", "mojde-vcode4", "mojde-vcode5"];

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
  const userId = await ensureDevAccount(username, password, email);
  await db
    .update(schema.user)
    .set({ isStaff: true, isSuperuser: true, role: "admin" })
    .where(eq(schema.user.id, userId));

  const devTotpSecret = process.env.MOJ_DEV_TOTP_SECRET?.trim();
  const totpUri = devTotpSecret ? await enrolTotp(userId, devTotpSecret) : undefined;

  const summary: AdminSummary = { userId, username, email };

  if (totpUri) {
    summary.totpUri = totpUri;
    summary.scratchCodes = DEV_SCRATCH_CODES;
  }

  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
