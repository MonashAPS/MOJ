"use server";

import { eq, or } from "drizzle-orm";
import { db, schema } from "@/auth/db";
import { auth } from "@/auth/server";

/** DMOJ tells an unactivated account to look for its activation email; this is
 *  the "send me another" behind that message. The identifier is whatever was
 *  typed at the login prompt, so a username is resolved to its address here
 *  rather than in the browser. */
export async function resendActivation(identifier: string): Promise<{ ok: boolean }> {
  const value = identifier.trim().toLowerCase();
  if (!value) return { ok: false };

  try {
    const [row] = await db
      .select({ email: schema.user.email, emailVerified: schema.user.emailVerified })
      .from(schema.user)
      .where(or(eq(schema.user.email, value), eq(schema.user.username, value)))
      .limit(1);

    // Nothing to resend for an address nobody has, or one already activated.
    if (!row || row.emailVerified) return { ok: true };

    await auth.api.sendVerificationEmail({ body: { email: row.email, callbackURL: "/" } });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
