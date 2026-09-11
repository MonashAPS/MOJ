"use client";

import { Alert, AlertDescription, AlertTitle, Button, Field, Input, Label } from "@moj/ui";
import { AlertCircle, Fingerprint, KeyRound, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { resendActivation } from "./actions";

type Failure = { message: string; needsActivation?: boolean };

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<Failure | null>(initialError ? { message: initialError } : null);
  const [resent, setResent] = useState(false);
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
    setResent(false);
    try {
      const result = username.includes("@")
        ? await authClient.signIn.email({ email: username, password })
        : await authClient.signIn.username({ username, password });

      if (result.error) {
        setError(
          result.error.status === 403
            ? { message: "This account has not been activated.", needsActivation: true }
            : { message: "Invalid username or password." },
        );
        return;
      }

      // Better Auth holds the sign-in until a second factor is verified. Nothing
      // is signed in yet, so the challenge gets its own page.
      const data = result.data as { twoFactorRedirect?: boolean; twoFactorMethods?: string[] } | null;
      if (data?.twoFactorRedirect) {
        const methods = (data.twoFactorMethods ?? ["totp"]).join(",");
        router.push(
          `/accounts/login/2fa/?next=${encodeURIComponent(next)}&methods=${encodeURIComponent(methods)}`,
        );
        return;
      }
      finish();
    } catch {
      setError({ message: "Something went wrong. Try again." });
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
        setError({ message: "That passkey was not accepted. Use your password instead." });
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

  return (
    <AuthCard
      title="Log in"
      subtitle="Welcome back to the MAPS Online Judge."
      footer={
        <span>
          New here? <Link href="/accounts/register/">Create an account</Link>
        </span>
      }
    >
      <form onSubmit={onCredentials} noValidate>
        {error ? (
          <Alert variant="danger" className="mb-4">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{error.message}</AlertTitle>
            {error.needsActivation ? (
              <AlertDescription>
                {resent ? (
                  <span>Another activation email is on its way. The link is good for seven days.</span>
                ) : (
                  <Button
                    variant="link"
                    onClick={async () => {
                      await resendActivation(username);
                      setResent(true);
                    }}
                  >
                    Send the activation email again
                  </Button>
                )}
              </AlertDescription>
            ) : null}
          </Alert>
        ) : null}

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
