import { describe, expect, it } from "vitest";
import { isJsonObject, parseJson } from "../json.ts";
import { reportToJson } from "../report.ts";
import { makeFixtureContext } from "../test.fixtures.ts";
import {
  ACCOUNT_COLUMNS,
  buildUpsert,
  PASSKEY_COLUMNS,
  type SqlExecutor,
  type SqlParameter,
  TWO_FACTOR_COLUMNS,
  USER_COLUMNS,
  writeBetterAuthRows,
} from "./betterauth.ts";
import { buildAuthRows } from "./build.ts";
import { deriveFernetKey, fernetEncrypt } from "./fernet.ts";
import { decodeBackupCodes, symmetricDecrypt } from "./secretbox.ts";

class FakeDatabase implements SqlExecutor {
  readonly statements: { text: string; values: SqlParameter[] }[] = [];

  constructor(private readonly columns: Record<string, string[]>) {}

  async query(text: string, values: SqlParameter[] = []) {
    if (text.startsWith("SELECT column_name")) {
      const present = this.columns[String(values[0])] ?? [];

      return {
        rows: present.map((column_name) => ({ column_name })),
        rowCount: present.length,
      };
    }

    this.statements.push({ text, values });

    return { rows: [], rowCount: 1 };
  }
}

const FULL_SCHEMA = {
  user: [...USER_COLUMNS],
  account: [...ACCOUNT_COLUMNS],
  two_factor: [...TWO_FACTOR_COLUMNS],
  passkey: [...PASSKEY_COLUMNS],
};

describe("SQL building", () => {
  it("quotes identifiers and upserts on id", () => {
    const statement = buildUpsert("user", USER_COLUMNS, {
      id: "u1",
      name: "root",
      email: "root@example.test",
      email_verified: true,
      image: null,
      created_at: new Date(0),
      updated_at: new Date(0),
      username: "root",
      display_username: "root",
      two_factor_enabled: false,
      role: "admin",
      banned: false,
      ban_reason: null,
      ban_expires: null,
      is_staff: false,
      is_superuser: false,
      timezone: "UTC",
      preferred_language: "PY3",
      organization_slugs: null,
    });

    expect(statement.text).toContain('INSERT INTO "user"');
    expect(statement.text).toContain('"email_verified"');
    expect(statement.text).toContain('"is_superuser"');
    expect(statement.text).toContain('"organization_slugs"');
    expect(statement.text).toContain("ON CONFLICT (id) DO UPDATE SET");
    expect(statement.text).not.toContain('"id" = EXCLUDED."id"');
    expect(statement.values).toHaveLength(19);
  });

  it("skips columns with no value", () => {
    const statement = buildUpsert("passkey", PASSKEY_COLUMNS, {
      id: "pk1",
      public_key: "key",
      user_id: "u1",
      credential_id: "cred",
      counter: 0,
      device_type: "multiDevice",
      backed_up: false,
    });

    expect(statement.text).not.toContain("aaguid");
    expect(statement.values).toHaveLength(7);
  });
});

describe("writeBetterAuthRows", () => {
  const rows = {
    users: [
      {
        id: "u1",
        name: "root",
        email: "root@example.test",
        email_verified: true,
        image: null,
        created_at: new Date(0),
        updated_at: new Date(0),
        username: "root",
        display_username: "root",
        two_factor_enabled: true,
        role: "admin",
        banned: false,
        ban_reason: null,
        ban_expires: null,
        is_staff: true,
        is_superuser: true,
        timezone: "Australia/Melbourne",
        preferred_language: "PY3",
        organization_slugs: "maps",
      },
    ],
    accounts: [
      {
        id: "u1-credential",
        account_id: "u1",
        provider_id: "credential",
        user_id: "u1",
        password: "pbkdf2_sha256$1$s$h",
        created_at: new Date(0),
        updated_at: new Date(0),
      },
    ],
    twoFactors: [
      {
        id: "u1-totp",
        secret: "deadbeef",
        backup_codes: "cafe",
        user_id: "u1",
        verified: true,
        failed_verification_count: 0,
        locked_until: null,
      },
    ],
    passkeys: [
      {
        id: "pk1",
        name: "YubiKey",
        public_key: "pQECAyYg",
        user_id: "u1",
        credential_id: "Y3JlZC1pZA",
        counter: 7,
        device_type: "multiDevice",
        backed_up: false,
        transports: "",
        created_at: new Date(0),
        aaguid: null,
      },
    ],
  };

  it("writes one statement per row", async () => {
    const db = new FakeDatabase(FULL_SCHEMA);
    const result = await writeBetterAuthRows(db, rows);
    expect(result).toMatchObject({ users: 1, accounts: 1, twoFactors: 1, passkeys: 1 });
    expect(db.statements.map((s) => s.text.split(" ")[2])).toEqual([
      '"user"',
      '"account"',
      '"two_factor"',
      '"passkey"',
    ]);
    expect(result.droppedColumns).toEqual([]);
  });

  it("drops columns the deployed schema does not have", async () => {
    const db = new FakeDatabase({
      ...FULL_SCHEMA,
      two_factor: ["id", "secret", "backup_codes", "user_id", "verified"],
    });

    const result = await writeBetterAuthRows(db, rows);
    expect(result.droppedColumns).toEqual([
      "two_factor.failed_verification_count",
      "two_factor.locked_until",
    ]);
    const twoFactor = db.statements.find((s) => s.text.includes('"two_factor"'));
    expect(twoFactor?.text).not.toContain("failed_verification_count");
  });

  it("fails clearly when the tables are missing", async () => {
    const db = new FakeDatabase({});
    await expect(writeBetterAuthRows(db, rows)).rejects.toThrow(/does not exist/);
  });

  it("fails when a required column is missing", async () => {
    const db = new FakeDatabase({ ...FULL_SCHEMA, user: ["id", "name"] });
    await expect(writeBetterAuthRows(db, rows)).rejects.toThrow(/required column "email"/);
  });
});

