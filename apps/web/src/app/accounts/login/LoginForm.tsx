"use client";

import { Alert, AlertDescription, AlertTitle, Button, Field, Input, Label } from "@moj/ui";
import { AlertCircle, Fingerprint, KeyRound, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { resendActivation } from "./actions";

type Failure = { message: string; needsActivation?: boolean };

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const t = useTranslations("auth.login");
  const tError = useTranslations("auth.errors");
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
            ? { message: t("notActivated"), needsActivation: true }
            : { message: t("badCredentials") },
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
      setError({ message: tError("generic") });
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
        setError({ message: t("passkeyRefused") });

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
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <span>
          {t.rich("footer", {
            link: (chunks) => <Link href="/accounts/register/">{chunks}</Link>,
          })}
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
                  <span>{t("activationResent")}</span>
                ) : (
                  <Button
                    variant="link"
                    onClick={async () => {
                      await resendActivation(username);
                      setResent(true);
                    }}
                  >
                    {t("resendActivation")}
                  </Button>
                )}
              </AlertDescription>
            ) : null}
          </Alert>
        ) : null}

        <div className="grid gap-4">
          <Field label={t("usernameLabel")} htmlFor="login-username">
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
              <Label htmlFor="login-password">{t("passwordLabel")}</Label>
              <Link href="/accounts/password/reset/" className="text-sm">
                {t("forgotPassword")}
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
            {busy ? t("submitBusy") : t("submit")}
          </Button>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("divider")}
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            variant="secondary"
            full
            busy={passkeyBusy}
            icon={<Fingerprint aria-hidden />}
            onClick={onPasskey}
          >
            {passkeyBusy ? t("passkeyBusy") : t("passkey")}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
