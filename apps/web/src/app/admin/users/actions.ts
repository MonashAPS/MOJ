"use server";

import { api } from "@convex/_generated/api";
import { and, eq, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePermission, requireSuperuser } from "@/auth/console";
import { db, schema } from "@/auth/db";
import { auth } from "@/auth/server";
import { type ActionResult, applySetCookies, authHeaders, failed } from "@/lib/actions";
import { mutateAsViewer } from "@/lib/convex-server";

const CHANGE_PROFILE = "judge.change_profile";

export type AccountRow = {
  userId: string;
  username: string;
  email: string;
  emailVerified: boolean;
  banned: boolean;
  banReason: string | null;
  twoFactorEnabled: boolean;
  role: string | null;
};

export type PasskeyRow = {
  id: string;
  name: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: number | null;
  transports: string | null;
};

/**
 * The Convex profile carries the username, but the email lives only in Better
 * Auth, so searching by email has to happen here. Returns the usernames the
 * console then looks up through `admin/users.list`.
 */
export async function searchAccountsAction(term: string): Promise<ActionResult<AccountRow[]>> {
  try {
    await requirePermission(CHANGE_PROFILE);
    const needle = term.trim();

    if (needle.length < 2) return { ok: true, data: [] };

    const rows = await db
      .select({
        userId: schema.user.id,
        username: schema.user.username,
        email: schema.user.email,
        emailVerified: schema.user.emailVerified,
        banned: schema.user.banned,
        banReason: schema.user.banReason,
        twoFactorEnabled: schema.user.twoFactorEnabled,
        role: schema.user.role,
      })
      .from(schema.user)
      .where(or(ilike(schema.user.email, `%${needle}%`), ilike(schema.user.username, `%${needle}%`)))
      .limit(25);

    return {
      ok: true,
      data: rows.map((row) => ({
        userId: row.userId,
        username: row.username ?? "",
        email: row.email,
        emailVerified: row.emailVerified,
        banned: row.banned ?? false,
        banReason: row.banReason,
        twoFactorEnabled: row.twoFactorEnabled ?? false,
        role: row.role,
      })),
    };
  } catch (error) {
    return failed(error);
  }
}

/** The account panel on a user's page: email, ban state, factors, passkeys. */
export async function accountForUserAction(
  userId: string,
): Promise<ActionResult<{ account: AccountRow | null; passkeys: PasskeyRow[]; sessions: number }>> {
  try {
    await requirePermission(CHANGE_PROFILE);

    const [row] = await db
      .select({
        userId: schema.user.id,
        username: schema.user.username,
        email: schema.user.email,
        emailVerified: schema.user.emailVerified,
        banned: schema.user.banned,
        banReason: schema.user.banReason,
        twoFactorEnabled: schema.user.twoFactorEnabled,
        role: schema.user.role,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    if (!row) return { ok: true, data: { account: null, passkeys: [], sessions: 0 } };

    const passkeys = await db.select().from(schema.passkey).where(eq(schema.passkey.userId, userId));

    const sessions = await db
      .select({ id: schema.session.id })
      .from(schema.session)
      .where(eq(schema.session.userId, userId));

    return {
      ok: true,
      data: {
        account: {
          userId: row.userId,
          username: row.username ?? "",
          email: row.email,
          emailVerified: row.emailVerified,
          banned: row.banned ?? false,
          banReason: row.banReason,
          twoFactorEnabled: row.twoFactorEnabled ?? false,
          role: row.role,
        },
        passkeys: passkeys.map((key) => ({
          id: key.id,
          name: key.name,
          deviceType: key.deviceType,
          backedUp: key.backedUp,
          createdAt: key.createdAt ? key.createdAt.getTime() : null,
          transports: key.transports,
        })),
        sessions: sessions.length,
      },
    };
  } catch (error) {
    return failed(error);
  }
}

/**
 * DMOJ's "active" checkbox. The profile side is `admin/users.deactivate`; the
 * account side is Better Auth's ban, which also revokes the sessions.
 */
export async function setAccountActiveAction(
  username: string,
  active: boolean,
  reason: string,
): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    await requirePermission(CHANGE_PROFILE);
    const result = await mutateAsViewer(api.admin.users.deactivate, { username, active, reason });
    const requestHeaders = await authHeaders();

    if (active) {
      await auth.api.unbanUser({ body: { userId: result.userId }, headers: requestHeaders });
    } else {
      await auth.api.banUser({
        body: { userId: result.userId, banReason: reason || "Deactivated from the console" },
        headers: requestHeaders,
      });
    }

    revalidatePath(`/admin/users/${username}`);

    return { ok: true, data: { isActive: result.isActive } };
  } catch (error) {
    return failed(error);
  }
}

/** Better Auth's admin plugin mints an impersonation session for one hour. */
export async function impersonateAction(userId: string): Promise<ActionResult<undefined>> {
  try {
    await requireSuperuser();

    const { headers: responseHeaders } = await auth.api.impersonateUser({
      body: { userId },
      headers: await authHeaders(),
      returnHeaders: true,
    });

    await applySetCookies(responseHeaders);

    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}

export async function stopImpersonatingAction(): Promise<ActionResult<undefined>> {
  try {
    const { headers: responseHeaders } = await auth.api.stopImpersonating({
      headers: await authHeaders(),
      returnHeaders: true,
    });

    await applySetCookies(responseHeaders);

    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}

/**
 * "Reset 2FA": drop every TOTP secret and backup-code set the account has and
 * clear the flag, so the member can enrol again. Staff 2FA is enforced by the
 * middleware, so a staff account is asked to re-enrol on its next visit.
 */
export async function resetTwoFactorAction(userId: string): Promise<ActionResult<undefined>> {
  try {
    await requireSuperuser();
    await db.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, userId));
    await db.update(schema.user).set({ twoFactorEnabled: false }).where(eq(schema.user.id, userId));
    await auth.api.revokeUserSessions({ body: { userId }, headers: await authHeaders() });

    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}

export async function removePasskeyAction(
  userId: string,
  passkeyId: string,
): Promise<ActionResult<undefined>> {
  try {
    await requireSuperuser();
    await db
      .delete(schema.passkey)
      .where(and(eq(schema.passkey.id, passkeyId), eq(schema.passkey.userId, userId)));

    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}

export async function revokeSessionsAction(userId: string): Promise<ActionResult<undefined>> {
  try {
    await requirePermission(CHANGE_PROFILE);
    await auth.api.revokeUserSessions({ body: { userId }, headers: await authHeaders() });

    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}