describe("buildAuthRows", () => {
  it("maps auth_user rows onto Better Auth users and credential accounts", async () => {
    const { ctx } = await makeFixtureContext();
    const result = await buildAuthRows(ctx, {});
    expect(result.stats).toMatchObject({ users: 3, accounts: 2, unusablePasswords: 1 });

    const root = result.users.find((user) => user.username === "root");
    expect(root).toMatchObject({
      id: "u1",
      name: "root",
      email: "root@example.test",
      email_verified: true,
      role: "admin",
      banned: false,
      display_username: "root",
      is_staff: true,
      is_superuser: true,
      timezone: "Australia/Melbourne",
      preferred_language: "PY3",
      organization_slugs: "maps",
    });
    expect(root?.created_at.toISOString()).toBe("2020-01-01T00:00:00.000Z");

    const ghost = result.users.find((user) => user.username === "ghost");
    expect(ghost?.role).toBe("user");
    expect(ghost?.email_verified).toBe(false);
    expect(ghost?.email).toBe("ghost.2@imported.invalid");

    // The third user reuses root's address, so it gets a placeholder.
    const dup = result.users.find((user) => user.username === "dup");
    expect(dup?.email).toBe("dup.3@imported.invalid");

    // The unusable "!" password produces no credential account.
    expect(result.accounts.map((account) => account.user_id)).toEqual(["u1", "u3"]);
    expect(result.accounts[0]).toMatchObject({
      provider_id: "credential",
      account_id: "u1",
      password: "pbkdf2_sha256$260000$salt$hash",
    });
  });

  it("converts webauthn credentials into passkeys", async () => {
    const { ctx } = await makeFixtureContext();
    const result = await buildAuthRows(ctx, {});
    expect(result.passkeys).toHaveLength(1);
    expect(result.passkeys[0]).toMatchObject({
      user_id: "u1",
      name: "YubiKey",
      credential_id: "Y3JlZC1pZA",
      public_key: "pQECAyYg",
      counter: 7,
      device_type: "multiDevice",
      backed_up: false,
    });
  });

  it("decrypts TOTP data with the Django secret key and re-encrypts it for Better Auth", async () => {
    const { ctx } = await makeFixtureContext();
    const djangoSecretKey = "another-throwaway-secret";
    const authSecret = "auth-secret-for-the-test";
    const key = deriveFernetKey(djangoSecretKey);
    const totp = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const codes = ["AAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBB"];
    const iv = Buffer.alloc(16, 7);

    // Pretend profile 1 has TOTP on, exactly as the dump would carry it.
    const totpBlob = Buffer.from(fernetEncrypt(key, Buffer.from(totp), iv, 0), "ascii");
    const codesBlob = Buffer.from(fernetEncrypt(key, Buffer.from(JSON.stringify(codes)), iv, 0), "ascii");
    const raw = `${ctx.options.outDir}/raw/judge_profile.jsonl`;
    const { readFileSync, writeFileSync } = await import("node:fs");

    const patched = readFileSync(raw, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const row = parseJson(line);

        if (!isJsonObject(row)) throw new Error(`not a fixture row: ${line}`);

        if (row.id === 1) {
          row.is_totp_enabled = 1;
          row.totp_key = { $hex: totpBlob.toString("hex") };
          row.scratch_codes = { $hex: codesBlob.toString("hex") };
        }

        return JSON.stringify(row);
      })
      .join("\n");

    writeFileSync(raw, `${patched}\n`);

    const result = await buildAuthRows(ctx, { djangoSecretKey, authSecret });
    expect(result.stats.twoFactors).toBe(1);
    const row = result.twoFactors[0];
    expect(row).toMatchObject({ id: "u1-totp", user_id: "u1", verified: true });
    expect(symmetricDecrypt(authSecret, row?.secret ?? "")).toBe(totp);
    expect(decodeBackupCodes(authSecret, row?.backup_codes ?? "")).toEqual(codes);
    expect(result.users.find((user) => user.id === "u1")?.two_factor_enabled).toBe(true);
  });

  it("reports rather than throws when the secret key is missing", async () => {
    const { ctx } = await makeFixtureContext();
    const raw = `${ctx.options.outDir}/raw/judge_profile.jsonl`;
    const { readFileSync, writeFileSync } = await import("node:fs");

    const patched = readFileSync(raw, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const row = parseJson(line);

        if (!isJsonObject(row)) throw new Error(`not a fixture row: ${line}`);

        if (row.id === 1) {
          row.is_totp_enabled = 1;
          row.totp_key = { $hex: "6761726261676521" };
        }

        return JSON.stringify(row);
      })
      .join("\n");

    writeFileSync(raw, `${patched}\n`);

    const result = await buildAuthRows(ctx, {});
    expect(result.stats.twoFactorFailures).toBe(1);
    expect(result.twoFactors).toHaveLength(0);
    const report = reportToJson(ctx);
    expect(report.warnings.some((w) => w.reason.includes("no Django SECRET_KEY"))).toBe(true);
  });
});
