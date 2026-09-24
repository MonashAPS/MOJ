import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/auth/db";
import { auth } from "../src/auth/server";

/** Create or repair the shared identity and password for a local development account. */
export async function ensureDevAccount(username: string, password: string, email: string): Promise<string> {
  const existing = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  let userId = existing[0]?.id;

  if (!userId) {
    // Sign up with a throwaway strong password so Better Auth builds the user
    // and account rows exactly as the form would, then set the real password
    // below. Sign-up is the only endpoint that enforces minPasswordLength and
    // the breach check, and a fixed development password should not have to
    // satisfy either.
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

    userId = result.user.id;

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
      username,
      displayUsername: username,
      name: username,
    })
    .where(eq(schema.user.id, userId));

  await db
    .update(schema.account)
    .set({ password: await hashPassword(password) })
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")));

  return userId;
}
