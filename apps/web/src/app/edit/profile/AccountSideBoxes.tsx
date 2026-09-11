import { Alert, AlertDescription, AlertTitle, Badge, Button, Panel } from "@moj/ui";
import { AlertCircle, Database, Fingerprint, KeyRound, Mail, ShieldCheck, Terminal } from "lucide-react";
import Link from "next/link";
import type { AccountSecurity } from "@/auth/account-state";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-base text-subtle">{label}</span>
      <span className="min-w-0 truncate text-right text-base text-foreground">{children}</span>
    </div>
  );
}

/** DMOJ hangs the account controls off its edit-profile page; these are the
 *  same controls, as side boxes, each one a link to the page that owns it. */
export function AccountSideBoxes({
  account,
  legacyToken,
  tokenCount,
}: {
  account: AccountSecurity;
  legacyToken: boolean;
  tokenCount: number;
}) {
  return (
    <>
      <Panel title="Account" icon={<KeyRound size={14} aria-hidden />}>
        <div className="grid divide-y divide-border">
          <Row label="Username">
            <span className="font-mono">{account.username}</span>
          </Row>
          <Row label="Email">{account.email}</Row>
        </div>
        <div className="mt-3 grid gap-2">
          <Button asChild variant="secondary" size="sm" icon={<Mail aria-hidden />}>
            <Link href="/accounts/email/change/">Change email</Link>
          </Button>
          <Button asChild variant="secondary" size="sm" icon={<KeyRound aria-hidden />}>
            <Link href="/accounts/password/change/">Change password</Link>
          </Button>
        </div>
      </Panel>

      <Panel title="Security" icon={<ShieldCheck size={14} aria-hidden />}>
        <div className="grid divide-y divide-border">
          <Row label="Authenticator app">
            <Badge variant={account.totpEnabled ? "good" : "outline"}>
              {account.totpEnabled ? "On" : "Off"}
            </Badge>
          </Row>
          <Row label="Passkeys">
            <span className="font-mono tabular-nums">{account.passkeys.length}</span>
          </Row>
          <Row label="Scratch codes">
            <span className="font-mono tabular-nums">
              {account.totpEnabled ? account.scratchCodesLeft : "—"}
            </span>
          </Row>
        </div>
        <div className="mt-3 grid gap-2">
          <Button asChild variant="secondary" size="sm" icon={<ShieldCheck aria-hidden />}>
            <Link href="/accounts/2fa/">
              {account.totpEnabled ? "Manage two factor" : "Enable two factor"}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" icon={<Fingerprint aria-hidden />}>
            <Link href="/accounts/2fa/webauthn/attest/">
              {account.passkeys.length > 0 ? "Manage passkeys" : "Register a passkey"}
            </Link>
          </Button>
        </div>
        {account.mustKeepTwoFactor ? (
          <Alert variant="info" className="mt-3">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>Staff accounts must keep two factor authentication enabled.</AlertTitle>
          </Alert>
        ) : null}
      </Panel>

      <Panel title="API token" icon={<Terminal size={14} aria-hidden />}>
        <div className="grid divide-y divide-border">
          <Row label="Tokens">
            <span className="font-mono tabular-nums">{tokenCount}</span>
          </Row>
          <Row label="From the old site">
            <Badge variant={legacyToken ? "warn" : "outline"}>{legacyToken ? "Still valid" : "None"}</Badge>
          </Row>
        </div>
        <div className="mt-3 grid gap-2">
          <Button asChild variant="secondary" size="sm" icon={<Terminal aria-hidden />}>
            <Link href="/accounts/api/token/generate/">
              {tokenCount > 0 || legacyToken ? "Manage tokens" : "Generate a token"}
            </Link>
          </Button>
        </div>
      </Panel>

      <Panel title="Your data" icon={<Database size={14} aria-hidden />}>
        <p className="text-base text-subtle">A zip of your submissions and comments, prepared on request.</p>
        <div className="mt-3">
          <Button asChild variant="secondary" size="sm" icon={<Database aria-hidden />}>
            <Link href="/data/prepare/">Download your data</Link>
          </Button>
        </div>
      </Panel>

      <Alert variant="info">
        <AlertCircle className="size-3.5" aria-hidden />
        <AlertTitle>Your username is permanent.</AlertTitle>
        <AlertDescription>Ask a staff member if it has to change.</AlertDescription>
      </Alert>
    </>
  );
}
