import { TitleRow } from "@moj/ui";
import { requireAccount } from "@/auth/account-state";
import { accountTabs } from "@/components/accounts/AccountTabs";
import { PasskeyManager } from "./PasskeyManager";

export const metadata = { title: "Passkeys" };
export const dynamic = "force-dynamic";

export default async function PasskeysPage() {
  const account = await requireAccount("/accounts/2fa/webauthn/attest/");
  return (
    <>
      <TitleRow title="Passkeys" tabs={accountTabs()} active="passkeys" />
      <div id="content-body" className="max-w-[52rem]">
        <PasskeyManager
          passkeys={account.passkeys}
          lastFactorLocked={account.mustKeepTwoFactor && !account.totpEnabled}
        />
      </div>
    </>
  );
}
