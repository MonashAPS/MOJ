"use client";

import { Button, Field, Input, MultiSelect, Select } from "@moj/ui";
import { AtSign, KeyRound, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/auth/client";

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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && timezones.includes(detected)) setTimezone(detected);
    } catch {
      // keep the default
    }
  }, [timezones]);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!/^\w+$/.test(username))
      next.username = "Usernames may only contain letters, digits and underscores.";
    else if (username.length > 30) next.username = "Usernames are at most 30 characters.";
    if (!email.includes("@")) next.email = "Enter a valid email address.";
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
        setErrors({ form: result.error.message ?? "That account could not be created." });
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
    <div className="auth-shell">
      <div className="auth-card wide">
        <div className="auth-brand">
          <span className="auth-brand-plate">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="auth-wordmark" src="/logo.svg" alt="MOJ" />
          </span>
        </div>
        <h1 className="auth-title">Sign up</h1>
        <p className="auth-subtitle">One account for problems, contests and rankings.</p>

        <form onSubmit={onSubmit} noValidate>
          {errors.form ? (
            <div className="form-errors" role="alert">
              {errors.form}
            </div>
          ) : null}

          <div className="form-grid two-column">
            <Field label="Username" htmlFor="register-username" error={errors.username} className="span-2">
              <Input
                id="register-username"
                name="username"
                type="text"
                autoComplete="username"
                required
                invalid={!!errors.username}
                icon={<User size={15} aria-hidden />}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </Field>

            <Field label="Email" htmlFor="register-email" error={errors.email} className="span-2">
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
              label="Password again"
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

            <Field label="Timezone" htmlFor="register-timezone" hint="Pick your closest major city.">
              <Select
                id="register-timezone"
                ariaLabel="Timezone"
                value={timezone}
                onValueChange={setTimezone}
                options={timezones.map((zone) => ({ value: zone, label: zone }))}
              />
            </Field>

            <Field label="Default language" htmlFor="register-language">
              <Select
                id="register-language"
                ariaLabel="Default language"
                value={language}
                onValueChange={setLanguage}
                options={languages.map((item) => ({ value: item.key, label: item.name }))}
              />
            </Field>

            <Field
              label="Affiliated organizations"
              htmlFor="register-organizations"
              optional={`(at most ${MAX_ORGANIZATIONS})`}
              className="span-2"
            >
              <MultiSelect
                id="register-organizations"
                ariaLabel="Affiliated organizations"
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
          </div>

          <Button type="submit" full disabled={busy}>
            {busy ? "Registering..." : "Register"}
          </Button>
        </form>

        <div className="auth-links">
          <span>
            Already have an account? <Link href="/accounts/login/">Log in</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
