import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { admin, bearer, jwt, twoFactor, username } from "better-auth/plugins";
import { haveIBeenPwned, isPasswordCompromised } from "better-auth/plugins/haveibeenpwned";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { DISPOSABLE_EMAIL_KEY, isDisposableEmail } from "./disposable-email";
import { isDjangoHash, isUnusablePassword, verifyDjangoPassword } from "./django-hash";
import {
  activationEmail,
  emailChangeActivationEmail,
  emailChangeNotifyEmail,
  passwordResetEmail,
  rememberLink,
  sendMail,
  twoFactorNoticeEmail,
} from "./mail";
import { COMPROMISED_COOKIE } from "./password-compromised";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const issuer = process.env.AUTH_ISSUER ?? appUrl;

/** DMOJ's `DMOJ_REQUIRE_STAFF_2FA`: staff must keep a second factor, so the last
 *  one cannot be taken away. The pages hide the control; this is the check that
 *  actually holds, because the endpoint is reachable without them. */
async function remainingFactorsAfterRemoval(
  userId: string,
  removing: "totp" | "passkey",
  passkeyId?: string,
): Promise<number> {
  const [passkeys, totps] = await Promise.all([
    db.select({ id: schema.passkey.id }).from(schema.passkey).where(eq(schema.passkey.userId, userId)),
    db.select({ id: schema.twoFactor.id }).from(schema.twoFactor).where(eq(schema.twoFactor.userId, userId)),
  ]);

  const totpCount = removing === "totp" ? 0 : totps.length;

  const passkeyCount =
    removing === "passkey" ? passkeys.filter((row) => row.id !== passkeyId).length : passkeys.length;

  return totpCount + passkeyCount;
}

type VerificationTarget = { email?: string; updateTo?: string };

function isVerificationTarget(claims: unknown): claims is VerificationTarget {
  if (typeof claims !== "object" || claims === null) return false;
  const email = "email" in claims ? claims.email : undefined;
  const updateTo = "updateTo" in claims ? claims.updateTo : undefined;

  return (
    (email === undefined || typeof email === "string") &&
    (updateTo === undefined || typeof updateTo === "string")
  );
}

/** Better Auth signs verification tokens as JWTs. A change-of-address token
 *  carries `updateTo`, which is how the mail callback tells the two apart. */
function verificationTarget(token: string): VerificationTarget {
  try {
    const payload = token.split(".")[1];

    if (!payload) return {};

    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    return isVerificationTarget(claims) ? claims : {};
  } catch {
    return {};
  }
}

/** The fields Better Auth's own user type carries. `username` and `isStaff` reach
 *  the row through a plugin and `user.additionalFields`, neither of which widens it. */
type AuthUser = { id: string; name: string; email: string };

function hasUsername(user: AuthUser): user is AuthUser & { username: string } {
  return "username" in user && typeof user.username === "string";
}

function pluginUsername(user: AuthUser): string | null {
  return hasUsername(user) ? user.username : null;
}

