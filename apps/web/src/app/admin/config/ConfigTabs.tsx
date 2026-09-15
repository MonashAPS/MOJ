"use client";

import { api } from "@convex/_generated/api";
import { Button, Checkbox, Field, FieldGroup, Input, Panel, Select, Tabs, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  type AdminColumn,
  AdminForm,
  AdminTable,
  ConfirmAction,
  RecordDialog,
  StatusLine,
} from "@/components/admin";

type Settings = {
  siteName: string;
  siteLongName: string;
  siteAdminEmail: string;
  registrationOpen: boolean;
  defaultUserTimezone: string;
  defaultUserLanguageKey: string;
  problemsPerPage: number;
  commentsPerPage: number;
  submissionsPerPage: number;
  userRankingsPerPage: number;
  blogPostsPerPage: number;
  ticketsPerPage?: number;
  ratingRatios: number[];
  requireStaffTwoFactor: boolean;
  pdfEnabled: boolean;
  mossApiKey?: string;
  analytics?: string;
  enableComments?: boolean;
  commentVoteHideThreshold?: number;
  commentReplyTimeframeDays?: number;
  commentMaxBodyLength?: number;
  blogNewProblemCount?: number;
  statsLanguageThreshold?: number;
  submissionSourceVisibility?: "all" | "all-solved" | "only-own";
  submissionLimitPerMinute?: number;
  maxSubmissionsPerProblem?: number;
  ppStep?: number;
  ppEntries?: number;
} | null;

const SOURCE_VISIBILITY = [
  { value: "all", labelKey: "all" },
  { value: "all-solved", labelKey: "allSolved" },
  { value: "only-own", labelKey: "onlyOwn" },
] as const;

export function ConfigTabs({
  settings,
  languages,
  timezones,
}: {
  settings: Settings;
  languages: Array<{ key: string; name: string }>;
  timezones: string[];
}) {
  const t = useTranslations("admin.config.tabs");

  return (
    <Tabs
      panels={[
        {
          key: "settings",
          label: t("settings"),
          content: <SettingsForm settings={settings} languages={languages} timezones={timezones} />,
        },
        { key: "misc", label: t("misc"), content: <MiscConfig /> },
      ]}
    />
  );
}

function num(value: number | undefined, fallback = ""): string {
  return value === undefined ? fallback : String(value);
}

