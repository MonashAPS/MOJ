"use client";

import { Alert, AlertTitle, Button, Field, Input, Panel } from "@moj/ui";
import { AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { QrCode } from "@/components/accounts/QrCode";
import { ScratchCodes } from "@/components/accounts/ScratchCodes";
import { AuthCard } from "@/components/auth/AuthCard";
import { OneTimeCode } from "@/components/auth/OneTimeCode";

type Stage = "password" | "scan" | "codes";

function secretFrom(totpUri: string): string {
  try {
    return new URL(totpUri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

/** DMOJ's `TOTPEnableView`: scan, confirm with a live code, then the scratch
 *  codes once. Better Auth wants the password before it will mint a secret, so
 *  that is the first step rather than a hidden one. */
export function EnableTotpForm({ next }: { next: string }) {
  const t = useTranslations("auth.twoFactor.enable");
  const tError = useTranslations("auth.errors");
  const tPassword = useTranslations("auth.password");
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [scratchCodes, setScratchCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.twoFactor.enable({ password, issuer: "MOJ" });
      const enrolment = result.data as { totpURI?: string; backupCodes?: string[] } | null;
      if (result.error || !enrolment?.totpURI) {
        setError(result.error?.status === 400 ? tPassword("wrong") : t("setupFailed"));
        return;
      }
      setTotpUri(enrolment.totpURI);
      setScratchCodes(enrolment.backupCodes ?? []);
      setStage("scan");
    } catch {
      setError(tError("generic"));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: value });
      if (result.error) {
        setError(t("wrongCode"));
        return;
      }
      // No `router.refresh()` here: the page guard sends an account that already
      // has two factor on back to the overview, which would take the scratch
      // codes away before they had been read. The refresh happens on the way out.
      setStage("codes");
    } catch {
      setError(tError("generic"));
    } finally {
      setBusy(false);
    }
  }

  const strip = error ? (
    <Alert variant="danger" className="mb-4">
      <AlertCircle className="size-3.5" aria-hidden />
      <AlertTitle>{error}</AlertTitle>
    </Alert>
  ) : null;

  if (stage === "password") {
    return (
      <AuthCard
        title={t("passwordTitle")}
        subtitle={t("passwordSubtitle")}
        footer={
          <span>{t.rich("footer", { link: (chunks) => <Link href="/accounts/2fa/">{chunks}</Link> })}</span>
        }
      >
        <form onSubmit={start} noValidate>
          {strip}
          <div className="grid gap-4">
            <Field label={t("passwordLabel")} htmlFor="enable-password">
              <Input
                id="enable-password"
                name="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                invalid={!!error}
                icon={<KeyRound size={15} aria-hidden />}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Button type="submit" full busy={busy}>
              {busy ? t("checking") : t("continue")}
            </Button>
          </div>
        </form>
      </AuthCard>
    );
  }

  if (stage === "scan") {
    const secret = secretFrom(totpUri);
    return (
      <AuthCard title={t("scanTitle")} subtitle={t("scanSubtitle")} footer={<span>{t("scanFooter")}</span>}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void confirm(code);
          }}
          noValidate
        >
          {strip}
          <div className="grid gap-4">
            <div className="flex justify-center">
              <QrCode value={totpUri} label={t("qrLabel")} />
            </div>

            <Panel title={t("keyPanel")}>
              <code className="block select-all break-all font-mono text-mono tracking-[.06em] text-foreground">
                {secret}
              </code>
            </Panel>

            <OneTimeCode
              label={t("codeLabel")}
              hint={t("codeHint")}
              value={code}
              onChange={setCode}
              onComplete={(value) => void confirm(value)}
              invalid={!!error}
              autoFocus
            />

            <Button type="submit" full busy={busy}>
              {busy ? t("checking") : t("submit")}
            </Button>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("doneTitle")}
      subtitle={t("doneSubtitle")}
      footer={
        <span>{t.rich("doneFooter", { link: (chunks) => <Link href="/accounts/2fa/">{chunks}</Link> })}</span>
      }
    >
      <div className="grid gap-5">
        <ScratchCodes codes={scratchCodes} />
        <Button
          full
          onClick={() => {
            router.push(next);
            router.refresh();
          }}
        >
          {t("saved")}
        </Button>
      </div>
    </AuthCard>
  );
}
