/** Prints the Better Auth JWKS as one line of JSON, creating the key pair if it
 *  does not exist yet. Used by infra/scripts/setup.mjs to hand Convex the key
 *  set directly when the backend container cannot reach the web app. */

import { auth } from "../src/auth/server";

async function main() {
  const jwks = await auth.api.getJwks();
  process.stdout.write(`${JSON.stringify(jwks)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
