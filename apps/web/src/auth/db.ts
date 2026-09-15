import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __mojAuthPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __mojAuthDb: Db | undefined;
}

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Run `npm run setup` or copy infra/.env.example.");
  }

  return new Pool({ connectionString, max: 10 });
}

// The pool is created on first use rather than at import, so building the app
// (which imports this module while collecting page data) needs no database.
// Next.js dev reloads this module on every edit; without the global the pool
// count grows until Postgres refuses connections.
function realPool(): Pool {
  if (!globalThis.__mojAuthPool) globalThis.__mojAuthPool = makePool();

  return globalThis.__mojAuthPool;
}

function realDb(): Db {
  if (!globalThis.__mojAuthDb) globalThis.__mojAuthDb = drizzle(realPool(), { schema });

  return globalThis.__mojAuthDb;
}

function lazy<T extends object>(resolve: () => T): T {
  // SAFETY: no trap reads the target; each one answers from the resolved instance.
  const placeholder = {} as T;

  return new Proxy(placeholder, {
    get(_target, prop) {
      const instance = resolve();
      // SAFETY: a key the instance does not carry reads as undefined here, exactly as it would on the instance.
      const value = instance[prop as keyof T];

      return value instanceof Function ? value.bind(instance) : value;
    },
    has(_target, prop) {
      return prop in resolve();
    },
  });
}

export const db: Db = lazy(realDb);

export { schema };
