import { Alert, AlertDescription, AlertTitle, TitleRow } from "@moj/ui";
import { Info } from "lucide-react";
import { requireAccount } from "@/auth/account-state";
import { accountTabs } from "@/components/accounts/AccountTabs";
import { EmailChangeForm } from "./EmailChangeForm";

export const metadata = { title: "Change your email" };
export const dynamic = "force-dynamic";

export default async function EmailChangePage() {
  const account = await requireAccount("/accounts/email/change/");
  return (
    <>
      <TitleRow title="Change your email" tabs={accountTabs()} active="email" />
      <div id="content-body" className="grid max-w-[52rem] gap-4">
        <EmailChangeForm currentEmail={account.email} />
        <Alert variant="info">
          <Info className="size-3.5" aria-hidden />
          <AlertTitle>Your address is only ever used for the judge.</AlertTitle>
          <AlertDescription>
            Activation, password resets and the gravatar on your profile. Nothing else.
          </AlertDescription>
        </Alert>
      </div>
    </>
  );
}
