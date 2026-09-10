import { redirect } from "next/navigation";
import { requireAccount } from "@/auth/account-state";
import { DisableTwoFactorForm } from "./DisableTwoFactorForm";

export const metadata = { title: "Disable two factor authentication" };
export const dynamic = "force-dynamic";

export default async function DisableTwoFactorPage() {
  const account = await requireAccount("/accounts/2fa/disable/");
  if (!account.totpEnabled) redirect("/accounts/2fa/");
  // The server refuses this too (auth/server.ts); the page just says so first.
  return <DisableTwoFactorForm blocked={account.mustKeepTwoFactor && account.passkeys.length === 0} />;
}
