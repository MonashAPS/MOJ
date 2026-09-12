"use client";

import { api } from "@convex/_generated/api";
import {
  Alert,
  AlertTitle,
  Button,
  Field,
  FieldGroup,
  FormFooter,
  MultiSelect,
  Panel,
  Select,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { applyTheme, type ThemeChoice } from "@/components/shell/ThemeToggle";

const MAX_ORGANIZATIONS = 3;

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
  organizationSlugs: string[];
};

export function EditProfileForm({
  about,
  timezone,
  languageKey,
  siteTheme,
  editorTheme,
  organizationSlugs,
  timezones,
  languages,
  organizations,
  canEditAbout,
}: {
  about: string;
  timezone: string;
  languageKey: string;
  siteTheme: ThemeChoice;
  editorTheme: string;
  organizationSlugs: string[];
  timezones: string[];
  languages: Array<{ key: string; name: string }>;
  organizations: Array<{ slug: string; name: string }>;
  /** DMOJ makes the self-description wait until a first solve. */
  canEditAbout: boolean;
}) {
  const update = useMutation(api.profiles.updateProfile);
  const [baseline, setBaseline] = useState<FormState>({
    about,
    timezone,
    languageKey,
    siteTheme,
    editorTheme,
    organizationSlugs,
  });
  const [form, setForm] = useState<FormState>(baseline);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  const dirty =
    form.about !== baseline.about ||
    form.timezone !== baseline.timezone ||
    form.languageKey !== baseline.languageKey ||
    form.siteTheme !== baseline.siteTheme ||
    form.editorTheme !== baseline.editorTheme ||
    form.organizationSlugs.join(",") !== baseline.organizationSlugs.join(",");

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

  function chooseTheme(value: ThemeChoice) {
    change("siteTheme", value);
    // Shared with the header control so the two cannot drift apart on how a
    // choice is stored; the preference still saves server side on submit.
    applyTheme(value);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    try {
      await update({
        about: canEditAbout ? form.about : undefined,
        timezone: form.timezone,
        languageKey: form.languageKey,
        siteTheme: form.siteTheme,
        editorTheme: form.editorTheme,
        organizationSlugs: form.organizationSlugs,
      });
      setBaseline(form);
      setStatus("saved");
      setMessage("Your profile has been updated.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Your profile could not be saved.");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {status === "error" ? (
        <Alert variant="danger">
          <AlertCircle className="size-3.5" aria-hidden />
          <AlertTitle>{message}</AlertTitle>
        </Alert>
      ) : null}
      {status === "saved" ? (
        <Alert variant="success">
          <CheckCircle2 className="size-3.5" aria-hidden />
          <AlertTitle>{message}</AlertTitle>
        </Alert>
      ) : null}

      <Panel title="Profile">
        <Field
          label="Self-description"
          htmlFor="profile-about"
          optional=" optional"
          hint={
            canEditAbout
              ? "Markdown, shown on your profile page. Links, code and maths all work."
              : "Solve a problem first and this opens up."
          }
        >
          <MarkdownEditor
            id="profile-about"
            preset="self-description"
            value={form.about}
            onChange={(value) => change("about", value)}
            disabled={!canEditAbout}
            disabledReason="Solve a problem first, then you can write one."
            maxLength={20000}
            placeholder="A line or two about you."
            ariaLabel="Self-description"
          />
        </Field>
      </Panel>

      <Panel title="Preferences">
        <FieldGroup columns={2}>
          <Field label="Timezone" htmlFor="profile-timezone" hint="Every date on the site uses it.">
            <Select
              id="profile-timezone"
              ariaLabel="Timezone"
              value={form.timezone}
              onValueChange={(value) => change("timezone", value)}
              options={timezones.map((zone) => ({ value: zone, label: zone }))}
            />
          </Field>

          <Field label="Preferred language" htmlFor="profile-language" hint="Preselected on the submit page.">
            <Select
              id="profile-language"
              ariaLabel="Preferred language"
              value={form.languageKey}
              onValueChange={(value) => change("languageKey", value)}
              options={languages.map((language) => ({ value: language.key, label: language.name }))}
            />
          </Field>

          <Field label="Site theme" htmlFor="profile-site-theme" hint="Applies as soon as you pick it.">
            <Select
              id="profile-site-theme"
              ariaLabel="Site theme"
              value={form.siteTheme}
              onValueChange={(value) => chooseTheme(value as ThemeChoice)}
              options={SITE_THEMES}
            />
          </Field>

          <Field label="Editor theme" htmlFor="profile-editor-theme" hint="Used by the code editor.">
            <Select
              id="profile-editor-theme"
              ariaLabel="Editor theme"
              value={form.editorTheme}
              onValueChange={(value) => change("editorTheme", value)}
              options={EDITOR_THEMES}
            />
          </Field>
        </FieldGroup>
      </Panel>

      <Panel title="Organisations">
        <Field
          label="Your organisations"
          htmlFor="profile-organizations"
          optional=" optional"
          hint={`${form.organizationSlugs.length} of ${MAX_ORGANIZATIONS} chosen. Closed organisations are joined by request from their own page.`}
        >
          <MultiSelect
            id="profile-organizations"
            ariaLabel="Organisations"
            values={form.organizationSlugs}
            onChange={(values) => change("organizationSlugs", values)}
            max={MAX_ORGANIZATIONS}
            placeholder="None"
            emptyText="There are no open organizations."
            options={organizations.map((organization) => ({
              value: organization.slug,
              label: organization.name,
            }))}
          />
        </Field>
      </Panel>

      <FormFooter note={dirty ? "Unsaved changes" : undefined}>
        <Button
          type="submit"
          busy={status === "saving"}
          disabled={!dirty && status !== "error"}
          title={!dirty && status !== "error" ? "Nothing has changed yet." : undefined}
        >
          {status === "saving" ? "Saving…" : "Update profile"}
        </Button>
      </FormFooter>
    </form>
  );
}
