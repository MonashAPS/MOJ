import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAccount } from "@/auth/account-state";
import { safeNext } from "@/lib/next-path";
import { EnableTotpForm } from "./EnableTotpForm";

export async function generateMetadata() {
  const t = await getTranslations("auth.twoFactor.enable");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function EnableTwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const account = await requireAccount("/accounts/2fa/enable/");
  // DMOJ's `check_skip`: there is nothing to enrol if it is already on.
  if (account.totpEnabled) redirect("/accounts/2fa/");
  return <EnableTotpForm next={safeNext(next, "/accounts/2fa/")} />;
}
