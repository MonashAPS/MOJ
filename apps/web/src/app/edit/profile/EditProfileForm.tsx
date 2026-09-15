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
import { useTranslations } from "next-intl";
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
  const t = useTranslations("users.editProfile");
  // The header's theme control names the same three choices, so the two menus
  // read the same however the wording there is revised.
  const nav = useTranslations("common.nav");
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

  const siteThemes = [
    { value: "auto", label: t("themeSystem") },
    { value: "light", label: nav("themeLight") },
    { value: "dark", label: nav("themeDark") },
  ];

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
      setMessage(t("saved"));
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : t("failed"));
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

      <Panel title={t("profile")}>
        <Field
          label={t("about")}
          htmlFor="profile-about"
          optional={t("optional")}
          hint={canEditAbout ? t("aboutHint") : t("aboutLocked")}
        >
          <MarkdownEditor
            id="profile-about"
            preset="self-description"
            value={form.about}
            onChange={(value) => change("about", value)}
            disabled={!canEditAbout}
            disabledReason={t("aboutDisabled")}
            maxLength={20000}
            placeholder={t("aboutPlaceholder")}
            ariaLabel={t("about")}
          />
        </Field>
      </Panel>

      <Panel title={t("preferences")}>
        <FieldGroup columns={2}>
          <Field label={t("timezone")} htmlFor="profile-timezone" hint={t("timezoneHint")}>
            <Select
              id="profile-timezone"
              ariaLabel={t("timezone")}
              value={form.timezone}
              onValueChange={(value) => change("timezone", value)}
              options={timezones.map((zone) => ({ value: zone, label: zone }))}
            />
          </Field>

          <Field label={t("language")} htmlFor="profile-language" hint={t("languageHint")}>
            <Select
              id="profile-language"
              ariaLabel={t("language")}
              value={form.languageKey}
              onValueChange={(value) => change("languageKey", value)}
              options={languages.map((language) => ({ value: language.key, label: language.name }))}
            />
          </Field>

          <Field label={t("siteTheme")} htmlFor="profile-site-theme" hint={t("siteThemeHint")}>
            <Select
              id="profile-site-theme"
              ariaLabel={t("siteTheme")}
              value={form.siteTheme}
              onValueChange={(value) => chooseTheme(value as ThemeChoice)}
              options={siteThemes}
            />
          </Field>

          <Field label={t("editorTheme")} htmlFor="profile-editor-theme" hint={t("editorThemeHint")}>
            <Select
              id="profile-editor-theme"
              ariaLabel={t("editorTheme")}
              value={form.editorTheme}
              onValueChange={(value) => change("editorTheme", value)}
              options={EDITOR_THEMES}
            />
          </Field>
        </FieldGroup>
      </Panel>

      <Panel title={t("organizations")}>
        <Field
          label={t("yourOrganizations")}
          htmlFor="profile-organizations"
          optional={t("optional")}
          hint={t("organizationsHint", {
            chosen: form.organizationSlugs.length,
            max: MAX_ORGANIZATIONS,
          })}
        >
          <MultiSelect
            id="profile-organizations"
            ariaLabel={t("organizations")}
            values={form.organizationSlugs}
            onChange={(values) => change("organizationSlugs", values)}
            max={MAX_ORGANIZATIONS}
            placeholder={t("organizationsPlaceholder")}
            emptyText={t("organizationsEmpty")}
            options={organizations.map((organization) => ({
              value: organization.slug,
              label: organization.name,
            }))}
          />
        </Field>
      </Panel>

      <FormFooter note={dirty ? t("unsaved") : undefined}>
        <Button
          type="submit"
          busy={status === "saving"}
          disabled={!dirty && status !== "error"}
          title={!dirty && status !== "error" ? t("nothingChanged") : undefined}
        >
          {status === "saving" ? t("saving") : t("submit")}
        </Button>
      </FormFooter>
    </form>
  );
}
