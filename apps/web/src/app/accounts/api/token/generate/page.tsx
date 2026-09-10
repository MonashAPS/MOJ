import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle, TitleRow } from "@moj/ui";
import { Info } from "lucide-react";
import Link from "next/link";
import { requireAccount } from "@/auth/account-state";
import { accountTabs } from "@/components/accounts/AccountTabs";
import { queryAsViewer } from "@/lib/convex-server";
import { ApiTokenPanel } from "./ApiTokenPanel";
import { listApiTokens } from "./actions";

export const metadata = { title: "API token" };
export const dynamic = "force-dynamic";

export default async function ApiTokenPage() {
  await requireAccount("/accounts/api/token/generate/");
  const [tokens, legacy] = await Promise.all([
    listApiTokens(),
    queryAsViewer(api.profiles.myApiToken, {}).catch(() => null),
  ]);

  return (
    <>
      <TitleRow title="API token" tabs={accountTabs()} active="token" />
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
          <AlertTitle>Send it as a bearer token.</AlertTitle>
          <AlertDescription>
            <code className="font-mono text-mono">Authorization: Bearer &lt;token&gt;</code>. A token never
            has more access than you do. See <Link href="/about/">the API reference</Link> for the endpoints.
          </AlertDescription>
        </Alert>
      </div>
    </>
  );
}
