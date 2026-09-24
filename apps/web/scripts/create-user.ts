/** Creates (or repairs) the ordinary local development user through Better
 * Auth's server API. Idempotent: run it as many times as you like.
 *
 * Usage: npx tsx apps/web/scripts/create-user.ts [username] [password] [email]
 * Prints one line of JSON with the user's id. */

import { eq } from "drizzle-orm";
import { db, schema } from "../src/auth/db";
import { ensureDevAccount } from "./dev-account";

const username = process.argv[2] ?? "dev";

const password = process.argv[3] ?? "moj-user-local";

const email = process.argv[4] ?? "dev@example.com";

async function main() {
  const userId = await ensureDevAccount(username, password, email);

  // A setup rerun is also a repair: this account must remain a plain user even
  // if its local database row was promoted while testing administration flows.
  await db.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, userId));
  await db
    .update(schema.user)
    .set({
      isStaff: false,
      isSuperuser: false,
      role: "user",
      twoFactorEnabled: false,
    })
    .where(eq(schema.user.id, userId));

  process.stdout.write(`${JSON.stringify({ userId, username, email })}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
