"use client";

import { Alert, AlertTitle, Button, Field, FieldGroup, Input, MultiSelect, Select } from "@moj/ui";
import { AlertCircle, AtSign, Check, KeyRound, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/auth/client";
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "@/auth/disposable-email";
import { PasswordStrength } from "@/components/accounts/PasswordStrength";
import { AuthCard } from "@/components/auth/AuthCard";

const MAX_ORGANIZATIONS = 3;

const PASSWORD_RULES = [
  "At least 8 characters.",
  "Not entirely numeric.",
  "Not too similar to your username or email.",
  "Not a commonly used password.",
];

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
    if (!/^\w+$/.test(username))
      next.username = "Usernames may only contain letters, digits and underscores.";
    else if (username.length > 30) next.username = "Usernames are at most 30 characters.";
    else if (available === "taken") next.username = "That username is already taken.";
    if (!email.includes("@")) next.email = "Enter a valid email address.";
    else if (isDisposableEmail(email)) next.email = DISPOSABLE_EMAIL_MESSAGE;
    if (password1.length < 8) next.password1 = "Passwords must be at least 8 characters.";
    else if (/^\d+$/.test(password1)) next.password1 = "Passwords cannot be entirely numeric.";
    if (password1 !== password2) next.password2 = "The two password fields did not match.";
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
        const message = result.error.message ?? "That account could not be created.";
        if (message === DISPOSABLE_EMAIL_MESSAGE) setErrors({ email: message });
        else if (/username/i.test(message)) setErrors({ username: message });
        else if (/breach|compromised|password/i.test(message)) setErrors({ password1: message });
        else if (/email/i.test(message)) setErrors({ email: message });
        else setErrors({ form: message });
        return;
      }
      router.push(`/accounts/register/complete/?email=${encodeURIComponent(email)}`);
    } catch {
      setErrors({ form: "That account could not be created. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Sign up"
      subtitle="One account for problems, contests and rankings."
      wide
      footer={
        <span>
          Already have an account? <Link href="/accounts/login/">Sign in</Link>
        </span>
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
            label="Username"
            htmlFor="register-username"
            error={errors.username ?? (available === "taken" ? "That username is already taken." : undefined)}
            hint={
              available === "free"
                ? "That one is free."
                : available === "checking"
                  ? "Checking…"
                  : "Letters, digits and underscores, at most 30."
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

          <Field
            label="Email"
            htmlFor="register-email"
            error={errors.email}
            hint="We send your activation link here."
          >
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
            label="Password"
            htmlFor="register-password1"
            error={errors.password1}
            hint={PASSWORD_RULES[0]}
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
            label="Confirm password"
            htmlFor="register-password2"
            error={errors.password2}
            hint="For confirmation."
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

          <Field label="Timezone" htmlFor="register-timezone" hint="Pick your closest major city.">
            <Select
              id="register-timezone"
              ariaLabel="Timezone"
              value={timezone}
              onValueChange={setTimezone}
              options={timezones.map((zone) => ({ value: zone, label: zone }))}
            />
          </Field>

          <Field label="Preferred language" htmlFor="register-language">
            <Select
              id="register-language"
              ariaLabel="Preferred language"
              value={language}
              onValueChange={setLanguage}
              options={languages.map((item) => ({ value: item.key, label: item.name }))}
            />
          </Field>

          <Field
            label="Organizations"
            htmlFor="register-organizations"
            optional="optional"
            hint={`${selectedOrganizations.length} of ${MAX_ORGANIZATIONS} chosen`}
            className="sm:col-span-2"
          >
            <MultiSelect
              id="register-organizations"
              ariaLabel="Organizations"
              values={selectedOrganizations}
              onChange={setSelectedOrganizations}
              max={MAX_ORGANIZATIONS}
              placeholder="None"
              emptyText="There are no open organizations."
              options={organizations.map((organization) => ({
                value: organization.slug,
                label: organization.name,
              }))}
            />
          </Field>

          <div className="sm:col-span-2">
            <Button type="submit" full busy={busy}>
              {busy ? "Registering…" : "Register"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
