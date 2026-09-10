"use client";

import { Alert, AlertTitle, Button, Field, Input } from "@moj/ui";
import { AlertCircle, Fingerprint, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { OneTimeCode } from "@/components/auth/OneTimeCode";

/** DMOJ's `two_factor_auth` page. The password step has already happened and
 *  Better Auth is holding an unredeemed challenge; nothing is signed in until
 *  one of these verifies. */
export function TwoFactorChallenge({ next, hasTotp }: { next: string; hasTotp: boolean }) {
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
        setError(
          result.error.status === 429
            ? "Too many tries. Wait a few minutes and start again."
            : "That code is not right. Wait for the next one and try again.",
        );
        return;
      }
      finish();
    } catch {
      setError("Something went wrong. Try again.");
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
        setError("That scratch code is not right, or it has already been used.");
        return;
      }
      finish();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Two factor authentication"
      subtitle={
        scratch
          ? "Enter one of the scratch codes you saved."
          : "Enter the six digit code from your authenticator app."
      }
      footer={
        <span>
          Lost your phone and your codes? <Link href="/tickets/">Open a ticket</Link> and a staff member can
          help.
        </span>
      }
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
          <Field label="Scratch code" htmlFor="challenge-scratch">
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
            label="Authentication code"
            hint="Six digits from your authenticator app. The boxes advance as you type."
            value={code}
            onChange={setCode}
            onComplete={(value) => void verifyTotp(value)}
            invalid={!!error}
            autoFocus
          />
        )}

        <div className="mt-5 grid gap-2">
          <Button type="submit" full busy={busy}>
            {busy ? "Checking…" : "Log in"}
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
              {scratch ? "Use your authenticator app" : "Use a scratch code"}
            </Button>
          ) : null}

          <Button asChild variant="secondary" full icon={<Fingerprint aria-hidden />}>
            <Link href={`/accounts/2fa/webauthn/assert/?next=${encodeURIComponent(next)}`}>
              Use a passkey
            </Link>
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
