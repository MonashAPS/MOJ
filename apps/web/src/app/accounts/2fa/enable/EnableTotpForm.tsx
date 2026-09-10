"use client";

import { Alert, AlertTitle, Button, Field, Input, Panel } from "@moj/ui";
import { AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
        setError(
          result.error?.status === 400
            ? "That password is not right."
            : "Two factor authentication could not be set up. Try again.",
        );
        return;
      }
      setTotpUri(enrolment.totpURI);
      setScratchCodes(enrolment.backupCodes ?? []);
      setStage("scan");
    } catch {
      setError("Something went wrong. Try again.");
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
        setError("That code is not right. Wait for the next one and try again.");
        return;
      }
      // No `router.refresh()` here: the page guard sends an account that already
      // has two factor on back to the overview, which would take the scratch
      // codes away before they had been read. The refresh happens on the way out.
      setStage("codes");
    } catch {
      setError("Something went wrong. Try again.");
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
        title="Enable two factor authentication"
        subtitle="Confirm your password to start."
        footer={
          <span>
            Changed your mind? <Link href="/accounts/2fa/">Back to two factor authentication</Link>
          </span>
        }
      >
        <form onSubmit={start} noValidate>
          {strip}
          <div className="grid gap-4">
            <Field label="Password" htmlFor="enable-password">
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
              {busy ? "Checking…" : "Continue"}
            </Button>
          </div>
        </form>
      </AuthCard>
    );
  }

  if (stage === "scan") {
    const secret = secretFrom(totpUri);
    return (
      <AuthCard
        title="Scan this code"
        subtitle="Add it to your authenticator app, then type the code it shows."
        footer={<span>No camera? Type the key above into your app by hand instead.</span>}
      >
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
              <QrCode value={totpUri} label="Two factor authentication setup code" />
            </div>

            <Panel title="Or enter this key">
              <code className="block select-all break-all font-mono text-mono tracking-[.06em] text-foreground">
                {secret}
              </code>
            </Panel>

            <OneTimeCode
              label="Code from your app"
              hint="Six digits. The boxes advance as you type and submit on the last one."
              value={code}
              onChange={setCode}
              onComplete={(value) => void confirm(value)}
              invalid={!!error}
              autoFocus
            />

            <Button type="submit" full busy={busy}>
              {busy ? "Checking…" : "Enable two factor authentication"}
            </Button>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Two factor authentication is on"
      subtitle="Save these scratch codes before you go."
      footer={
        <span>
          You can generate a new set any time from{" "}
          <Link href="/accounts/2fa/">two factor authentication</Link>.
        </span>
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
          I have saved them
        </Button>
      </div>
    </AuthCard>
  );
}
