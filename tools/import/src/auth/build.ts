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

  // Language keys and organisation slugs live on the Better Auth user, so the
  // web app can bootstrap a Convex profile from the session alone.
  const languageKeys = new Map<number, string>();

  for await (const row of ctx.rows("judge_language")) languageKeys.set(row.id(), row.s("key"));

  const organizationSlugs = new Map<number, string>();

  for await (const row of ctx.rows("judge_organization")) organizationSlugs.set(row.id(), row.s("slug"));

  const slugsByProfile = new Map<number, { slug: string; order: number }[]>();

  for await (const row of ctx.rows("judge_profile_organizations")) {
    const slug = organizationSlugs.get(row.n("organization_id"));

    if (slug === undefined) continue;
    const list = slugsByProfile.get(row.n("profile_id")) ?? [];
    list.push({ slug, order: row.n("sort_value") });
    slugsByProfile.set(row.n("profile_id"), list);
  }

  // profile id -> auth_user id, plus the per user columns the user row needs.
  const profileToUser = new Map<number, number>();

  const totpByUser = new Map<
    number,
    { enabled: boolean; totpKey: Buffer | null; scratchCodes: Buffer | null }
  >();

  const profileByUser = new Map<
    number,
    { timezone: string; languageKey: string | null; slugs: string | null }
  >();

  for await (const row of ctx.rows("judge_profile")) {
    const legacyUserId = row.n("user_id");
    profileToUser.set(row.id(), legacyUserId);
    totpByUser.set(legacyUserId, {
      enabled: row.b("is_totp_enabled"),
      totpKey: row.blob("totp_key"),
      scratchCodes: row.blob("scratch_codes"),
    });

    const slugs = (slugsByProfile.get(row.id()) ?? [])
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.slug);

    profileByUser.set(legacyUserId, {
      timezone: row.s("timezone"),
      languageKey: languageKeys.get(row.n("language_id")) ?? null,
      // The registration form stores this as a comma separated list of slugs.
      slugs: slugs.length > 0 ? slugs.join(",") : null,
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
    const profile = profileByUser.get(legacyUserId);
    users.push({
      id,
      name: username,
      email,
      email_verified: row.b("is_active"),
      image: null,
      created_at: new Date(joined),
      updated_at: new Date(joined),
      username,
      display_username: username,
      two_factor_enabled: totp?.enabled === true && totp.totpKey !== null,
      role: row.b("is_superuser") ? "admin" : "user",
      banned: false,
      ban_reason: null,
      ban_expires: null,
      is_staff: row.b("is_staff"),
      is_superuser: row.b("is_superuser"),
      timezone: profile?.timezone || null,
      preferred_language: profile?.languageKey ?? null,
      organization_slugs: profile?.slugs ?? null,
    });
    stats.users++;

    const password = row.s("password");

    if (password === "" || password.startsWith("!")) {
      stats.unusablePasswords++;
      ctx.report.warn("betterAuth.account", "unusable Django password, no credential account", legacyUserId);
    } else {
      accounts.push({
        id: `${id}-credential`,
        account_id: id,
        provider_id: "credential",
        user_id: id,
        password,
        created_at: new Date(joined),
        updated_at: new Date(joined),
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
        secret: symmetricEncrypt(options.authSecret, secret),
        backup_codes: encodeBackupCodes(options.authSecret, codes),
        user_id: id,
        verified: true,
        failed_verification_count: 0,
        locked_until: null,
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
      public_key: base64urlToBase64(row.s("public_key")),
      user_id: id,
      credential_id: row.s("cred_id"),
      counter: row.n("counter"),
      device_type: "multiDevice",
      backed_up: false,
      transports: "",
      created_at: new Date(),
      aaguid: null,
    });
    stats.passkeys++;
  }

  return { users, accounts, twoFactors, passkeys, stats };
}
