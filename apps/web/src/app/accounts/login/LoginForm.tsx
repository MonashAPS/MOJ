"use client";

import { Alert, AlertTitle, Button, Field, Input, Label } from "@moj/ui";
import { AlertCircle, Fingerprint, KeyRound, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { OneTimeCode } from "@/components/auth/OneTimeCode";

type Stage = "credentials" | "two-factor" | "backup";

const TITLES: Record<Stage, { title: string; subtitle: string }> = {
  credentials: { title: "Log in", subtitle: "Welcome back to the MAPS Online Judge." },
  "two-factor": {
    title: "Two factor authentication",
    subtitle: "Enter the six digit code from your authenticator app.",
  },
  backup: { title: "Backup code", subtitle: "Use one of the scratch codes you saved." },
};

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  function finish() {
    router.push(next);
    router.refresh();
  }

  async function onCredentials(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = username.includes("@")
        ? await authClient.signIn.email({ email: username, password })
        : await authClient.signIn.username({ username, password });

      if (result.error) {
        setError(
          result.error.status === 403
            ? "This account has not been activated. Follow the link in your activation email."
            : "Invalid username or password.",
        );
        return;
      }
      if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
        setStage("two-factor");
        return;
      }
      finish();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyTotp(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: value });
      if (result.error) {
        setError("That code is not right. Try the next one.");
        return;
      }
      finish();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyBackupCode() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.twoFactor.verifyBackupCode({ code: backupCode });
      if (result.error) {
        setError("That backup code is not right, or it has already been used.");
        return;
      }
      finish();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onPasskey() {
    setPasskeyBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) {
        setError("That passkey was not accepted. Use your password instead.");
        return;
      }
      finish();
    } catch {
      // A cancelled WebAuthn prompt is not an error worth shouting about.
      setError(null);
    } finally {
      setPasskeyBusy(false);
    }
  }

  const strip = error ? (
    <Alert variant="danger" className="mb-4">
      <AlertCircle className="size-3.5" aria-hidden />
      <AlertTitle>{error}</AlertTitle>
    </Alert>
  ) : null;

  if (stage === "two-factor" || stage === "backup") {
    const onBackup = stage === "backup";
    return (
      <AuthCard
        title={TITLES[stage].title}
        subtitle={TITLES[stage].subtitle}
        footer={
          <span>
            Locked out? <Link href="/accounts/2fa/">About two factor authentication</Link>
          </span>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void (onBackup ? verifyBackupCode() : verifyTotp(code));
          }}
          noValidate
        >
          {strip}

          {onBackup ? (
            <Field label="Backup code" htmlFor="login-backup-code">
              <Input
                id="login-backup-code"
                name="backupCode"
                autoComplete="one-time-code"
                mono
                required
                invalid={!!error}
                icon={<KeyRound size={15} aria-hidden />}
                value={backupCode}
                onChange={(event) => setBackupCode(event.target.value)}
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
              {busy ? "Checking…" : "Verify"}
            </Button>
            <Button
              variant="ghost"
              full
              onClick={() => {
                setError(null);
                setStage(onBackup ? "two-factor" : "backup");
              }}
            >
              {onBackup ? "Use your authenticator app" : "Use a backup code"}
            </Button>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={TITLES.credentials.title}
      subtitle={TITLES.credentials.subtitle}
      footer={
        <span>
          New here? <Link href="/accounts/register/">Create an account</Link>
        </span>
      }
    >
      <form onSubmit={onCredentials} noValidate>
        {strip}

        <div className="grid gap-4">
          <Field label="Username or email" htmlFor="login-username">
            <Input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              required
              invalid={!!error}
              icon={<User size={15} aria-hidden />}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </Field>

          <div className="grid gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="login-password">Password</Label>
              <Link href="/accounts/password/reset/" className="text-sm">
                Forgot?
              </Link>
            </div>
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              invalid={!!error}
              icon={<KeyRound size={15} aria-hidden />}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <Button type="submit" full busy={busy}>
            {busy ? "Logging in…" : "Log in"}
          </Button>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            variant="secondary"
            full
            busy={passkeyBusy}
            icon={<Fingerprint aria-hidden />}
            onClick={onPasskey}
          >
            {passkeyBusy ? "Waiting for your passkey…" : "Passkey"}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
