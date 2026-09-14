"use client";

import { Alert, AlertDescription, AlertTitle, Button, Field, Input } from "@moj/ui";
import { AlertCircle, KeyRound, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { PasswordStrength } from "@/components/accounts/PasswordStrength";
import { AuthCard } from "@/components/auth/AuthCard";

type Errors = Partial<Record<"current" | "next" | "confirm" | "form", string>>;

/** DMOJ's `CustomPasswordChangeView`. The compromised banner is the same one
 *  DMOJ shows when `session.password_pwned` is set. */
export function ChangePasswordForm({ compromised }: { compromised: boolean }) {
  const t = useTranslations("auth.passwordChange");
  const tError = useTranslations("auth.errors");
  const tPassword = useTranslations("auth.password");
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
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
      const result = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (result.error) {
        const message = result.error.message ?? "";
        if (/breach|compromised/i.test(message)) setErrors({ next: message });
        else if (result.error.status === 400) setErrors({ current: tPassword("wrong") });
        else setErrors({ form: message || t("failed") });
        return;
      }
      router.push("/accounts/password/change/done/");
      router.refresh();
    } catch {
      setErrors({ form: tError("generic") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <span>
          {t.rich("footer", { link: (chunks) => <Link href="/accounts/password/reset/">{chunks}</Link> })}
        </span>
      }
    >
      <form onSubmit={submit} noValidate>
        {compromised ? (
          <Alert variant="warning" className="mb-4">
            <ShieldAlert className="size-3.5" aria-hidden />
            <AlertTitle>{t("compromisedTitle")}</AlertTitle>
            <AlertDescription>{t("compromisedDescription")}</AlertDescription>
          </Alert>
        ) : null}

        {errors.form ? (
          <Alert variant="danger" className="mb-4">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{errors.form}</AlertTitle>
          </Alert>
        ) : null}

        <div className="grid gap-4">
          <Field label={t("currentLabel")} htmlFor="change-current" error={errors.current}>
            <Input
              id="change-current"
              name="current"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              invalid={!!errors.current}
              icon={<KeyRound size={15} aria-hidden />}
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </Field>

          <Field
            label={tPassword("newLabel")}
            htmlFor="change-next"
            error={errors.next}
            hint={tPassword("newHint")}
          >
            <Input
              id="change-next"
              name="next"
              type="password"
              autoComplete="new-password"
              required
              invalid={!!errors.next}
              icon={<KeyRound size={15} aria-hidden />}
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          </Field>

          <PasswordStrength password={next} />

          <Field label={tPassword("confirmLabel")} htmlFor="change-confirm" error={errors.confirm}>
            <Input
              id="change-confirm"
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
