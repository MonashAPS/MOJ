"use client";

import { Alert, AlertDescription, AlertTitle, Button, Field, Input, Panel } from "@moj/ui";
import { AlertCircle, AtSign, KeyRound, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { requestEmailChange } from "./actions";

type Errors = Partial<Record<"email" | "password" | "form", string>>;

/** DMOJ's `EmailChangeRequestView`: the password, then a link to the new address
 *  and a warning to the old one. Nothing changes until that link is used. */
export function EmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    const found: Errors = {};
    if (!address.includes("@")) found.email = "Enter a valid email address.";
    else if (address.toLowerCase() === currentEmail.toLowerCase())
      found.email = "That is already your email address.";
    if (!password) found.password = "Enter your password.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const result = await requestEmailChange({ password, newEmail: address });
      if (!result.ok) {
        setErrors({ [result.field]: result.message });
        return;
      }
      setSentTo(address);
      setPassword("");
    } catch {
      setErrors({ form: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="grid gap-4">
        <Alert variant="success">
          <MailCheck className="size-3.5" aria-hidden />
          <AlertTitle>Email change requested.</AlertTitle>
          <AlertDescription>
            Follow the link we sent to <strong className="font-medium">{sentTo}</strong> to finish the change.
            We have also told {currentEmail} that somebody asked.
          </AlertDescription>
        </Alert>
        <p className="text-base text-subtle">
          Nothing arrives? Check the spam folder, then <Link href="/accounts/email/change/">try again</Link>.
        </p>
      </div>
    );
  }

  return (
    <Panel title="Change your email">
      <form onSubmit={submit} noValidate className="grid gap-4">
        {errors.form ? (
          <Alert variant="danger">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{errors.form}</AlertTitle>
          </Alert>
        ) : null}

        <Field label="Current email" htmlFor="email-current">
          <Input id="email-current" value={currentEmail} readOnly disabled title="Change it below." />
        </Field>

        <Field
          label="New email"
          htmlFor="email-new"
          error={errors.email}
          hint="We send the confirmation link here."
        >
          <Input
            id="email-new"
            name="newEmail"
            type="email"
            autoComplete="email"
            required
            invalid={!!errors.email}
            icon={<AtSign size={15} aria-hidden />}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="email-password"
          error={errors.password}
          hint="Confirm it is you before we move the account."
        >
          <Input
            id="email-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            invalid={!!errors.password}
            icon={<KeyRound size={15} aria-hidden />}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" busy={busy}>
            {busy ? "Sending…" : "Request email change"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
