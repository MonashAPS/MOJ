"use client";

import { Alert, AlertTitle, Button, Field, Input } from "@moj/ui";
import { AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScratchCodes } from "@/components/accounts/ScratchCodes";
import { AuthCard } from "@/components/auth/AuthCard";

/** DMOJ's `generate_scratch_codes`, on its own page. The endpoint is the URL
 *  DMOJ uses, `/accounts/2fa/scratchcode/generate/`. */
export function RegenerateScratchCodes({ next, remaining }: { next: string; remaining: number }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/accounts/2fa/scratchcode/generate/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json()) as { data?: { codes?: string[] }; error?: { message?: string } };
      if (!response.ok || !body.data?.codes) {
        setError(body.error?.message ?? "Those codes could not be generated.");
        return;
      }
      setCodes(body.data.codes);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    return (
      <AuthCard
        title="Your new scratch codes"
        subtitle="The old set no longer works."
        footer={
          <span>
            Back to <Link href="/accounts/2fa/">two factor authentication</Link>.
          </span>
        }
      >
        <div className="grid gap-5">
          <ScratchCodes codes={codes} />
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

  return (
    <AuthCard
      title="New scratch codes"
      subtitle={
        remaining === 1
          ? "You have one code left. A new set replaces it."
          : `You have ${remaining} codes left. A new set replaces them.`
      }
      footer={
        <span>
          Changed your mind? <Link href="/accounts/2fa/">Back to two factor authentication</Link>
        </span>
      }
    >
      <form onSubmit={generate} noValidate>
        {error ? (
          <Alert variant="danger" className="mb-4">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}
        <div className="grid gap-4">
          <Field label="Password" htmlFor="scratch-password" hint="Confirm it is you before we reissue them.">
            <Input
              id="scratch-password"
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
            {busy ? "Generating…" : "Generate new codes"}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
