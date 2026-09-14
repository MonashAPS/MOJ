import { Alert, AlertDescription, AlertTitle, TitleRow } from "@moj/ui";
import { Info } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireAccount } from "@/auth/account-state";
import { accountTabs } from "@/components/accounts/AccountTabs";
import { EmailChangeForm } from "./EmailChangeForm";

export async function generateMetadata() {
  const t = await getTranslations("auth.emailChange");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function EmailChangePage() {
  const account = await requireAccount("/accounts/email/change/");
  const t = await getTranslations("auth.emailChange");
  return (
    <>
      <TitleRow title={t("title")} tabs={await accountTabs()} active="email" />
      <div id="content-body" className="grid max-w-[52rem] gap-4">
        <EmailChangeForm currentEmail={account.email} />
        <Alert variant="info">
          <Info className="size-3.5" aria-hidden />
          <AlertTitle>{t("privacyTitle")}</AlertTitle>
          <AlertDescription>{t("privacyDescription")}</AlertDescription>
        </Alert>
      </div>
    </>
  );
}
