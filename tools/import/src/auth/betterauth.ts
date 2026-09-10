export interface SqlExecutor {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export interface AuthUserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  username: string;
  displayUsername: string;
  role: string;
  banned: boolean;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthAccountRow {
  id: string;
  accountId: string;
  providerId: string;
  userId: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTwoFactorRow {
  id: string;
  userId: string;
  secret: string;
  backupCodes: string;
  verified: boolean;
}

export interface AuthPasskeyRow {
  id: string;
  name: string;
  publicKey: string;
  userId: string;
  credentialID: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports: string;
  createdAt: Date;
  aaguid: string | null;
}

/**
 * Column lists confirmed against Better Auth 1.7 with the username, twoFactor,
 * passkey, admin, apiKey, bearer and jwt plugins (getAuthTables from
 * @better-auth/core/db). Postgres folds unquoted identifiers to lower case, so
 * every camelCase table and column is quoted.
 */
export const USER_COLUMNS = [
  "id",
  "name",
  "email",
  "emailVerified",
  "username",
  "displayUsername",
  "role",
  "banned",
  "twoFactorEnabled",
  "createdAt",
  "updatedAt",
] as const;

export const ACCOUNT_COLUMNS = [
  "id",
  "accountId",
  "providerId",
  "userId",
  "password",
  "createdAt",
  "updatedAt",
] as const;

export const TWO_FACTOR_COLUMNS = ["id", "userId", "secret", "backupCodes", "verified"] as const;

export const PASSKEY_COLUMNS = [
  "id",
  "name",
  "publicKey",
  "userId",
  "credentialID",
  "counter",
  "deviceType",
  "backedUp",
  "transports",
  "createdAt",
  "aaguid",
] as const;

export const REQUIRED_COLUMNS: Record<string, string[]> = {
  user: ["id", "name", "email", "emailVerified", "createdAt", "updatedAt"],
  account: ["id", "accountId", "providerId", "userId", "createdAt", "updatedAt"],
  twoFactor: ["id", "userId", "secret", "backupCodes"],
  passkey: ["id", "publicKey", "userId", "credentialID", "counter", "deviceType", "backedUp"],
};

function quote(identifier: string): string {
  if (identifier.includes('"')) throw new Error(`invalid identifier ${identifier}`);
  return `"${identifier}"`;
}

export function buildUpsert(
  table: string,
  columns: readonly string[],
  values: Record<string, unknown>,
): { text: string; values: unknown[] } {
  const used = columns.filter((column) => values[column] !== undefined);
  const placeholders = used.map((_, index) => `$${index + 1}`);
  const updates = used
    .filter((column) => column !== "id")
    .map((column) => `${quote(column)} = EXCLUDED.${quote(column)}`);
  const text =
    `INSERT INTO ${quote(table)} (${used.map(quote).join(", ")}) VALUES (${placeholders.join(", ")})` +
    (updates.length > 0
      ? ` ON CONFLICT (id) DO UPDATE SET ${updates.join(", ")}`
      : " ON CONFLICT (id) DO NOTHING");
  return { text, values: used.map((column) => values[column]) };
}

export async function introspectColumns(client: SqlExecutor, table: string): Promise<Set<string>> {
  const result = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1",
    [table],
  );
  return new Set(result.rows.map((row) => String(row.column_name)));
}

export interface AuthWriteInput {
  users: AuthUserRow[];
  accounts: AuthAccountRow[];
  twoFactors: AuthTwoFactorRow[];
  passkeys: AuthPasskeyRow[];
}

export interface AuthWriteResult {
  users: number;
  accounts: number;
  twoFactors: number;
  passkeys: number;
  droppedColumns: string[];
}

async function writeTable(
  client: SqlExecutor,
  table: string,
  columns: readonly string[],
  rows: Record<string, unknown>[],
  dropped: string[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const present = await introspectColumns(client, table);
  if (present.size === 0) {
    throw new Error(
      `table "${table}" does not exist in the Better Auth database; run the Drizzle migrations first`,
    );
  }
  for (const column of REQUIRED_COLUMNS[table] ?? []) {
    if (!present.has(column)) throw new Error(`table "${table}" is missing the required column "${column}"`);
  }
  const usable = columns.filter((column) => present.has(column));
  for (const column of columns) {
    if (!present.has(column)) dropped.push(`${table}.${column}`);
  }
  let written = 0;
  for (const row of rows) {
    const statement = buildUpsert(table, usable, row);
    await client.query(statement.text, statement.values);
    written++;
  }
  return written;
}

export async function writeBetterAuthRows(
  client: SqlExecutor,
  input: AuthWriteInput,
): Promise<AuthWriteResult> {
  const droppedColumns: string[] = [];
  const users = await writeTable(
    client,
    "user",
    USER_COLUMNS,
    input.users as unknown as Record<string, unknown>[],
    droppedColumns,
  );
  const accounts = await writeTable(
    client,
    "account",
    ACCOUNT_COLUMNS,
    input.accounts as unknown as Record<string, unknown>[],
    droppedColumns,
  );
  const twoFactors = await writeTable(
    client,
    "twoFactor",
    TWO_FACTOR_COLUMNS,
    input.twoFactors as unknown as Record<string, unknown>[],
    droppedColumns,
  );
  const passkeys = await writeTable(
    client,
    "passkey",
    PASSKEY_COLUMNS,
    input.passkeys as unknown as Record<string, unknown>[],
    droppedColumns,
  );
  return { users, accounts, twoFactors, passkeys, droppedColumns };
}
