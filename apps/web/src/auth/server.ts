import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { admin, bearer, jwt, twoFactor, username } from "better-auth/plugins";
import { haveIBeenPwned, isPasswordCompromised } from "better-auth/plugins/haveibeenpwned";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "./disposable-email";
import { isDjangoHash, isUnusablePassword, verifyDjangoPassword } from "./django-hash";
import {
  activationEmail,
  emailChangeActivationEmail,
  emailChangeNotifyEmail,
  passwordResetEmail,
  rememberLink,
  sendMail,
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

/** Better Auth signs verification tokens as JWTs. A change-of-address token
 *  carries `updateTo`, which is how the mail callback tells the two apart. */
function verificationTarget(token: string): { email?: string; updateTo?: string } {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      updateTo?: string;
    };
  } catch {
    return {};
  }
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
    sendResetPassword: async ({ user, url }) => {
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

  // DMOJ throttles password-reset and email-change requests per address
  // (DMOJ_PASSWORD_RESET_LIMIT_*, DMOJ_EMAIL_CHANGE_LIMIT_*): ten a minute.
  rateLimit: {
    enabled: true,
    customRules: {
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
          throw new APIError("BAD_REQUEST", { message: DISPOSABLE_EMAIL_MESSAGE });
        }
      }

      if (ctx.path === "/two-factor/disable" || ctx.path === "/passkey/delete-passkey") {
        const session = await getSessionFromCtx(ctx);
        const user = session?.user as { id: string; isStaff?: boolean } | undefined;
        if (!user?.isStaff) return;
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
        const password = ctx.body?.password;
        if (typeof password !== "string" || !password) return;
        const returned = ctx.context.returned as { status?: number } | undefined;
        if (returned instanceof APIError || returned?.status) return;
        try {
          if (await isPasswordCompromised(password)) {
            ctx.setCookie(COMPROMISED_COOKIE, "1", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 });
          }
        } catch {
          // A login must never fail because the breach service was unreachable.
        }
        return;
      }

      if (ctx.path === "/change-password" || ctx.path === "/reset-password") {
        ctx.setCookie(COMPROMISED_COOKIE, "", { path: "/", maxAge: 0 });
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
          username: (user as { username?: string }).username ?? user.name,
          isStaff: Boolean((user as { isStaff?: boolean }).isStaff),
        }),
      },
    }),
  ],
});

export type Auth = typeof auth;
