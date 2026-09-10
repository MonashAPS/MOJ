/** Creates (or repairs) the local development superuser through Better Auth's
 *  server API, so the account is indistinguishable from one made by the sign-up
 *  form. Idempotent: run it as many times as you like.
 *
 *  Usage: npx tsx apps/web/scripts/create-admin.ts [username] [password] [email]
 *  Prints one line of JSON with the created user's id. */

import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/auth/db";
import { auth } from "../src/auth/server";

const username = process.argv[2] ?? "admin";
const password = process.argv[3] ?? "admin";
const email = process.argv[4] ?? "admin@example.com";

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

  process.stdout.write(`${JSON.stringify({ userId, username, email })}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
