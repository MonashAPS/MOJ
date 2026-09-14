import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAccount } from "@/auth/account-state";
import { safeNext } from "@/lib/next-path";
import { RegenerateScratchCodes } from "./RegenerateScratchCodes";

export async function generateMetadata() {
  const t = await getTranslations("auth.twoFactor.scratch");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function EditTwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const account = await requireAccount("/accounts/2fa/edit/");
  // DMOJ's `TOTPEditView.check_skip`: nothing to edit when it is off.
  if (!account.totpEnabled) redirect("/accounts/2fa/");
  return (
    <RegenerateScratchCodes next={safeNext(next, "/accounts/2fa/")} remaining={account.scratchCodesLeft} />
  );
}
