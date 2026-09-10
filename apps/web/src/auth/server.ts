import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { admin, bearer, jwt, twoFactor, username } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { isDjangoHash, isUnusablePassword, verifyDjangoPassword } from "./django-hash";
import { activationEmail, passwordResetEmail, rememberLink, sendMail } from "./mail";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const issuer = process.env.AUTH_ISSUER ?? appUrl;

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