function SettingsForm({
  settings,
  languages,
  timezones,
}: {
  settings: Settings;
  languages: Array<{ key: string; name: string }>;
  timezones: string[];
}) {
  const t = useTranslations("admin.config.settings");
  const save = useMutation(api.admin.site.updateSettings);

  const initial = useMemo(
    () => ({
      siteName: settings?.siteName ?? "",
      siteLongName: settings?.siteLongName ?? "",
      siteAdminEmail: settings?.siteAdminEmail ?? "",
      registrationOpen: settings?.registrationOpen ?? true,
      requireStaffTwoFactor: settings?.requireStaffTwoFactor ?? true,
      pdfEnabled: settings?.pdfEnabled ?? true,
      enableComments: settings?.enableComments ?? true,
      defaultUserTimezone: settings?.defaultUserTimezone ?? "Australia/Melbourne",
      defaultUserLanguageKey: settings?.defaultUserLanguageKey ?? "",
      problemsPerPage: num(settings?.problemsPerPage),
      submissionsPerPage: num(settings?.submissionsPerPage),
      commentsPerPage: num(settings?.commentsPerPage),
      userRankingsPerPage: num(settings?.userRankingsPerPage),
      blogPostsPerPage: num(settings?.blogPostsPerPage),
      ticketsPerPage: num(settings?.ticketsPerPage),
      submissionLimitPerMinute: num(settings?.submissionLimitPerMinute),
      maxSubmissionsPerProblem: num(settings?.maxSubmissionsPerProblem),
      submissionSourceVisibility: settings?.submissionSourceVisibility ?? "all-solved",
      ppStep: num(settings?.ppStep),
      ppEntries: num(settings?.ppEntries),
      ratingRatios: (settings?.ratingRatios ?? []).join(", "),
      mossApiKey: settings?.mossApiKey ?? "",
      analytics: settings?.analytics ?? "",
      blogNewProblemCount: num(settings?.blogNewProblemCount),
      statsLanguageThreshold: num(settings?.statsLanguageThreshold),
      commentVoteHideThreshold: num(settings?.commentVoteHideThreshold),
      commentReplyTimeframeDays: num(settings?.commentReplyTimeframeDays),
      commentMaxBodyLength: num(settings?.commentMaxBodyLength),
    }),
    [settings],
  );

  const [form, setForm] = useState(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ error?: string; saved?: string }>({});

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  function change<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus({});
  }

  function optionalNumber(value: string): number | undefined {
    const trimmed = value.trim();

    if (trimmed === "") return undefined;
    const parsed = Number(trimmed);

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  async function submit() {
    setBusy(true);

    try {
      await save({
        siteName: form.siteName,
        siteLongName: form.siteLongName,
        siteAdminEmail: form.siteAdminEmail,
        registrationOpen: form.registrationOpen,
        requireStaffTwoFactor: form.requireStaffTwoFactor,
        pdfEnabled: form.pdfEnabled,
        enableComments: form.enableComments,
        defaultUserTimezone: form.defaultUserTimezone,
        defaultUserLanguageKey: form.defaultUserLanguageKey,
        problemsPerPage: optionalNumber(form.problemsPerPage),
        submissionsPerPage: optionalNumber(form.submissionsPerPage),
        commentsPerPage: optionalNumber(form.commentsPerPage),
        userRankingsPerPage: optionalNumber(form.userRankingsPerPage),
        blogPostsPerPage: optionalNumber(form.blogPostsPerPage),
        ticketsPerPage: optionalNumber(form.ticketsPerPage),
        submissionLimitPerMinute: optionalNumber(form.submissionLimitPerMinute),
        maxSubmissionsPerProblem: optionalNumber(form.maxSubmissionsPerProblem),
        submissionSourceVisibility: form.submissionSourceVisibility,
        ppStep: optionalNumber(form.ppStep),
        ppEntries: optionalNumber(form.ppEntries),
        blogNewProblemCount: optionalNumber(form.blogNewProblemCount),
        statsLanguageThreshold: optionalNumber(form.statsLanguageThreshold),
        commentVoteHideThreshold: optionalNumber(form.commentVoteHideThreshold),
        commentReplyTimeframeDays: optionalNumber(form.commentReplyTimeframeDays),
        commentMaxBodyLength: optionalNumber(form.commentMaxBodyLength),
        ratingRatios: form.ratingRatios
          .split(",")
          .map((part) => Number(part.trim()))
          .filter((value) => Number.isFinite(value)),
        mossApiKey: form.mossApiKey,
        analytics: form.analytics,
        reason,
      });
      setStatus({ saved: t("saved") });
      setReason("");
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <Panel title={t("missingTitle")} bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">{t("missing")}</p>
      </Panel>
    );
  }

  return (
    <AdminForm
      onSubmit={submit}
      managed
      dirty={dirty}
      busy={busy}
      error={status.error ?? null}
      saved={status.saved ?? null}
      submitLabel={t("submit")}
    >
      <Panel title={t("identity")} bodyClassName="grid gap-4 p-3">
        <FieldGroup columns={2}>
          <Field label={t("siteName")} hint={t("siteNameHint")}>
            <Input value={form.siteName} onChange={(event) => change("siteName", event.target.value)} />
          </Field>
          <Field label={t("longName")} hint={t("longNameHint")}>
            <Input
              value={form.siteLongName}
              onChange={(event) => change("siteLongName", event.target.value)}
            />
          </Field>
          <Field label={t("adminEmail")} hint={t("adminEmailHint")}>
            <Input
              type="email"
              mono
              value={form.siteAdminEmail}
              onChange={(event) => change("siteAdminEmail", event.target.value)}
            />
          </Field>
          <Field label={t("analytics")} optional={t("optional")} hint={t("analyticsHint")}>
            <Input
              mono
              value={form.analytics}
              onChange={(event) => change("analytics", event.target.value)}
            />
          </Field>
        </FieldGroup>
      </Panel>

      <Panel title={t("accounts")} bodyClassName="grid gap-4 p-3">
        <FieldGroup columns={2}>
          <Field label={t("defaultTimezone")} hint={t("defaultTimezoneHint")}>
            <Select
              options={timezones.map((zone) => ({ value: zone, label: zone }))}
              value={form.defaultUserTimezone}
              onValueChange={(value) => change("defaultUserTimezone", value)}
              ariaLabel={t("defaultTimezone")}
            />
          </Field>
          <Field label={t("defaultLanguage")} hint={t("defaultLanguageHint")}>
            <Select
              options={languages.map((language) => ({ value: language.key, label: language.name }))}
              value={form.defaultUserLanguageKey}
              onValueChange={(value) => change("defaultUserLanguageKey", value)}
              ariaLabel={t("defaultLanguage")}
              placeholder={t("defaultLanguagePlaceholder")}
            />
          </Field>
        </FieldGroup>
        <FieldGroup columns={2}>
          <Checkbox
            checked={form.registrationOpen}
            onCheckedChange={(value) => change("registrationOpen", value)}
            label={t("registrationOpen")}
          />
          <Checkbox
            checked={form.requireStaffTwoFactor}
            onCheckedChange={(value) => change("requireStaffTwoFactor", value)}
            label={t("requireStaffTwoFactor")}
          />
          <Checkbox
            checked={form.enableComments}
            onCheckedChange={(value) => change("enableComments", value)}
            label={t("enableComments")}
          />
          <Checkbox
            checked={form.pdfEnabled}
            onCheckedChange={(value) => change("pdfEnabled", value)}
            label={t("pdfEnabled")}
          />
        </FieldGroup>
      </Panel>

      <Panel title={t("submissions")} bodyClassName="grid gap-4 p-3">
        <FieldGroup columns={2}>
          <Field label={t("sourceVisibility")} hint={t("sourceVisibilityHint")}>
            <Select
              options={SOURCE_VISIBILITY.map((option) => ({
                value: option.value,
                label: t(`sourceVisibilityOptions.${option.labelKey}`),
              }))}
              value={form.submissionSourceVisibility}
              onValueChange={(value) => {
                const chosen = SOURCE_VISIBILITY.find((option) => option.value === value);

                if (chosen) change("submissionSourceVisibility", chosen.value);
              }}
              ariaLabel={t("sourceVisibility")}
            />
          </Field>
          <Field label={t("submissionsPerMinute")} hint={t("submissionsPerMinuteHint")}>
            <Input
              type="number"
              mono
              value={form.submissionLimitPerMinute}
              onChange={(event) => change("submissionLimitPerMinute", event.target.value)}
            />
          </Field>
          <Field
            label={t("submissionsPerProblem")}
            optional={t("optional")}
            hint={t("submissionsPerProblemHint")}
          >
            <Input
              type="number"
              mono
              value={form.maxSubmissionsPerProblem}
              onChange={(event) => change("maxSubmissionsPerProblem", event.target.value)}
            />
          </Field>
          <Field label={t("mossKey")} optional={t("optional")} hint={t("mossKeyHint")}>
            <Input
              mono
              value={form.mossApiKey}
              onChange={(event) => change("mossApiKey", event.target.value)}
            />
          </Field>
        </FieldGroup>
      </Panel>

      <Panel title={t("pointsAndRatings")} bodyClassName="grid gap-4 p-3">
        <FieldGroup columns={2}>
          <Field label={t("ppStep")} hint={t("ppStepHint")}>
            <Input
              type="number"
              mono
              step="0.01"
              value={form.ppStep}
              onChange={(event) => change("ppStep", event.target.value)}
            />
          </Field>
          <Field label={t("ppEntries")} hint={t("ppEntriesHint")}>
            <Input
              type="number"
              mono
              value={form.ppEntries}
              onChange={(event) => change("ppEntries", event.target.value)}
            />
          </Field>
          <Field label={t("ratingRatios")} hint={t("ratingRatiosHint")}>
            <Input
              mono
              value={form.ratingRatios}
              onChange={(event) => change("ratingRatios", event.target.value)}
            />
          </Field>
          <Field label={t("statsLanguageThreshold")} hint={t("statsLanguageThresholdHint")}>
            <Input
              type="number"
              mono
              value={form.statsLanguageThreshold}
              onChange={(event) => change("statsLanguageThreshold", event.target.value)}
            />
          </Field>
        </FieldGroup>
      </Panel>

      <Panel title={t("pageSizes")} bodyClassName="grid gap-4 p-3">
        <FieldGroup columns={2}>
          <Field label={t("problemsPerPage")}>
            <Input
              type="number"
              mono
              value={form.problemsPerPage}
              onChange={(event) => change("problemsPerPage", event.target.value)}
            />
          </Field>
          <Field label={t("submissionsPerPage")}>
            <Input
              type="number"
              mono
              value={form.submissionsPerPage}
              onChange={(event) => change("submissionsPerPage", event.target.value)}
            />
          </Field>
          <Field label={t("userRankingsPerPage")}>
            <Input
              type="number"
              mono
              value={form.userRankingsPerPage}
              onChange={(event) => change("userRankingsPerPage", event.target.value)}
            />
          </Field>
          <Field label={t("blogPostsPerPage")}>
            <Input
              type="number"
              mono
              value={form.blogPostsPerPage}
              onChange={(event) => change("blogPostsPerPage", event.target.value)}
            />
          </Field>
          <Field label={t("commentsPerPage")}>
            <Input
              type="number"
              mono
              value={form.commentsPerPage}
              onChange={(event) => change("commentsPerPage", event.target.value)}
            />
          </Field>
          <Field label={t("ticketsPerPage")}>
            <Input
              type="number"
              mono
              value={form.ticketsPerPage}
              onChange={(event) => change("ticketsPerPage", event.target.value)}
            />
          </Field>
        </FieldGroup>
      </Panel>

      <Panel title={t("community")} bodyClassName="grid gap-4 p-3">
        <FieldGroup columns={2}>
          <Field label={t("commentVoteHideThreshold")} hint={t("commentVoteHideThresholdHint")}>
            <Input
              type="number"
              mono
              value={form.commentVoteHideThreshold}
              onChange={(event) => change("commentVoteHideThreshold", event.target.value)}
            />
          </Field>
          <Field label={t("commentReplyTimeframeDays")} hint={t("commentReplyTimeframeDaysHint")}>
            <Input
              type="number"
              mono
              value={form.commentReplyTimeframeDays}
              onChange={(event) => change("commentReplyTimeframeDays", event.target.value)}
            />
          </Field>
          <Field label={t("commentMaxBodyLength")} hint={t("commentMaxBodyLengthHint")}>
            <Input
              type="number"
              mono
              value={form.commentMaxBodyLength}
              onChange={(event) => change("commentMaxBodyLength", event.target.value)}
            />
          </Field>
          <Field label={t("blogNewProblemCount")} hint={t("blogNewProblemCountHint")}>
            <Input
              type="number"
              mono
              value={form.blogNewProblemCount}
              onChange={(event) => change("blogNewProblemCount", event.target.value)}
            />
          </Field>
        </FieldGroup>
      </Panel>
    </AdminForm>
  );
}

