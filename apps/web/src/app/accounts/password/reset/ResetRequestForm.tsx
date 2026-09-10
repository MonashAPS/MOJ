"use client";

import { Alert, AlertTitle, Button, Field, Input } from "@moj/ui";
import { AlertCircle, AtSign } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { AuthCard } from "@/components/auth/AuthCard";

/** DMOJ's `CustomPasswordResetView`, rate limited per address. The answer never
 *  says whether the address is on file. */
export function ResetRequestForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.requestPasswordReset({ email: email.trim() });
      if (result.error?.status === 429) {
        setError("You have asked for too many resets. Wait a minute and try again.");
        return;
      }
      // Anything else, including an address nobody has, lands on the same page.
      router.push(`/accounts/reset/done/?email=${encodeURIComponent(email.trim())}`);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We will email you a link to choose a new one."
      footer={
        <span>
          Remembered it? <Link href="/accounts/login/">Log in</Link>
        </span>
      }
    >
      <form onSubmit={submit} noValidate>
        {error ? (
          <Alert variant="danger" className="mb-4">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}

        <div className="grid gap-4">
          <Field label="Email" htmlFor="reset-email" hint="The address you registered with.">
            <Input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              invalid={!!error}
              icon={<AtSign size={15} aria-hidden />}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Button type="submit" full busy={busy}>
            {busy ? "Sending…" : "Send reset email"}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
