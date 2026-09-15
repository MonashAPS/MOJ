"use client";

import { Alert, AlertTitle, Button, Field, Input } from "@moj/ui";
import { AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { PasswordStrength } from "@/components/accounts/PasswordStrength";
import { AuthCard } from "@/components/auth/AuthCard";

type Errors = Partial<Record<"next" | "confirm" | "form", string>>;

/** DMOJ's `password_reset_confirm`. An expired or reused link lands on the same
 *  "invalid link" message DMOJ shows. */
export function ResetConfirmForm({ token }: { token: string }) {
  const t = useTranslations("auth.resetConfirm");
  const tError = useTranslations("auth.errors");
  const tPassword = useTranslations("auth.password");
  const router = useRouter();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [invalidLink, setInvalidLink] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found: Errors = {};

    if (next.length < 8) found.next = tPassword("tooShort");
    else if (/^\d+$/.test(next)) found.next = tPassword("numeric");

    if (next !== confirm) found.confirm = tPassword("mismatch");
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
          setErrors({ form: message || t("failed") });
        }

        return;
      }

      router.push("/accounts/reset/complete/");
    } catch {
      setErrors({ form: tError("generic") });
    } finally {
      setBusy(false);
    }
  }

  if (invalidLink) {
    return (
      <AuthCard
        title={t("invalidTitle")}
        subtitle={t("invalidSubtitle")}
        footer={
          <span>{t.rich("footer", { link: (chunks) => <Link href="/accounts/login/">{chunks}</Link> })}</span>
        }
      >
        <div className="grid gap-4">
          <Alert variant="danger">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{t("invalidAlert")}</AlertTitle>
          </Alert>
          <Button asChild full>
            <Link href="/accounts/password/reset/">{t("askForNew")}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <span>{t.rich("footer", { link: (chunks) => <Link href="/accounts/login/">{chunks}</Link> })}</span>
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
            label={tPassword("newLabel")}
            htmlFor="confirm-next"
            error={errors.next}
            hint={tPassword("newHint")}
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

          <Field label={tPassword("confirmLabel")} htmlFor="confirm-again" error={errors.confirm}>
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
            {busy ? t("submitBusy") : t("submit")}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