function MiscConfig() {
  const t = useTranslations("admin.config.misc");
  const actions = useTranslations("common.actions");

  const data = useQuery(api.admin.site.configRows, {});

  const setConfig = useMutation(api.admin.site.setConfig);
  const deleteConfig = useMutation(api.admin.site.deleteConfig);

  const [draft, setDraft] = useState<{ key: string; value: string; existing: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  /** The keys DMOJ ships templates for carry a line saying what each one does;
   *  a key the operator invented has none. */
  function help(key: string): string | undefined {
    return t.has(`keyHelp.${key}`) ? t(`keyHelp.${key}`) : undefined;
  }

  /** Every known key is offered, whether or not a row exists for it yet. */
  const rows = useMemo(() => {
    if (!data) return undefined;
    const byKey = new Map(data.rows.map((row) => [row.key, row]));

    const merged = data.knownKeys.map((key) => ({
      key,
      value: byKey.get(key)?.value ?? "",
      set: byKey.has(key),
      known: true,
    }));

    for (const row of data.rows) {
      if (!data.knownKeys.includes(row.key)) {
        merged.push({ key: row.key, value: row.value, set: true, known: false });
      }
    }

    return merged;
  }, [data]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);

    try {
      await setConfig({ key: draft.key, value: draft.value, reason });
      setMessage({ tone: "ok", text: t("saved", { key: draft.key }) });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<{ key: string; value: string; set: boolean; known: boolean }>[] = [
    {
      key: "key",
      header: t("columnKey"),
      cell: (row) => {
        const line = help(row.key);

        return (
          <span className="grid">
            <span className="font-mono text-mono font-medium text-foreground">{row.key}</span>
            {line ? <span className="text-sm text-muted-foreground">{line}</span> : null}
          </span>
        );
      },
    },
    {
      key: "value",
      header: t("columnValue"),
      cell: (row) =>
        row.value ? (
          <span className="line-clamp-2 max-w-[520px] font-mono text-mono text-subtle">{row.value}</span>
        ) : (
          <span className="text-muted-foreground">{row.set ? t("valueEmpty") : t("valueNotSet")}</span>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columnActions")}</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDraft({ key: row.key, value: row.value, existing: row.set });
              setReason("");
              setError(null);
            }}
          >
            {actions("edit")}
          </Button>
          <ConfirmAction
            trigger={
              <Button
                variant="ghost"
                size="sm"
                disabled={!row.set}
                title={row.set ? undefined : t("clearDisabled")}
              >
                {t("clear")}
              </Button>
            }
            title={t("clearTitle", { key: row.key })}
            description={t("clearDescription")}
            confirmLabel={t("clearConfirm")}
            onConfirm={async () => {
              try {
                await deleteConfig({ key: row.key, reason: "Cleared from the console" });
                setMessage({ tone: "ok", text: t("cleared", { key: row.key }) });
              } catch (caught) {
                setMessage({
                  tone: "bad",
                  text: caught instanceof Error ? caught.message : t("clearFailed"),
                });
              }
            }}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      {message ? <StatusLine tone={message.tone}>{message.text}</StatusLine> : null}
      <AdminTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        toolbar={
          <>
            <span className="text-sm text-muted-foreground">
              {t.rich("toolbarNote", {
                code: (chunks) => <code className="font-mono">{chunks}</code>,
              })}
            </span>
            <Button
              className="ml-auto"
              size="sm"
              icon={<Plus aria-hidden />}
              onClick={() => {
                setDraft({ key: "", value: "", existing: false });
                setReason("");
                setError(null);
              }}
            >
              {t("newKey")}
            </Button>
          </>
        }
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={
          draft?.existing
            ? t("editTitle", { key: draft.key })
            : draft?.key
              ? t("setTitle", { key: draft.key })
              : t("newTitle")
        }
        description={draft?.key ? help(draft.key) : undefined}
        onSubmit={save}
        busy={busy}
        error={error}
        submitLabel={t("submit")}
        width={720}
      >
        <Field label={t("keyLabel")} hint={t("keyHint")}>
          <Input
            mono
            maxLength={30}
            value={draft?.key ?? ""}
            disabled={draft?.existing}
            title={draft?.existing ? t("keyLocked") : undefined}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, key: event.target.value } : current))
            }
          />
        </Field>
        <Field label={t("valueLabel")} hint={t("valueHint")}>
          <Textarea
            mono
            rows={8}
            value={draft?.value ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, value: event.target.value } : current))
            }
          />
        </Field>
      </RecordDialog>
    </div>
  );
}