function isStaffAccount(user: AuthUser): boolean {
  return "isStaff" in user && Boolean(user.isStaff);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** A hook runs after the handler answered; that answer sits on the context. */
function isAnsweredWithStatus(returned: unknown): returned is { status: number } {
  return (
    typeof returned === "object" &&
    returned !== null &&
    "status" in returned &&
    typeof returned.status === "number" &&
    Boolean(returned.status)
  );
}

/** DMOJ stored Django hashes. On the first successful legacy login we rewrite
 *  the row in Better Auth's own format so the slow path is only ever taken once
 *  per account. The Django hash is unique per account (random salt), so it is a
 *  safe key to match on from inside `verify`, which is not given the user id. */
async function rehashLegacyPassword(legacyHash: string, password: string): Promise<void> {
  try {
    const rehashed = await hashPassword(password);
    await db
      .update(schema.account)
      .set({ password: rehashed })
      .where(eq(schema.account.password, legacyHash));
  } catch (error) {
    // Never fail a valid login because the upgrade could not be written.
    console.warn("could not rehash legacy password", error);
  }
}

export const auth = betterAuth({
  appName: "MOJ",
  baseURL: appUrl,
  secret: process.env.AUTH_SECRET,
  trustedOrigins: [appUrl],

  database: drizzleAdapter(db, { provider: "pg", schema }),

  user: {
    additionalFields: {
      isStaff: { type: "boolean", defaultValue: false, input: false, returned: true },
      isSuperuser: { type: "boolean", defaultValue: false, input: false, returned: true },
      timezone: { type: "string", required: false, input: true, returned: true },
      preferredLanguage: { type: "string", required: false, input: true, returned: true },
      organizationSlugs: { type: "string", required: false, input: true, returned: true },
    },
    changeEmail: { enabled: true },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: false,
    password: {
      hash: (password) => hashPassword(password),
      verify: async ({ hash, password }) => {
        if (isUnusablePassword(hash)) return false;

        if (isDjangoHash(hash)) {
          const ok = verifyDjangoPassword(password, hash);

          if (ok) await rehashLegacyPassword(hash, password);

          return ok;
        }

        return verifyPassword({ hash, password });
      },
    },
    sendResetPassword: async ({ user, token }) => {
      // DMOJ puts the token in the path; the confirm page hands it back to
      // Better Auth's /reset-password, so the link never leaves the site.
      const url = `${appUrl}/accounts/reset/confirm/${token}/`;
      const mail = passwordResetEmail(user.name || user.email, url);
      rememberLink(user.email, "reset", url);
      await sendMail({ ...mail, to: user.email });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24 * 7,
    sendVerificationEmail: async ({ user, token }) => {
      const { email: previousEmail, updateTo } = verificationTarget(token);

      // A change of address, as DMOJ does it: the link goes to the new address
      // and the old one is told that somebody asked (judge/views/user.py).
      if (updateTo) {
        const url = `${appUrl}/accounts/email/change/activate/${token}/`;
        const name = user.name || updateTo;
        rememberLink(updateTo, "email-change", url);
        await sendMail({ ...emailChangeActivationEmail(name, url), to: updateTo });

        if (previousEmail && previousEmail !== updateTo) {
          await sendMail({ ...emailChangeNotifyEmail(name, updateTo), to: previousEmail });
        }

        return;
      }

      const url = `${appUrl}/accounts/activate/${token}/`;
      const mail = activationEmail(user.name || user.email, url);
      rememberLink(user.email, "activation", url);
      await sendMail({ ...mail, to: user.email });
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  advanced: {
    cookiePrefix: "moj",
  },

  // DMOJ throttles password resets and email changes at ten a minute
  // (DMOJ_PASSWORD_RESET_LIMIT_*, DMOJ_EMAIL_CHANGE_LIMIT_*). The same budget
  // covers the login prompt, which is more forgiving than Better Auth's default
  // of three in ten seconds: somebody who mistypes twice is not an attacker.
  rateLimit: {
    enabled: true,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-in/username": { window: 60, max: 10 },
      "/request-password-reset": { window: 60, max: 10 },
      "/forget-password": { window: 60, max: 10 },
      "/change-email": { window: 60, max: 10 },
      "/send-verification-email": { window: 60, max: 10 },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" || ctx.path === "/change-email") {
        const address = String(ctx.body?.email ?? ctx.body?.newEmail ?? "");

        if (isDisposableEmail(address)) {
          throw new APIError("BAD_REQUEST", { message: DISPOSABLE_EMAIL_KEY });
        }
      }

      if (ctx.path === "/two-factor/disable" || ctx.path === "/passkey/delete-passkey") {
        const session = await getSessionFromCtx(ctx);
        const user = session?.user;

        if (!user || !isStaffAccount(user)) return;

        const remaining =
          ctx.path === "/two-factor/disable"
            ? await remainingFactorsAfterRemoval(user.id, "totp")
            : await remainingFactorsAfterRemoval(user.id, "passkey", String(ctx.body?.id ?? ""));

        if (remaining < 1) {
          throw new APIError("BAD_REQUEST", {
            message: "Staff accounts must keep two factor authentication enabled.",
          });
        }
      }
    }),

    after: createAuthMiddleware(async (ctx) => {
      // DMOJ checks the password typed at the login prompt against Have I Been
      // Pwned and, on a hit, forces a change before anything else can be read.
      if (ctx.path === "/sign-in/email" || ctx.path === "/sign-in/username") {
        const password: unknown = ctx.body?.password;

        if (!isNonEmptyString(password)) return;
        const returned: unknown = ctx.context.returned;

        if (returned instanceof APIError || isAnsweredWithStatus(returned)) return;

        try {
          if (await isPasswordCompromised(password)) {
            ctx.setCookie(COMPROMISED_COOKIE, "1", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 });

            return;
          }
        } catch {
          // A login must never fail because the breach service was unreachable.
        }

        // DMOJ keeps the flag in the session, so it dies with it. The cookie
        // outlives a sign-out, so a clean login has to clear it or the next
        // account inherits the last one's interstitial.
        ctx.setCookie(COMPROMISED_COOKIE, "", { path: "/", maxAge: 0 });

        return;
      }

      if (ctx.path === "/change-password" || ctx.path === "/reset-password" || ctx.path === "/sign-out") {
        ctx.setCookie(COMPROMISED_COOKIE, "", { path: "/", maxAge: 0 });

        return;
      }

      // Gaining or losing a second factor is the change an account takeover
      // makes first, so the owner is told out of band. A mail failure must not
      // turn a successful enrolment into an error.
      if (ctx.path === "/two-factor/enable" || ctx.path === "/two-factor/disable") {
        const returned: unknown = ctx.context.returned;

        if (returned instanceof APIError || isAnsweredWithStatus(returned)) return;
        const session = await getSessionFromCtx(ctx).catch(() => null);
        const user = session?.user;

        if (!user?.email) return;
        const action = ctx.path === "/two-factor/enable" ? "enabled" : "disabled";

        try {
          await sendMail({
            ...twoFactorNoticeEmail(pluginUsername(user) || user.name || user.email, action),
            to: user.email,
          });
        } catch (error) {
          console.error("could not send the two factor notice", error);
        }
      }
    }),
  },

  plugins: [
    username({
      minUsernameLength: 1,
      maxUsernameLength: 30,
      usernameValidator: (value) => /^\w+$/.test(value),
    }),
    twoFactor({
      issuer: "MOJ",
      totpOptions: { period: 30, digits: 6 },
      backupCodeOptions: { amount: 5, length: 10 },
    }),
    passkey({
      rpID: process.env.AUTH_RP_ID ?? "localhost",
      rpName: "MOJ",
      origin: appUrl,
    }),
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      impersonationSessionDuration: 60 * 60,
    }),
    apiKey({
      defaultKeyLength: 48,
      enableMetadata: true,
    }),
    bearer(),
    // The k-anonymity check DMOJ runs, on the paths that set a password. The
    // login prompt is handled in the after hook instead, because a password that
    // is already on the account must still let its owner in, then make them
    // change it.
    haveIBeenPwned({
      enabled: process.env.HIBP_CHECK !== "off",
      paths: ["/sign-up/email", "/change-password", "/reset-password"],
      customPasswordCompromisedMessage:
        "That password has appeared in a data breach. Choose one that has not.",
    }),
    jwt({
      jwks: { keyPairConfig: { alg: "RS256", modulusLength: 2048 } },
      jwt: {
        issuer,
        audience: "moj",
        expirationTime: "1h",
        getSubject: ({ user }) => user.id,
        definePayload: ({ user }) => ({
          username: pluginUsername(user) ?? user.name,
          isStaff: isStaffAccount(user),
        }),
      },
    }),
  ],
});

export type Auth = typeof auth;
