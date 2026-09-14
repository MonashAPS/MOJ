import { TitleRow } from "@moj/ui";
import { getTranslations } from "next-intl/server";
import { requireAccount } from "@/auth/account-state";
import { accountTabs } from "@/components/accounts/AccountTabs";
import { PasskeyManager } from "./PasskeyManager";

export async function generateMetadata() {
  const t = await getTranslations("auth.twoFactor.passkeys");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function PasskeysPage() {
  const account = await requireAccount("/accounts/2fa/webauthn/attest/");
  const t = await getTranslations("auth.twoFactor.passkeys");
  return (
    <>
      <TitleRow title={t("title")} tabs={await accountTabs()} active="passkeys" />
      <div id="content-body" className="max-w-[52rem]">
        <PasskeyManager
          passkeys={account.passkeys}
          lastFactorLocked={account.mustKeepTwoFactor && !account.totpEnabled}
        />
      </div>
    </>
  );
}
