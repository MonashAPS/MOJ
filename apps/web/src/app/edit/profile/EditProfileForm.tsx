"use client";

import { api } from "@convex/_generated/api";
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Field,
  FieldGroup,
  FormFooter,
  Input,
  Select,
  Textarea,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ThemeChoice } from "@/components/shell/ThemeToggle";

const EDITOR_THEMES = [
  { value: "github", label: "GitHub" },
  { value: "monokai", label: "Monokai" },
  { value: "twilight", label: "Twilight" },
  { value: "solarized_light", label: "Solarized Light" },
  { value: "solarized_dark", label: "Solarized Dark" },
  { value: "tomorrow_night", label: "Tomorrow Night" },
];

const SITE_THEMES = [
  { value: "auto", label: "Follow the system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

type FormState = {
  about: string;
  timezone: string;
  languageKey: string;
  siteTheme: ThemeChoice;
  editorTheme: string;
};

export function EditProfileForm({
  username,
  about,
  timezone,
  languageKey,
  siteTheme,
  editorTheme,
  timezones,
  languages,
}: {
  username: string;
  about: string;
  timezone: string;
  languageKey: string;
  siteTheme: ThemeChoice;
  editorTheme: string;
  timezones: string[];
  languages: Array<{ key: string; name: string }>;
}) {
  const update = useMutation(api.profiles.updatePreferences);
  const [baseline, setBaseline] = useState<FormState>({
    about,
    timezone,
    languageKey,
    siteTheme,
    editorTheme,
  });
  const [form, setForm] = useState<FormState>(baseline);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  const dirty = (Object.keys(baseline) as Array<keyof FormState>).some((key) => form[key] !== baseline[key]);

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus((current) => (current === "saved" ? "idle" : current));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    try {
      await update({
        about: form.about,
        timezone: form.timezone,
        languageKey: form.languageKey,
        siteTheme: form.siteTheme,
        editorTheme: form.editorTheme,
      });
      setBaseline(form);
      setStatus("saved");
      setMessage("Your profile has been updated.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Your profile could not be saved.");
    }
  }

  function applyTheme(value: ThemeChoice) {
    change("siteTheme", value);
    const root = document.documentElement;
    try {
      if (value === "auto") {
        root.removeAttribute("data-theme");
        localStorage.removeItem("moj-theme");
      } else {
        root.setAttribute("data-theme", value);
        localStorage.setItem("moj-theme", value);
      }
    } catch {
      // private mode
    }
  }

  return (
    <Card className="max-w-[44rem]">
      <CardContent>
        <form onSubmit={onSubmit}>
          {status === "saved" ? (
            <Alert variant="success" className="mb-4">
              <CheckCircle2 className="size-3.5" aria-hidden />
              <AlertTitle>{message}</AlertTitle>
            </Alert>
          ) : null}
          {status === "error" ? (
            <Alert variant="danger" className="mb-4">
              <AlertCircle className="size-3.5" aria-hidden />
              <AlertTitle>{message}</AlertTitle>
            </Alert>
          ) : null}

          <FieldGroup columns={2} className="items-start">
            <Field
              label="Username"
              htmlFor="profile-username"
              hint="Your username cannot be changed."
              className="sm:col-span-2"
            >
              <Input id="profile-username" type="text" value={username} readOnly aria-readonly />
            </Field>

            <Field
              label="Self-description"
              htmlFor="profile-about"
              hint="Shown on your profile. Markdown is allowed."
              className="sm:col-span-2"
            >
              <Textarea
                id="profile-about"
                rows={6}
                value={form.about}
                onChange={(event) => change("about", event.target.value)}
              />
            </Field>

            <Field label="Timezone" htmlFor="profile-timezone">
              <Select
                id="profile-timezone"
                ariaLabel="Timezone"
                value={form.timezone}
                onValueChange={(value) => change("timezone", value)}
                options={timezones.map((zone) => ({ value: zone, label: zone }))}
              />
            </Field>

            <Field label="Preferred language" htmlFor="profile-language">
              <Select
                id="profile-language"
                ariaLabel="Preferred language"
                value={form.languageKey}
                onValueChange={(value) => change("languageKey", value)}
                options={languages.map((language) => ({ value: language.key, label: language.name }))}
              />
            </Field>

            <Field label="Site theme" htmlFor="profile-theme">
              <Select
                id="profile-theme"
                ariaLabel="Site theme"
                value={form.siteTheme}
                onValueChange={(value) => applyTheme(value as ThemeChoice)}
                options={SITE_THEMES}
              />
            </Field>

            <Field label="Editor theme" htmlFor="profile-editor-theme">
              <Select
                id="profile-editor-theme"
                ariaLabel="Editor theme"
                value={form.editorTheme}
                onValueChange={(value) => change("editorTheme", value)}
                options={EDITOR_THEMES}
              />
            </Field>
          </FieldGroup>

          <FormFooter note={dirty ? "Unsaved changes" : undefined}>
            <Button type="submit" busy={status === "saving"}>
              {status === "saving" ? "Saving…" : "Update profile"}
            </Button>
          </FormFooter>
        </form>
      </CardContent>
    </Card>
  );
}
