"use client";

import { Button, Field, Input } from "@moj/ui";
import { KeyRound, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

type Stage = "credentials" | "two-factor";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

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

  async function onTwoFactor(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code });
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

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-plate">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="auth-wordmark" src="/logo.svg" alt="MOJ" />
          </span>
        </div>

        {stage === "credentials" ? (
          <>
            <h1 className="auth-title">Log in</h1>
            <p className="auth-subtitle">Welcome back to the MAPS Online Judge.</p>

            <form onSubmit={onCredentials} noValidate>
              {error ? (
                <div className="form-errors" role="alert">
                  {error}
                </div>
              ) : null}

              <Field label="Username" htmlFor="login-username">
                <Input
                  id="login-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  required
                  icon={<User size={15} aria-hidden />}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </Field>

              <Field label="Password" htmlFor="login-password">
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  icon={<KeyRound size={15} aria-hidden />}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>

              <Button type="submit" full disabled={busy}>
                {busy ? "Logging in..." : "Log in"}
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="auth-title">Two factor authentication</h1>
            <p className="auth-subtitle">Enter the six digit code from your authenticator app.</p>

            <form onSubmit={onTwoFactor} noValidate>
              {error ? (
                <div className="form-errors" role="alert">
                  {error}
                </div>
              ) : null}

              <Field label="Authentication code" htmlFor="login-totp">
                <Input
                  id="login-totp"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </Field>

              <Button type="submit" full disabled={busy}>
                {busy ? "Checking..." : "Verify"}
              </Button>
            </form>
          </>
        )}

        <div className="auth-links">
          <Link href="/accounts/password/reset/">Forgot your password?</Link>
          <span>
            No account yet? <Link href="/accounts/register/">Sign up</Link>
          </span>
        </div>

        <div className="auth-footer-row">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
