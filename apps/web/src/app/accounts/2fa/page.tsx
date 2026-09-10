import { Alert, AlertDescription, AlertTitle, Badge, Button, Panel, TitleRow } from "@moj/ui";
import { AlertCircle, Fingerprint, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { requireAccount } from "@/auth/account-state";
import { accountTabs } from "@/components/accounts/AccountTabs";
import { safeNext } from "@/lib/next-path";

export const metadata = { title: "Two factor authentication" };
export const dynamic = "force-dynamic";

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; required?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const account = await requireAccount("/accounts/2fa/");
  const carry = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  const lastFactor = account.mustKeepTwoFactor && account.factorCount <= 1;

  return (
    <>
      <TitleRow title="Two factor authentication" tabs={accountTabs()} active="two-factor" />
      <div id="content-body" className="grid max-w-[52rem] gap-4">
        {params.required ? (
          <Alert variant="warning">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>Set up two factor authentication to carry on.</AlertTitle>
            <AlertDescription>
              Staff accounts need a second factor. Enrol one and you will be taken back to where you were.
            </AlertDescription>
          </Alert>
        ) : null}

        <Panel
          title="Authenticator app"
          action={
            <Badge variant={account.totpEnabled ? "good" : "outline"}>
              {account.totpEnabled ? "On" : "Off"}
            </Badge>
          }
        >
          <div className="grid gap-3">
            <p className="text-base text-subtle">
              A six digit code from an app on your phone, on top of your password. Codes are accepted with one
              period of tolerance either side, so a slightly wrong clock still works.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {account.totpEnabled ? (
                <>
                  <Button asChild variant="secondary" icon={<ShieldCheck aria-hidden />}>
                    <Link href={`/accounts/2fa/edit/${carry}`}>New scratch codes</Link>
                  </Button>
                  {lastFactor ? (
                    <Button
                      variant="secondary"
                      disabled
                      title="Staff accounts must keep at least one second factor. Register a passkey first."
                    >
                      Turn off
                    </Button>
                  ) : (
                    <Button asChild variant="secondary">
                      <Link href="/accounts/2fa/disable/">Turn off</Link>
                    </Button>
                  )}
                </>
              ) : (
                <Button asChild icon={<ShieldCheck aria-hidden />}>
                  <Link href={`/accounts/2fa/enable/${carry}`}>Set up an authenticator app</Link>
                </Button>
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title="Scratch codes"
          action={
            <Badge variant={account.scratchCodesLeft > 0 ? "neutral" : "outline"} mono>
              {account.totpEnabled ? `${account.scratchCodesLeft} left` : "None"}
            </Badge>
          }
        >
          <div className="grid gap-3">
            <p className="text-base text-subtle">
              {account.totpEnabled
                ? "Single-use codes that stand in for your app when you do not have your phone. Generating a new set replaces the old one."
                : "Scratch codes are issued when you set up an authenticator app."}
            </p>
            {account.totpEnabled && account.scratchCodesLeft <= 1 ? (
              <Alert variant="warning">
                <AlertCircle className="size-3.5" aria-hidden />
                <AlertTitle>
                  {account.scratchCodesLeft === 0
                    ? "You have no scratch codes left."
                    : "You have one scratch code left."}
                </AlertTitle>
                <AlertDescription>
                  <Link href={`/accounts/2fa/edit/${carry}`}>Generate a new set</Link>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="Passkeys"
          action={
            <Badge variant={account.passkeys.length > 0 ? "good" : "outline"}>
              {account.passkeys.length > 0 ? `${account.passkeys.length} registered` : "None registered"}
            </Badge>
          }
        >
          <div className="grid gap-3">
            <p className="text-base text-subtle">
              Touch ID, Windows Hello, a hardware key or your phone. A passkey signs you in on its own and
              counts as a second factor.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary" icon={<Fingerprint aria-hidden />}>
                <Link href="/accounts/2fa/webauthn/attest/">
                  {account.passkeys.length > 0 ? "Manage passkeys" : "Register a passkey"}
                </Link>
              </Button>
            </div>
          </div>
        </Panel>

        {account.mustKeepTwoFactor ? (
          <Alert variant="info">
            <KeyRound className="size-3.5" aria-hidden />
            <AlertTitle>Staff accounts must keep two factor authentication enabled.</AlertTitle>
            <AlertDescription>
              You can swap one factor for another, but the last one cannot be removed.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </>
  );
}
