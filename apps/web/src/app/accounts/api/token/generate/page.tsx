import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle, TitleRow } from "@moj/ui";
import { Info } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireAccount } from "@/auth/account-state";
import { accountTabs } from "@/components/accounts/AccountTabs";
import { queryAsViewer } from "@/lib/convex-server";
import { ApiTokenPanel } from "./ApiTokenPanel";
import { listApiTokens } from "./actions";

export async function generateMetadata() {
  const t = await getTranslations("auth.apiToken");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function ApiTokenPage() {
  await requireAccount("/accounts/api/token/generate/");
  const [tokens, legacy] = await Promise.all([
    listApiTokens(),
    queryAsViewer(api.profiles.apiTokens.mine, {}).catch(() => null),
  ]);
  const t = await getTranslations("auth.apiToken");

  return (
    <>
      <TitleRow title={t("title")} tabs={await accountTabs()} active="token" />
      <div id="content-body" className="grid max-w-[52rem] gap-4">
        <ApiTokenPanel
          tokens={tokens}
          legacy={{
            present: Boolean(legacy?.hasLegacyToken),
            hint: legacy?.legacyTokenHint ?? null,
          }}
        />
        <Alert variant="info">
          <Info className="size-3.5" aria-hidden />
          <AlertTitle>{t("bearerTitle")}</AlertTitle>
          <AlertDescription>
            <code className="font-mono text-mono">Authorization: Bearer &lt;token&gt;</code>
            <p>{t("bearerNote")}</p>
          </AlertDescription>
        </Alert>
      </div>
    </>
  );
}
