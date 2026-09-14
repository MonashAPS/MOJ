"use client";

import { Alert, AlertTitle, Button, Field, FieldGroup, Input, MultiSelect, Select } from "@moj/ui";
import { AlertCircle, AtSign, Check, KeyRound, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { authClient } from "@/auth/client";
import { DISPOSABLE_EMAIL_KEY, isDisposableEmail } from "@/auth/disposable-email";
import { PasswordStrength } from "@/components/accounts/PasswordStrength";
import { AuthCard } from "@/components/auth/AuthCard";

const MAX_ORGANIZATIONS = 3;

type FieldErrors = Partial<Record<"username" | "email" | "password1" | "password2" | "form", string>>;

export function RegisterForm({
  timezones,
  defaultTimezone,
  defaultLanguageKey,
  languages,
  organizations,
}: {
  timezones: string[];
  defaultTimezone: string;
  defaultLanguageKey: string;
  languages: Array<{ key: string; name: string }>;
  organizations: Array<{ slug: string; name: string }>;
}) {
  const t = useTranslations("auth.register");
  const tError = useTranslations("auth.errors");
  const tPassword = useTranslations("auth.password");
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [language, setLanguage] = useState(defaultLanguageKey);
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [available, setAvailable] = useState<"unknown" | "checking" | "free" | "taken">("unknown");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && timezones.includes(detected)) setTimezone(detected);
    } catch {
      // keep the default
    }
  }, [timezones]);

  // DMOJ only tells you a username is taken after a round trip. Better Auth has
  // an availability endpoint, so the answer arrives while you are still typing.
  useEffect(() => {
    const candidate = username.trim();
    if (!candidate || !/^\w{1,30}$/.test(candidate)) {
      setAvailable("unknown");
      return;
    }
    setAvailable("checking");
    const timer = window.setTimeout(async () => {
      try {
        const result = await authClient.isUsernameAvailable({ username: candidate });
        setAvailable(result.data?.available ? "free" : "taken");
      } catch {
        setAvailable("unknown");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [username]);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!/^\w+$/.test(username)) next.username = t("usernameChars");
    else if (username.length > 30) next.username = t("usernameTooLong");
    else if (available === "taken") next.username = t("usernameTaken");
    if (!email.includes("@")) next.email = tError("invalidEmail");
    else if (isDisposableEmail(email)) next.email = tError(DISPOSABLE_EMAIL_KEY);
    if (password1.length < 8) next.password1 = tPassword("tooShort");
    else if (/^\d+$/.test(password1)) next.password1 = tPassword("numeric");
    if (password1 !== password2) next.password2 = tPassword("mismatch");
    return next;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const result = await authClient.signUp.email({
        email,
        password: password1,
        name: username,
        username,
        timezone,
        preferredLanguage: language,
        organizationSlugs: selectedOrganizations.join(","),
      });
      if (result.error) {
        const message = result.error.message ?? t("failed");
        if (message === DISPOSABLE_EMAIL_KEY) setErrors({ email: tError(DISPOSABLE_EMAIL_KEY) });
        else if (/username/i.test(message)) setErrors({ username: message });
        else if (/breach|compromised|password/i.test(message)) setErrors({ password1: message });
        else if (/email/i.test(message)) setErrors({ email: message });
        else setErrors({ form: message });
        return;
      }
      router.push(`/accounts/register/complete/?email=${encodeURIComponent(email)}`);
    } catch {
      setErrors({ form: t("failedRetry") });
    } finally {
      setBusy(false);
    }
  }

  const passwordRules = [
    t("passwordRuleLength"),
    t("passwordRuleNumeric"),
    t("passwordRuleSimilar"),
    t("passwordRuleCommon"),
  ];

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      wide
      footer={
        <span>{t.rich("footer", { link: (chunks) => <Link href="/accounts/login/">{chunks}</Link> })}</span>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {errors.form ? (
          <Alert variant="danger" className="mb-4">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{errors.form}</AlertTitle>
          </Alert>
        ) : null}

        <FieldGroup columns={2} className="items-start">
          <Field
            label={t("usernameLabel")}
            htmlFor="register-username"
            error={errors.username ?? (available === "taken" ? t("usernameTaken") : undefined)}
            hint={
              available === "free"
                ? t("usernameFree")
                : available === "checking"
                  ? t("usernameChecking")
                  : t("usernameHint")
            }
          >
            <Input
              id="register-username"
              name="username"
              type="text"
              autoComplete="username"
              required
              invalid={!!errors.username || available === "taken"}
              icon={<User size={15} aria-hidden />}
              trailing={
                available === "free" ? <Check size={15} className="text-good" aria-hidden /> : undefined
              }
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </Field>

          <Field label={t("emailLabel")} htmlFor="register-email" error={errors.email} hint={t("emailHint")}>
            <Input
              id="register-email"
              name="email"
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
            htmlFor="register-password1"
            error={errors.password1}
            hint={passwordRules[0]}
          >
            <Input
              id="register-password1"
              name="password1"
              type="password"
              autoComplete="new-password"
              required
              invalid={!!errors.password1}
              icon={<KeyRound size={15} aria-hidden />}
              value={password1}
              onChange={(event) => setPassword1(event.target.value)}
            />
          </Field>

          <Field
            label={t("confirmLabel")}
            htmlFor="register-password2"
            error={errors.password2}
            hint={t("confirmHint")}
          >
            <Input
              id="register-password2"
              name="password2"
              type="password"
              autoComplete="new-password"
              required
              invalid={!!errors.password2}
              icon={<KeyRound size={15} aria-hidden />}
              value={password2}
              onChange={(event) => setPassword2(event.target.value)}
            />
          </Field>

          <PasswordStrength password={password1} className="sm:col-span-2" />

          <Field label={t("timezoneLabel")} htmlFor="register-timezone" hint={t("timezoneHint")}>
            <Select
              id="register-timezone"
              ariaLabel={t("timezoneLabel")}
              value={timezone}
              onValueChange={setTimezone}
              options={timezones.map((zone) => ({ value: zone, label: zone }))}
            />
          </Field>

          <Field label={t("languageLabel")} htmlFor="register-language">
            <Select
              id="register-language"
              ariaLabel={t("languageLabel")}
              value={language}
              onValueChange={setLanguage}
              options={languages.map((item) => ({ value: item.key, label: item.name }))}
            />
          </Field>

          <Field
            label={t("organizationsLabel")}
            htmlFor="register-organizations"
            optional={t("organizationsOptional")}
            hint={t("organizationsChosen", {
              count: selectedOrganizations.length,
              max: MAX_ORGANIZATIONS,
            })}
            className="sm:col-span-2"
          >
            <MultiSelect
              id="register-organizations"
              ariaLabel={t("organizationsLabel")}
              values={selectedOrganizations}
              onChange={setSelectedOrganizations}
              max={MAX_ORGANIZATIONS}
              placeholder={t("organizationsPlaceholder")}
              emptyText={t("organizationsEmpty")}
              options={organizations.map((organization) => ({
                value: organization.slug,
                label: organization.name,
              }))}
            />
          </Field>

          <div className="sm:col-span-2">
            <Button type="submit" full busy={busy}>
              {busy ? t("submitBusy") : t("submit")}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
