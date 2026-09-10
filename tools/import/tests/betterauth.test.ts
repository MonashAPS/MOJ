import { describe, expect, it } from "vitest";
import {
  ACCOUNT_COLUMNS,
  buildUpsert,
  PASSKEY_COLUMNS,
  type SqlExecutor,
  TWO_FACTOR_COLUMNS,
  USER_COLUMNS,
  writeBetterAuthRows,
} from "../src/auth/betterauth.ts";
import { buildAuthRows } from "../src/auth/build.ts";
import { deriveFernetKey, fernetEncrypt } from "../src/auth/fernet.ts";
import { decodeBackupCodes, symmetricDecrypt } from "../src/auth/secretbox.ts";
import { reportToJson } from "../src/report.ts";
import { makeFixtureContext } from "./fixtures.ts";

class FakeDatabase implements SqlExecutor {
  readonly statements: { text: string; values: unknown[] }[] = [];

  constructor(private readonly columns: Record<string, string[]>) {}

  async query(text: string, values: unknown[] = []) {
    if (text.startsWith("SELECT column_name")) {
      const table = values[0] as string;
      return {
        rows: (this.columns[table] ?? []).map((column_name) => ({ column_name })),
        rowCount: (this.columns[table] ?? []).length,
      };
    }
    this.statements.push({ text, values });
    return { rows: [], rowCount: 1 };
  }
}

const FULL_SCHEMA = {
  user: [...USER_COLUMNS],
  account: [...ACCOUNT_COLUMNS],
  twoFactor: [...TWO_FACTOR_COLUMNS],
  passkey: [...PASSKEY_COLUMNS],
};

describe("SQL building", () => {
  it("quotes camelCase identifiers and upserts on id", () => {
    const statement = buildUpsert("user", USER_COLUMNS, {
      id: "u1",
      name: "root",
      email: "root@example.test",
      emailVerified: true,
      username: "root",
      displayUsername: "root",
      role: "admin",
      banned: false,
      twoFactorEnabled: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    expect(statement.text).toContain('INSERT INTO "user"');
    expect(statement.text).toContain('"emailVerified"');
    expect(statement.text).toContain("ON CONFLICT (id) DO UPDATE SET");
    expect(statement.text).not.toContain('"id" = EXCLUDED."id"');
    expect(statement.values).toHaveLength(11);
  });

  it("skips columns with no value", () => {
    const statement = buildUpsert("passkey", PASSKEY_COLUMNS, {
      id: "pk1",
      publicKey: "key",
      userId: "u1",
      credentialID: "cred",
      counter: 0,
      deviceType: "multiDevice",
      backedUp: false,
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
        emailVerified: true,
        username: "root",
        displayUsername: "root",
        role: "admin",
        banned: false,
        twoFactorEnabled: true,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ],
    accounts: [
      {
        id: "u1-credential",
        accountId: "u1",
        providerId: "credential",
        userId: "u1",
        password: "pbkdf2_sha256$1$s$h",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ],
    twoFactors: [{ id: "u1-totp", userId: "u1", secret: "deadbeef", backupCodes: "cafe", verified: true }],
    passkeys: [
      {
        id: "pk1",
        name: "YubiKey",
        publicKey: "pQECAyYg",
        userId: "u1",
        credentialID: "Y3JlZC1pZA",
        counter: 7,
        deviceType: "multiDevice",
        backedUp: false,
        transports: "",
        createdAt: new Date(0),
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
      '"twoFactor"',
      '"passkey"',
    ]);
    expect(result.droppedColumns).toEqual([]);
  });

  it("drops columns the deployed schema does not have", async () => {
    const db = new FakeDatabase({
      ...FULL_SCHEMA,
      twoFactor: ["id", "userId", "secret", "backupCodes"],
    });
    const result = await writeBetterAuthRows(db, rows);
    expect(result.droppedColumns).toEqual(["twoFactor.verified"]);
    const twoFactor = db.statements.find((s) => s.text.includes('"twoFactor"'));
    expect(twoFactor?.text).not.toContain("verified");
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
      emailVerified: true,
      role: "admin",
      banned: false,
      displayUsername: "root",
    });
    expect(root?.createdAt.toISOString()).toBe("2020-01-01T00:00:00.000Z");

    const ghost = result.users.find((user) => user.username === "ghost");
    expect(ghost?.role).toBe("user");
    expect(ghost?.emailVerified).toBe(false);
    expect(ghost?.email).toBe("ghost.2@imported.invalid");

    // The third user reuses root's address, so it gets a placeholder.
    const dup = result.users.find((user) => user.username === "dup");
    expect(dup?.email).toBe("dup.3@imported.invalid");

    // The unusable "!" password produces no credential account.
    expect(result.accounts.map((account) => account.userId)).toEqual(["u1", "u3"]);
    expect(result.accounts[0]).toMatchObject({
      providerId: "credential",
      accountId: "u1",
      password: "pbkdf2_sha256$260000$salt$hash",
    });
  });

  it("converts webauthn credentials into passkeys", async () => {
    const { ctx } = await makeFixtureContext();
    const result = await buildAuthRows(ctx, {});
    expect(result.passkeys).toHaveLength(1);
    expect(result.passkeys[0]).toMatchObject({
      userId: "u1",
      name: "YubiKey",
      credentialID: "Y3JlZC1pZA",
      publicKey: "pQECAyYg",
      counter: 7,
      deviceType: "multiDevice",
      backedUp: false,
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
        const row = JSON.parse(line) as Record<string, unknown>;
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
    expect(row).toMatchObject({ id: "u1-totp", userId: "u1", verified: true });
    expect(symmetricDecrypt(authSecret, row?.secret ?? "")).toBe(totp);
    expect(decodeBackupCodes(authSecret, row?.backupCodes ?? "")).toEqual(codes);
    expect(result.users.find((user) => user.id === "u1")?.twoFactorEnabled).toBe(true);
  });

  it("reports rather than throws when the secret key is missing", async () => {
    const { ctx } = await makeFixtureContext();
    const raw = `${ctx.options.outDir}/raw/judge_profile.jsonl`;
    const { readFileSync, writeFileSync } = await import("node:fs");
    const patched = readFileSync(raw, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const row = JSON.parse(line) as Record<string, unknown>;
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
