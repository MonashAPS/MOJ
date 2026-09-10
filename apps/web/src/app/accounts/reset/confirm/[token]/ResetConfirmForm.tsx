"use client";

import { Alert, AlertTitle, Button, Field, Input } from "@moj/ui";
import { AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { PasswordStrength } from "@/components/accounts/PasswordStrength";
import { AuthCard } from "@/components/auth/AuthCard";

type Errors = Partial<Record<"next" | "confirm" | "form", string>>;

/** DMOJ's `password_reset_confirm`. An expired or reused link lands on the same
 *  "invalid link" message DMOJ shows. */
export function ResetConfirmForm({ token }: { token: string }) {
  const router = useRouter();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [invalidLink, setInvalidLink] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    if (next.length < 8) found.next = "Passwords must be at least 8 characters.";
    else if (/^\d+$/.test(next)) found.next = "Passwords cannot be entirely numeric.";
    if (next !== confirm) found.confirm = "The two password fields did not match.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const result = await authClient.resetPassword({ newPassword: next, token });
      if (result.error) {
        const message = result.error.message ?? "";
        if (/breach|compromised/i.test(message)) {
          setErrors({ next: message });
        } else if (/token|expired|invalid/i.test(message)) {
          setInvalidLink(true);
        } else {
          setErrors({ form: message || "Your password could not be set." });
        }
        return;
      }
      router.push("/accounts/reset/complete/");
    } catch {
      setErrors({ form: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  if (invalidLink) {
    return (
      <AuthCard
        title="This link is no longer valid"
        subtitle="Reset links can only be used once, and they expire after an hour."
        footer={
          <span>
            Back to <Link href="/accounts/login/">logging in</Link>
          </span>
        }
      >
        <div className="grid gap-4">
          <Alert variant="danger">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>Invalid password reset link.</AlertTitle>
          </Alert>
          <Button asChild full>
            <Link href="/accounts/password/reset/">Ask for a new one</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Pick something you have not used anywhere else."
      footer={
        <span>
          Back to <Link href="/accounts/login/">logging in</Link>
        </span>
      }
    >
      <form onSubmit={submit} noValidate>
        {errors.form ? (
          <Alert variant="danger" className="mb-4">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{errors.form}</AlertTitle>
          </Alert>
        ) : null}

        <div className="grid gap-4">
          <Field
            label="New password"
            htmlFor="confirm-next"
            error={errors.next}
            hint="At least 8 characters, and not one that has turned up in a breach."
          >
            <Input
              id="confirm-next"
              name="next"
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              invalid={!!errors.next}
              icon={<KeyRound size={15} aria-hidden />}
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          </Field>

          <PasswordStrength password={next} />

          <Field label="Confirm new password" htmlFor="confirm-again" error={errors.confirm}>
            <Input
              id="confirm-again"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              invalid={!!errors.confirm}
              icon={<KeyRound size={15} aria-hidden />}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>

          <Button type="submit" full busy={busy}>
            {busy ? "Setting…" : "Reset password"}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
