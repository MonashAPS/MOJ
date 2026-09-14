import { Alert, AlertDescription, AlertTitle, Badge, Button, Panel } from "@moj/ui";
import { AlertCircle, Database, Fingerprint, KeyRound, Mail, ShieldCheck, Terminal } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("users.account");
  return (
    <>
      <Panel title={t("account")} icon={<KeyRound size={14} aria-hidden />}>
        <div className="grid divide-y divide-border">
          <Row label={t("username")}>
            <span className="font-mono">{account.username}</span>
          </Row>
          <Row label={t("email")}>{account.email}</Row>
        </div>
        <div className="mt-3 grid gap-2">
          <Button asChild variant="secondary" size="sm" icon={<Mail aria-hidden />}>
            <Link href="/accounts/email/change/">{t("changeEmail")}</Link>
          </Button>
          <Button asChild variant="secondary" size="sm" icon={<KeyRound aria-hidden />}>
            <Link href="/accounts/password/change/">{t("changePassword")}</Link>
          </Button>
        </div>
      </Panel>

      <Panel title={t("security")} icon={<ShieldCheck size={14} aria-hidden />}>
        <div className="grid divide-y divide-border">
          <Row label={t("authenticatorApp")}>
            <Badge variant={account.totpEnabled ? "good" : "outline"}>
              {account.totpEnabled ? t("on") : t("off")}
            </Badge>
          </Row>
          <Row label={t("passkeys")}>
            <span className="font-mono tabular-nums">{account.passkeys.length}</span>
          </Row>
          <Row label={t("scratchCodes")}>
            <span className="font-mono tabular-nums">
              {account.totpEnabled ? account.scratchCodesLeft : "—"}
            </span>
          </Row>
        </div>
        <div className="mt-3 grid gap-2">
          <Button asChild variant="secondary" size="sm" icon={<ShieldCheck aria-hidden />}>
            <Link href="/accounts/2fa/">
              {account.totpEnabled ? t("manageTwoFactor") : t("enableTwoFactor")}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" icon={<Fingerprint aria-hidden />}>
            <Link href="/accounts/2fa/webauthn/attest/">
              {account.passkeys.length > 0 ? t("managePasskeys") : t("registerPasskey")}
            </Link>
          </Button>
        </div>
        {account.mustKeepTwoFactor ? (
          <Alert variant="info" className="mt-3">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{t("twoFactorLocked")}</AlertTitle>
          </Alert>
        ) : null}
      </Panel>

      <Panel title={t("apiToken")} icon={<Terminal size={14} aria-hidden />}>
        <div className="grid divide-y divide-border">
          <Row label={t("tokens")}>
            <span className="font-mono tabular-nums">{tokenCount}</span>
          </Row>
          <Row label={t("legacyToken")}>
            <Badge variant={legacyToken ? "warn" : "outline"}>
              {legacyToken ? t("legacyTokenValid") : t("legacyTokenNone")}
            </Badge>
          </Row>
        </div>
        <div className="mt-3 grid gap-2">
          <Button asChild variant="secondary" size="sm" icon={<Terminal aria-hidden />}>
            <Link href="/accounts/api/token/generate/">
              {tokenCount > 0 || legacyToken ? t("manageTokens") : t("generateToken")}
            </Link>
          </Button>
        </div>
      </Panel>

      <Panel title={t("yourData")} icon={<Database size={14} aria-hidden />}>
        <p className="text-base text-subtle">{t("yourDataBody")}</p>
        <div className="mt-3">
          <Button asChild variant="secondary" size="sm" icon={<Database aria-hidden />}>
            <Link href="/data/prepare/">{t("downloadData")}</Link>
          </Button>
        </div>
      </Panel>

      <Alert variant="info">
        <AlertCircle className="size-3.5" aria-hidden />
        <AlertTitle>{t("usernamePermanent")}</AlertTitle>
        <AlertDescription>{t("usernamePermanentBody")}</AlertDescription>
      </Alert>
    </>
  );
}
