/** A value Postgres can take as a bound parameter of a Better Auth column. */
export type SqlParameter = string | number | boolean | Date | null;

/** Any Better Auth row on its way to Postgres, keyed by column name. */
export type AuthRow = Record<string, SqlParameter>;

interface ColumnNameRow {
  column_name: string;
}

export interface SqlExecutor {
  query(text: string, values?: SqlParameter[]): Promise<{ rows: ColumnNameRow[]; rowCount: number | null }>;
}

export type AuthUserRow = {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  image: string | null;
  created_at: Date;
  updated_at: Date;
  username: string;
  display_username: string;
  two_factor_enabled: boolean;
  role: string;
  banned: boolean;
  ban_reason: string | null;
  ban_expires: Date | null;
  is_staff: boolean;
  is_superuser: boolean;
  timezone: string | null;
  preferred_language: string | null;
  organization_slugs: string | null;
};

export type AuthAccountRow = {
  id: string;
  account_id: string;
  provider_id: string;
  user_id: string;
  password: string;
  created_at: Date;
  updated_at: Date;
};

export type AuthTwoFactorRow = {
  id: string;
  secret: string;
  backup_codes: string;
  user_id: string;
  verified: boolean;
  failed_verification_count: number;
  locked_until: Date | null;
};

export type AuthPasskeyRow = {
  id: string;
  name: string;
  public_key: string;
  user_id: string;
  credential_id: string;
  counter: number;
  device_type: string;
  backed_up: boolean;
  transports: string;
  created_at: Date;
  aaguid: string | null;
};

/**
 * Column lists taken from apps/web/drizzle/0000_aberrant_rage.sql, which is the
 * schema Better Auth 1.7 generates here with the username, twoFactor, passkey,
 * admin, apiKey, bearer and jwt plugins plus MOJ's extra user fields. Drizzle
 * writes snake_case, so no identifier needs quoting for case, but they are
 * quoted anyway because "user" is a reserved word.
 */
export const USER_COLUMNS = [
  "id",
  "name",
  "email",
  "email_verified",
  "image",
  "created_at",
  "updated_at",
  "username",
  "display_username",
  "two_factor_enabled",
  "role",
  "banned",
  "ban_reason",
  "ban_expires",
  "is_staff",
  "is_superuser",
  "timezone",
  "preferred_language",
  "organization_slugs",
] as const;

export const ACCOUNT_COLUMNS = [
  "id",
  "account_id",
  "provider_id",
  "user_id",
  "password",
  "created_at",
  "updated_at",
] as const;

export const TWO_FACTOR_COLUMNS = [
  "id",
  "secret",
  "backup_codes",
  "user_id",
  "verified",
  "failed_verification_count",
  "locked_until",
] as const;

export const PASSKEY_COLUMNS = [
  "id",
  "name",
  "public_key",
  "user_id",
  "credential_id",
  "counter",
  "device_type",
  "backed_up",
  "transports",
  "created_at",
  "aaguid",
] as const;

export const REQUIRED_COLUMNS = new Map<string, readonly string[]>([
  ["user", ["id", "name", "email", "email_verified", "created_at", "updated_at"]],
  ["account", ["id", "account_id", "provider_id", "user_id", "created_at", "updated_at"]],
  ["two_factor", ["id", "user_id", "secret", "backup_codes"]],
  ["passkey", ["id", "public_key", "user_id", "credential_id", "counter", "device_type", "backed_up"]],
]);

function quote(identifier: string): string {
  if (identifier.includes('"')) throw new Error(`invalid identifier ${identifier}`);

  return `"${identifier}"`;
}

export interface UpsertStatement {
  text: string;
  values: SqlParameter[];
}

export function buildUpsert(table: string, columns: readonly string[], values: AuthRow): UpsertStatement {
  const used: string[] = [];
  const parameters: SqlParameter[] = [];

  for (const column of columns) {
    const value = values[column];

    if (value === undefined) continue;
    used.push(column);
    parameters.push(value);
  }

  const placeholders = used.map((_, index) => `$${index + 1}`);

  const updates = used.flatMap((column) =>
    column === "id" ? [] : [`${quote(column)} = EXCLUDED.${quote(column)}`],
  );

  const text =
    `INSERT INTO ${quote(table)} (${used.map(quote).join(", ")}) VALUES (${placeholders.join(", ")})` +
    (updates.length > 0
      ? ` ON CONFLICT (id) DO UPDATE SET ${updates.join(", ")}`
      : " ON CONFLICT (id) DO NOTHING");

  return { text, values: parameters };
}

export async function introspectColumns(client: SqlExecutor, table: string): Promise<Set<string>> {
  const result = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1",
    [table],
  );

  return new Set(result.rows.map((row) => row.column_name));
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
  rows: readonly AuthRow[],
  dropped: string[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const present = await introspectColumns(client, table);

  if (present.size === 0) {
    throw new Error(
      `table "${table}" does not exist in the Better Auth database; run the Drizzle migrations first`,
    );
  }

  for (const column of REQUIRED_COLUMNS.get(table) ?? []) {
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

  const users = await writeTable(client, "user", USER_COLUMNS, input.users, droppedColumns);
  const accounts = await writeTable(client, "account", ACCOUNT_COLUMNS, input.accounts, droppedColumns);

  const twoFactors = await writeTable(
    client,
    "two_factor",
    TWO_FACTOR_COLUMNS,
    input.twoFactors,
    droppedColumns,
  );

  const passkeys = await writeTable(client, "passkey", PASSKEY_COLUMNS, input.passkeys, droppedColumns);

  return { users, accounts, twoFactors, passkeys, droppedColumns };
}
