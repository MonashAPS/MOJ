"use client";

import { Alert, AlertDescription, AlertTitle, Button, Field, Input, Panel } from "@moj/ui";
import { AlertCircle, AtSign, KeyRound, MailCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { requestEmailChange } from "./actions";

type Errors = Partial<Record<"email" | "password" | "form", string>>;

/** DMOJ's `EmailChangeRequestView`: the password, then a link to the new address
 *  and a warning to the old one. Nothing changes until that link is used. */
export function EmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const t = useTranslations("auth.emailChange");
  const tError = useTranslations("auth.errors");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    const found: Errors = {};

    if (!address.includes("@")) found.email = tError("invalidEmail");
    else if (address.toLowerCase() === currentEmail.toLowerCase()) found.email = t("sameAddress");

    if (!password) found.password = t("enterPassword");
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
      setErrors({ form: tError("generic") });
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="grid gap-4">
        <Alert variant="success">
          <MailCheck className="size-3.5" aria-hidden />
          <AlertTitle>{t("requestedTitle")}</AlertTitle>
          <AlertDescription>
            {t.rich("requestedDescription", {
              email: sentTo,
              current: currentEmail,
              strong: (chunks) => <strong className="font-medium">{chunks}</strong>,
            })}
          </AlertDescription>
        </Alert>
        <p className="text-base text-subtle">
          {t.rich("nothingArrives", {
            link: (chunks) => <Link href="/accounts/email/change/">{chunks}</Link>,
          })}
        </p>
      </div>
    );
  }

  return (
    <Panel title={t("panelTitle")}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        {errors.form ? (
          <Alert variant="danger">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{errors.form}</AlertTitle>
          </Alert>
        ) : null}

        <Field label={t("currentLabel")} htmlFor="email-current">
          <Input id="email-current" value={currentEmail} readOnly disabled title={t("currentTitle")} />
        </Field>

        <Field label={t("newLabel")} htmlFor="email-new" error={errors.email} hint={t("newHint")}>
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
          label={t("passwordLabel")}
          htmlFor="email-password"
          error={errors.password}
          hint={t("passwordHint")}
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
            {busy ? t("submitBusy") : t("submit")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
