import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAccount } from "@/auth/account-state";
import { DisableTwoFactorForm } from "./DisableTwoFactorForm";

export async function generateMetadata() {
  const t = await getTranslations("auth.twoFactor.disable");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function DisableTwoFactorPage() {
  const account = await requireAccount("/accounts/2fa/disable/");
  if (!account.totpEnabled) redirect("/accounts/2fa/");
  // The server refuses this too (auth/server.ts); the page just says so first.
  return <DisableTwoFactorForm blocked={account.mustKeepTwoFactor && account.passkeys.length === 0} />;
}
