"use client";

import { Alert, AlertDescription, AlertTitle, Button, Field, Input } from "@moj/ui";
import { AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { AuthCard } from "@/components/auth/AuthCard";

/** DMOJ's `TOTPDisableView`: authenticate first, with a live code or a scratch
 *  code, and staff whose only factor this is are refused. */
export function DisableTwoFactorForm({ blocked }: { blocked: boolean }) {
  const t = useTranslations("auth.twoFactor");
  const tError = useTranslations("auth.errors");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function disable(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // DMOJ takes a six digit code or a scratch code here; both are accepted.
      const digits = code.replace(/\s+/g, "");
      const verified = /^\d{6}$/.test(digits)
        ? await authClient.twoFactor.verifyTotp({ code: digits })
        : await authClient.twoFactor.verifyBackupCode({ code: digits });
      if (verified.error) {
        setError(t("disable.wrongCode"));
        return;
      }

      const result = await authClient.twoFactor.disable({ password });
      if (result.error) {
        setError(result.error.message ?? t("disable.failed"));
        return;
      }
      router.push("/accounts/2fa/");
      router.refresh();
    } catch {
      setError(tError("generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={t("disable.title")}
      subtitle={t("disable.subtitle")}
      footer={
        <span>
          {t.rich("disable.footer", { link: (chunks) => <Link href="/accounts/2fa/">{chunks}</Link> })}
        </span>
      }
    >
      {blocked ? (
        <Alert variant="warning">
          <AlertCircle className="size-3.5" aria-hidden />
          <AlertTitle>{t("staffRequired")}</AlertTitle>
          <AlertDescription>
            {t.rich("disable.blockedDescription", {
              link: (chunks) => <Link href="/accounts/2fa/webauthn/attest/">{chunks}</Link>,
            })}
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={disable} noValidate>
          {error ? (
            <Alert variant="danger" className="mb-4">
              <AlertCircle className="size-3.5" aria-hidden />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          ) : null}

          <div className="grid gap-4">
            <Field label={t("disable.passwordLabel")} htmlFor="disable-password">
              <Input
                id="disable-password"
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

            <Field label={t("disable.codeLabel")} htmlFor="disable-code" hint={t("disable.codeHint")}>
              <Input
                id="disable-code"
                name="code"
                autoComplete="one-time-code"
                inputMode="text"
                mono
                required
                invalid={!!error}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>

            <Button type="submit" variant="danger" full busy={busy}>
              {busy ? t("disable.submitBusy") : t("disable.submit")}
            </Button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
