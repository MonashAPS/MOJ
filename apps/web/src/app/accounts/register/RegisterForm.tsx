"use client";

import {
  Alert,
  AlertTitle,
  Button,
  cn,
  Field,
  FieldGroup,
  Input,
  MicroLabel,
  MultiSelect,
  Progress,
  Select,
} from "@moj/ui";
import { AlertCircle, AtSign, KeyRound, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/auth/client";
import { AuthCard } from "@/components/auth/AuthCard";

const MAX_ORGANIZATIONS = 3;

const PASSWORD_RULES = [
  "At least 8 characters.",
  "Not entirely numeric.",
  "Not too similar to your username or email.",
  "Not a commonly used password.",
];

type FieldErrors = Partial<Record<"username" | "email" | "password1" | "password2" | "form", string>>;

type Strength = { value: number; word: string; tone: "bad" | "warn" | "good" };

/** A word, never a score: the meter says Weak / Fair / Strong and nothing else. */
function strengthOf(password: string): Strength {
  if (!password) return { value: 0, word: "", tone: "bad" };
  let points = 0;
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1;
  if (/\d/.test(password)) points += 1;
  if (/[^\w]/.test(password)) points += 1;
  if (/^\d+$/.test(password)) points = Math.min(points, 1);
  if (points <= 2) return { value: 33, word: "Weak", tone: "bad" };
  if (points <= 4) return { value: 66, word: "Fair", tone: "warn" };
  return { value: 100, word: "Strong", tone: "good" };
}

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

  const strength = strengthOf(password1);

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
            error={errors.username}
            hint="Letters, digits and underscores, at most 30."
          >
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

          <div className="grid gap-1.5 sm:col-span-2">
            <div className="flex items-baseline justify-between gap-2">
              <MicroLabel>Password strength</MicroLabel>
              {strength.word ? (
                <span
                  className={cn(
                    "text-sm font-medium",
                    strength.tone === "bad" && "text-bad",
                    strength.tone === "warn" && "text-warn",
                    strength.tone === "good" && "text-good",
                  )}
                >
                  {strength.word}
                </span>
              ) : null}
            </div>
            <Progress value={strength.value} tone={strength.tone} aria-label="Password strength" />
          </div>

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
