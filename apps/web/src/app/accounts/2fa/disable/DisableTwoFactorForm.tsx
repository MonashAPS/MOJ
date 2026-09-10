"use client";

import { Alert, AlertDescription, AlertTitle, Button, Field, Input } from "@moj/ui";
import { AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { AuthCard } from "@/components/auth/AuthCard";

/** DMOJ's `TOTPDisableView`: authenticate first, with a live code or a scratch
 *  code, and staff whose only factor this is are refused. */
export function DisableTwoFactorForm({ blocked }: { blocked: boolean }) {
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
        setError("That code is not right, or it has already been used.");
        return;
      }

      const result = await authClient.twoFactor.disable({ password });
      if (result.error) {
        setError(
          result.error.message ??
            "Two factor authentication could not be turned off. Check your password.",
        );
        return;
      }
      router.push("/accounts/2fa/");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Turn off two factor authentication"
      subtitle="Prove it is you before your account drops back to a password alone."
      footer={
        <span>
          Changed your mind? <Link href="/accounts/2fa/">Back to two factor authentication</Link>
        </span>
      }
    >
      {blocked ? (
        <Alert variant="warning">
          <AlertCircle className="size-3.5" aria-hidden />
          <AlertTitle>Staff accounts must keep two factor authentication enabled.</AlertTitle>
          <AlertDescription>
            Register a passkey first if you want to stop using an authenticator app.{" "}
            <Link href="/accounts/2fa/webauthn/attest/">Register a passkey</Link>
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
            <Field label="Password" htmlFor="disable-password">
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

            <Field
              label="Code"
              htmlFor="disable-code"
              hint="Six digits from your app, or one of your scratch codes."
            >
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
              {busy ? "Turning off…" : "Turn off two factor authentication"}
            </Button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
