"use client";

import { Alert, AlertTitle, Button, Field, Input } from "@moj/ui";
import { AlertCircle, Fingerprint, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { OneTimeCode } from "@/components/auth/OneTimeCode";

/** DMOJ's `two_factor_auth` page. The password step has already happened and
 *  Better Auth is holding an unredeemed challenge; nothing is signed in until
 *  one of these verifies. */
export function TwoFactorChallenge({ next, hasTotp }: { next: string; hasTotp: boolean }) {
  const t = useTranslations("auth.twoFactor.challenge");
  const tError = useTranslations("auth.errors");
  const router = useRouter();
  const [scratch, setScratch] = useState(!hasTotp);
  const [code, setCode] = useState("");
  const [scratchCode, setScratchCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function finish() {
    router.push(next);
    router.refresh();
  }

  async function verifyTotp(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const result = await authClient.twoFactor.verifyTotp({ code: value });

      if (result.error) {
        setError(result.error.status === 429 ? t("tooMany") : t("wrongCode"));

        return;
      }

      finish();
    } catch {
      setError(tError("generic"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyScratch() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const result = await authClient.twoFactor.verifyBackupCode({ code: scratchCode.trim() });

      if (result.error) {
        setError(t("wrongScratchCode"));

        return;
      }

      finish();
    } catch {
      setError(tError("generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={t("title")}
      subtitle={scratch ? t("scratchSubtitle") : t("totpSubtitle")}
      footer={<span>{t.rich("footer", { link: (chunks) => <Link href="/tickets/">{chunks}</Link> })}</span>}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void (scratch ? verifyScratch() : verifyTotp(code));
        }}
        noValidate
      >
        {error ? (
          <Alert variant="danger" className="mb-4">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}

        {scratch ? (
          <Field label={t("scratchLabel")} htmlFor="challenge-scratch">
            <Input
              id="challenge-scratch"
              name="scratchCode"
              autoComplete="one-time-code"
              mono
              autoFocus
              required
              invalid={!!error}
              icon={<KeyRound size={15} aria-hidden />}
              value={scratchCode}
              onChange={(event) => setScratchCode(event.target.value)}
            />
          </Field>
        ) : (
          <OneTimeCode
            label={t("codeLabel")}
            hint={t("codeHint")}
            value={code}
            onChange={setCode}
            onComplete={(value) => void verifyTotp(value)}
            invalid={!!error}
            autoFocus
          />
        )}

        <div className="mt-5 grid gap-2">
          <Button type="submit" full busy={busy}>
            {busy ? t("submitBusy") : t("submit")}
          </Button>

          {hasTotp ? (
            <Button
              variant="ghost"
              full
              onClick={() => {
                setError(null);
                setScratch(!scratch);
              }}
            >
              {scratch ? t("useTotp") : t("useScratch")}
            </Button>
          ) : null}

          <Button asChild variant="secondary" full icon={<Fingerprint aria-hidden />}>
            <Link href={`/accounts/2fa/webauthn/assert/?next=${encodeURIComponent(next)}`}>
              {t("usePasskey")}
            </Link>
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
