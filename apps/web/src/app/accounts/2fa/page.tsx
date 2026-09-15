import { Alert, AlertDescription, AlertTitle, Badge, Button, Panel, TitleRow } from "@moj/ui";
import { AlertCircle, Fingerprint, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAccount } from "@/auth/account-state";
import { accountTabs } from "@/components/accounts/AccountTabs";
import { safeNext } from "@/lib/next-path";

export async function generateMetadata() {
  const t = await getTranslations("auth.twoFactor.overview");

  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; required?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const account = await requireAccount("/accounts/2fa/");
  const t = await getTranslations("auth.twoFactor");
  const carry = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  const lastFactor = account.mustKeepTwoFactor && account.factorCount <= 1;

  return (
    <>
      <TitleRow title={t("overview.title")} tabs={await accountTabs()} active="two-factor" />
      <div id="content-body" className="grid max-w-[52rem] gap-4">
        {params.required ? (
          <Alert variant="warning">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{t("overview.requiredTitle")}</AlertTitle>
            <AlertDescription>{t("overview.requiredDescription")}</AlertDescription>
          </Alert>
        ) : null}

        <Panel
          title={t("overview.totpPanel")}
          action={
            <Badge variant={account.totpEnabled ? "good" : "outline"}>
              {account.totpEnabled ? t("overview.on") : t("overview.off")}
            </Badge>
          }
        >
          <div className="grid gap-3">
            <p className="text-base text-subtle">{t("overview.totpDescription")}</p>
            <div className="flex flex-wrap items-center gap-2">
              {account.totpEnabled ? (
                <>
                  <Button asChild variant="secondary" icon={<ShieldCheck aria-hidden />}>
                    <Link href={`/accounts/2fa/edit/${carry}`}>{t("overview.newScratchCodes")}</Link>
                  </Button>
                  {lastFactor ? (
                    <Button variant="secondary" disabled title={t("overview.turnOffLocked")}>
                      {t("overview.turnOff")}
                    </Button>
                  ) : (
                    <Button asChild variant="secondary">
                      <Link href="/accounts/2fa/disable/">{t("overview.turnOff")}</Link>
                    </Button>
                  )}
                </>
              ) : (
                <Button asChild icon={<ShieldCheck aria-hidden />}>
                  <Link href={`/accounts/2fa/enable/${carry}`}>{t("overview.setUpTotp")}</Link>
                </Button>
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title={t("overview.scratchPanel")}
          action={
            // `mono` uppercases, which is right for a count and wrong for a word.
            account.totpEnabled ? (
              <Badge variant={account.scratchCodesLeft > 0 ? "neutral" : "outline"} mono>
                {t("overview.scratchCount", { left: account.scratchCodesLeft })}
              </Badge>
            ) : (
              <Badge variant="outline">{t("overview.scratchNone")}</Badge>
            )
          }
        >
          <div className="grid gap-3">
            <p className="text-base text-subtle">
              {account.totpEnabled ? t("overview.scratchDescription") : t("overview.scratchDescriptionOff")}
            </p>
            {account.totpEnabled && account.scratchCodesLeft <= 1 ? (
              <Alert variant="warning">
                <AlertCircle className="size-3.5" aria-hidden />
                <AlertTitle>{t("overview.scratchLeft", { count: account.scratchCodesLeft })}</AlertTitle>
                <AlertDescription>
                  <Link href={`/accounts/2fa/edit/${carry}`}>{t("overview.generateNewSet")}</Link>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </Panel>

        <Panel
          title={t("overview.passkeysPanel")}
          action={
            <Badge variant={account.passkeys.length > 0 ? "good" : "outline"}>
              {t("overview.passkeyCount", { count: account.passkeys.length })}
            </Badge>
          }
        >
          <div className="grid gap-3">
            <p className="text-base text-subtle">{t("overview.passkeysDescription")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary" icon={<Fingerprint aria-hidden />}>
                <Link href="/accounts/2fa/webauthn/attest/">
                  {account.passkeys.length > 0 ? t("overview.managePasskeys") : t("overview.registerPasskey")}
                </Link>
              </Button>
            </div>
          </div>
        </Panel>

        {account.mustKeepTwoFactor ? (
          <Alert variant="info">
            <KeyRound className="size-3.5" aria-hidden />
            <AlertTitle>{t("staffRequired")}</AlertTitle>
            <AlertDescription>{t("overview.staffRequiredDescription")}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </>
  );
}
