import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./server";

export type PasskeySummary = {
  id: string;
  name: string;
  createdAt: number | null;
  deviceType: string | null;
  backedUp: boolean;
};

export type AccountSecurity = {
  userId: string;
  username: string;
  email: string;
  isStaff: boolean;
  totpEnabled: boolean;
  scratchCodesLeft: number;
  passkeys: PasskeySummary[];
  /** DMOJ's `DMOJ_REQUIRE_STAFF_2FA` rule, evaluated for this account. */
  factorCount: number;
  mustKeepTwoFactor: boolean;
};

/** Everything the account pages need about the signed-in user's second factors,
 *  read through Better Auth's server API rather than the tables. */
async function readAccountSecurity(): Promise<AccountSecurity | null> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) return null;

  const { user } = session;

  const [passkeyRows, backupCodes] = await Promise.all([
    auth.api.listPasskeys({ headers: requestHeaders }).catch(() => []),
    auth.api
      .viewBackupCodes({ body: { userId: user.id } })
      .then((result) => result.backupCodes ?? [])
      .catch(() => []),
  ]);

  const passkeys: PasskeySummary[] = passkeyRows.map((row, index) => ({
    id: row.id,
    name: row.name || `Passkey ${index + 1}`,
    createdAt: row.createdAt ? new Date(row.createdAt).getTime() : null,
    deviceType: row.deviceType ?? null,
    backedUp: Boolean(row.backedUp),
  }));

  const totpEnabled = Boolean(user.twoFactorEnabled);
  const isStaff = Boolean(user.isStaff);
  const factorCount = (totpEnabled ? 1 : 0) + passkeys.length;

  return {
    userId: user.id,
    username: user.username || user.name,
    email: user.email,
    isStaff,
    totpEnabled,
    scratchCodesLeft: totpEnabled ? backupCodes.length : 0,
    passkeys,
    factorCount,
    mustKeepTwoFactor: isStaff,
  };
}

/** The account pages are all behind a session; an anonymous visitor goes to the
 *  login page and comes back to where they were headed. */
export async function requireAccount(next: string): Promise<AccountSecurity> {
  const account = await readAccountSecurity();

  if (!account) redirect(`/accounts/login/?next=${encodeURIComponent(next)}`);

  return account;
}
