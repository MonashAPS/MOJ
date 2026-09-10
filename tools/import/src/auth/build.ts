import type { ImportContext } from "../context.ts";
import type {
  AuthAccountRow,
  AuthPasskeyRow,
  AuthTwoFactorRow,
  AuthUserRow,
  AuthWriteInput,
} from "./betterauth.ts";
import { deriveFernetKey, fernetDecryptString } from "./fernet.ts";
import { encodeBackupCodes, symmetricEncrypt } from "./secretbox.ts";

export interface AuthBuildOptions {
  /** Django SECRET_KEY, needed to decrypt totp_key and scratch_codes. */
  djangoSecretKey?: string;
  /** AUTH_SECRET / BETTER_AUTH_SECRET, needed to re-encrypt them. */
  authSecret?: string;
}

export interface AuthBuildResult extends AuthWriteInput {
  stats: {
    users: number;
    accounts: number;
    unusablePasswords: number;
    rewrittenEmails: number;
    twoFactors: number;
    twoFactorFailures: number;
    passkeys: number;
  };
}

export function userIdFor(legacyUserId: number): string {
  return `u${legacyUserId}`;
}

function placeholderEmail(username: string, legacyUserId: number): string {
  const safe = username.replace(/[^A-Za-z0-9_.-]/g, "") || "user";
  return `${safe}.${legacyUserId}@imported.invalid`;
}

/** base64url (padded or not) to standard base64, which is how Better Auth stores COSE keys. */
export function base64urlToBase64(value: string): string {
  return Buffer.from(value, "base64url").toString("base64");
}

export async function buildAuthRows(ctx: ImportContext, options: AuthBuildOptions): Promise<AuthBuildResult> {
  const users: AuthUserRow[] = [];
  const accounts: AuthAccountRow[] = [];
  const twoFactors: AuthTwoFactorRow[] = [];
  const passkeys: AuthPasskeyRow[] = [];
  const stats = {
    users: 0,
    accounts: 0,
    unusablePasswords: 0,
    rewrittenEmails: 0,
    twoFactors: 0,
    twoFactorFailures: 0,
    passkeys: 0,
  };

  // profile id -> auth_user id, plus the 2FA columns we need per user.
  const profileToUser = new Map<number, number>();
  const totpByUser = new Map<
    number,
    { enabled: boolean; totpKey: Buffer | null; scratchCodes: Buffer | null }
  >();
  for await (const row of ctx.rows("judge_profile")) {
    const legacyUserId = row.n("user_id");
    profileToUser.set(row.id(), legacyUserId);
    totpByUser.set(legacyUserId, {
      enabled: row.b("is_totp_enabled"),
      totpKey: row.blob("totp_key"),
      scratchCodes: row.blob("scratch_codes"),
    });
  }

  const emails = new Set<string>();
  for await (const row of ctx.rows("auth_user")) {
    const legacyUserId = row.id();
    const id = userIdFor(legacyUserId);
    const username = row.s("username");
    let email = row.s("email").trim();
    if (email === "") {
      email = placeholderEmail(username, legacyUserId);
      ctx.report.warn("betterAuth.user", "empty email replaced with a placeholder", legacyUserId);
      stats.rewrittenEmails++;
    } else if (emails.has(email.toLowerCase())) {
      email = placeholderEmail(username, legacyUserId);
      ctx.report.warn("betterAuth.user", "duplicate email replaced with a placeholder", legacyUserId);
      stats.rewrittenEmails++;
    }
    emails.add(email.toLowerCase());

    const joined = row.t("date_joined");
    const totp = totpByUser.get(legacyUserId);
    users.push({
      id,
      name: username,
      email,
      emailVerified: row.b("is_active"),
      username,
      displayUsername: username,
      role: row.b("is_superuser") ? "admin" : "user",
      banned: false,
      twoFactorEnabled: totp?.enabled === true && totp.totpKey !== null,
      createdAt: new Date(joined),
      updatedAt: new Date(joined),
    });
    stats.users++;

    const password = row.s("password");
    if (password === "" || password.startsWith("!")) {
      stats.unusablePasswords++;
      ctx.report.warn("betterAuth.account", "unusable Django password, no credential account", legacyUserId);
    } else {
      accounts.push({
        id: `${id}-credential`,
        accountId: id,
        providerId: "credential",
        userId: id,
        password,
        createdAt: new Date(joined),
        updatedAt: new Date(joined),
      });
      stats.accounts++;
    }
  }

  const fernetKey = options.djangoSecretKey ? deriveFernetKey(options.djangoSecretKey) : null;
  for (const [legacyUserId, totp] of totpByUser) {
    if (!totp.enabled || totp.totpKey === null) {
      if (totp.scratchCodes !== null || totp.totpKey !== null) {
        ctx.report.warn(
          "betterAuth.twoFactor",
          "TOTP is disabled but leftover key or scratch codes exist, not imported",
          legacyUserId,
        );
      }
      continue;
    }
    if (!fernetKey || !options.authSecret) {
      stats.twoFactorFailures++;
      ctx.report.warn(
        "betterAuth.twoFactor",
        fernetKey
          ? "AUTH_SECRET is not set, TOTP secret not imported"
          : "no Django SECRET_KEY given, TOTP secret not imported",
        legacyUserId,
      );
      continue;
    }
    try {
      const secret = fernetDecryptString(fernetKey, totp.totpKey);
      let codes: string[] = [];
      if (totp.scratchCodes) {
        const decoded = fernetDecryptString(fernetKey, totp.scratchCodes);
        const parsed = JSON.parse(decoded) as unknown;
        if (Array.isArray(parsed)) codes = parsed.map((code) => String(code));
      }
      const id = userIdFor(legacyUserId);
      twoFactors.push({
        id: `${id}-totp`,
        userId: id,
        secret: symmetricEncrypt(options.authSecret, secret),
        backupCodes: encodeBackupCodes(options.authSecret, codes),
        verified: true,
      });
      stats.twoFactors++;
    } catch (error) {
      stats.twoFactorFailures++;
      ctx.report.warn(
        "betterAuth.twoFactor",
        `could not decrypt TOTP data: ${(error as Error).message}`,
        legacyUserId,
      );
    }
  }

  for await (const row of ctx.rows("judge_webauthncredential")) {
    const legacyUserId = profileToUser.get(row.n("user_id"));
    if (legacyUserId === undefined) {
      ctx.report.skip("betterAuth.passkey", "credential has no profile", row.id());
      continue;
    }
    const id = userIdFor(legacyUserId);
    passkeys.push({
      id: `pk${row.id()}`,
      name: row.s("name"),
      publicKey: base64urlToBase64(row.s("public_key")),
      userId: id,
      credentialID: row.s("cred_id"),
      counter: row.n("counter"),
      deviceType: "multiDevice",
      backedUp: false,
      transports: "",
      createdAt: new Date(),
      aaguid: null,
    });
    stats.passkeys++;
  }

  return { users, accounts, twoFactors, passkeys, stats };
}
