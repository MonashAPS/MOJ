"use client";

import { api } from "@convex/_generated/api";
import { Button, Field, Input, Select, Textarea } from "@moj/ui";
import { useMutation } from "convex/react";
import { useState } from "react";
import { type ThemeChoice, ThemeToggle } from "@/components/shell/ThemeToggle";

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
  const [form, setForm] = useState({ about, timezone, languageKey, siteTheme, editorTheme });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

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
      setStatus("saved");
      setMessage("Your profile has been updated.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Your profile could not be saved.");
    }
  }

  function applyTheme(value: ThemeChoice) {
    setForm({ ...form, siteTheme: value });
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
    <div className="card" style={{ maxWidth: "44rem" }}>
      <form onSubmit={onSubmit}>
        {status === "saved" ? <div className="alert alert-success">{message}</div> : null}
        {status === "error" ? <div className="alert alert-danger">{message}</div> : null}

        <div className="form-grid two-column">
          <Field label="Username" htmlFor="profile-username" className="span-2">
            <Input id="profile-username" type="text" value={username} readOnly aria-readonly />
          </Field>

          <Field label="Self-description" htmlFor="profile-about" className="span-2">
            <Textarea
              id="profile-about"
              rows={6}
              value={form.about}
              onChange={(event) => setForm({ ...form, about: event.target.value })}
            />
          </Field>

          <Field label="Timezone" htmlFor="profile-timezone">
            <Select
              id="profile-timezone"
              ariaLabel="Timezone"
              value={form.timezone}
              onValueChange={(value) => setForm({ ...form, timezone: value })}
              options={timezones.map((zone) => ({ value: zone, label: zone }))}
            />
          </Field>

          <Field label="Preferred language" htmlFor="profile-language">
            <Select
              id="profile-language"
              ariaLabel="Preferred language"
              value={form.languageKey}
              onValueChange={(value) => setForm({ ...form, languageKey: value })}
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
              onValueChange={(value) => setForm({ ...form, editorTheme: value })}
              options={EDITOR_THEMES}
            />
          </Field>
        </div>

        <div className="auth-footer-row">
          <ThemeToggle initial={form.siteTheme} />
          <Button type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving..." : "Update profile"}
          </Button>
        </div>
      </form>
    </div>
  );
}
