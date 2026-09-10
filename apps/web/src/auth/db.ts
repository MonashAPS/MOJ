import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __mojAuthPool: Pool | undefined;
}

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Run `npm run setup` or copy infra/.env.example.");
  }
  return new Pool({ connectionString, max: 10 });
}

// Next.js dev reloads this module on every edit; without the global the pool
// count grows until Postgres refuses connections.
export const pool: Pool = globalThis.__mojAuthPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalThis.__mojAuthPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
