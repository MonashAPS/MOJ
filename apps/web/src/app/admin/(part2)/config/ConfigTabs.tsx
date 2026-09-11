"use client";

import { api } from "@convex/_generated/api";
import { Button, Checkbox, Field, FieldGroup, Input, Panel, Select, Tabs, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminForm } from "@/components/admin/AdminForm";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { ConfirmAction, StatusLine } from "../_components/console";
import { RecordDialog } from "../_components/RecordDialog";

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
  { value: "all", label: "Everyone can read every submission" },
  { value: "all-solved", label: "Only members who solved the problem" },
  { value: "only-own", label: "Only the author and staff" },
];

/** The keys DMOJ ships templates for, with what each one does. */
const KEY_HELP: Record<string, string> = {
  announcement: "HTML for the box that floats bottom-right on every page. Empty hides it.",
  footer: "The line beside “proudly powered by MOJ”.",
  home_page_top: "HTML above the home page's columns.",
  home_page_bottom: "HTML below the home page's columns.",
  site_name: "Overrides the site name in the page title.",
  meta_keywords: "The meta keywords tag.",
  analytics: "Analytics snippet, injected into the head.",
  problem_list_header: "HTML above the problem list.",
  contest_list_header: "HTML above the contest list.",
  user_list_header: "HTML above the leaderboard.",
};

export function ConfigTabs({
  settings,
  languages,
  timezones,
}: {
  settings: Settings;
  languages: Array<{ key: string; name: string }>;
  timezones: string[];
}) {
  return (
    <Tabs
      panels={[
        {
          key: "settings",
          label: "Site settings",
          content: <SettingsForm settings={settings} languages={languages} timezones={timezones} />,
        },
        { key: "misc", label: "Misc config", content: <MiscConfig /> },
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
    if (reason.trim().length === 0) {
      setStatus({ error: "Give a reason for the change; it is recorded on the revision." });
      return;
    }
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
        submissionSourceVisibility: form.submissionSourceVisibility as "all" | "all-solved" | "only-own",
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
      setStatus({ saved: "The site settings have been saved." });
      setReason("");
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "The settings could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <Panel title="Site settings" bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">
          The settings document has not been created on this deployment yet.
        </p>
      </Panel>
    );
  }

  return (
    <AdminForm
      onSubmit={submit}
      reason={reason}
      onReasonChange={setReason}
      dirty={dirty}
      busy={busy}
      error={status.error ?? null}
      saved={status.saved ?? null}
      submitLabel="Save settings"
    >
      <Panel title="Identity" bodyClassName="grid gap-4 p-3">
        <FieldGroup columns={2}>
          <Field label="Site name" hint="The short name in a page title.">
            <Input value={form.siteName} onChange={(event) => change("siteName", event.target.value)} />
          </Field>
          <Field label="Long name" hint="The full name, used in emails.">
            <Input
              value={form.siteLongName}
              onChange={(event) => change("siteLongName", event.target.value)}
            />
          </Field>
          <Field label="Admin email" hint="Where members are told to write.">
            <Input
              type="email"
              mono
              value={form.siteAdminEmail}
              onChange={(event) => change("siteAdminEmail", event.target.value)}
            />
          </Field>
          <Field label="Analytics" optional=" (optional)" hint="Injected into the head of every page.">
            <Input
              mono
              value={form.analytics}
              onChange={(event) => change("analytics", event.target.value)}
            />
          </Field>
        </FieldGroup>
      </Panel>

      <Panel title="Accounts" bodyClassName="grid gap-4 p-3">
        <FieldGroup columns={2}>
          <Field label="Default timezone" hint="What a new account starts with.">
            <Select
              options={timezones.map((zone) => ({ value: zone, label: zone }))}
              value={form.defaultUserTimezone}
              onValueChange={(value) => change("defaultUserTimezone", value)}
              ariaLabel="Default timezone"
            />
          </Field>
          <Field label="Default language" hint="What the submit page opens with for a new account.">
            <Select
              options={languages.map((language) => ({ value: language.key, label: language.name }))}
              value={form.defaultUserLanguageKey}
              onValueChange={(value) => change("defaultUserLanguageKey", value)}
              ariaLabel="Default language"
              placeholder="Pick a language"
            />
          </Field>
        </FieldGroup>
        <FieldGroup columns={2}>
          <Checkbox
            checked={form.registrationOpen}
            onCheckedChange={(value) => change("registrationOpen", value)}
            label="Registration is open"
          />
          <Checkbox
            checked={form.requireStaffTwoFactor}
            onCheckedChange={(value) => change("requireStaffTwoFactor", value)}
            label="Staff must have two-factor authentication"
          />
          <Checkbox
            checked={form.enableComments}
            onCheckedChange={(value) => change("enableComments", value)}
            label="Comments are enabled"
          />
          <Checkbox
            checked={form.pdfEnabled}
            onCheckedChange={(value) => change("pdfEnabled", value)}
            label="Statements can be downloaded as PDF"
          />
        </FieldGroup>
      </Panel>

      <Panel title="Submissions" bodyClassName="grid gap-4 p-3">
        <FieldGroup columns={2}>
          <Field label="Source visibility" hint="Who may read another member's source.">
            <Select
              options={SOURCE_VISIBILITY}
              value={form.submissionSourceVisibility}
              onValueChange={(value) =>
                change("submissionSourceVisibility", value as "all" | "all-solved" | "only-own")
              }
              ariaLabel="Source visibility"
            />
          </Field>
          <Field label="Submissions per minute" hint="Per member, across the whole site.">
            <Input
              type="number"
              mono
              value={form.submissionLimitPerMinute}
              onChange={(event) => change("submissionLimitPerMinute", event.target.value)}
            />
          </Field>
          <Field label="Submissions per problem" optional=" (optional)" hint="Blank means no cap.">
            <Input
              type="number"
              mono
              value={form.maxSubmissionsPerProblem}
              onChange={(event) => change("maxSubmissionsPerProblem", event.target.value)}
            />
          </Field>
          <Field label="MOSS key" optional=" (optional)" hint="Without it the plagiarism job refuses to run.">
            <Input
              mono
              value={form.mossApiKey}
              onChange={(event) => change("mossApiKey", event.target.value)}
            />
          </Field>
        </FieldGroup>
      </Panel>

      <Panel title="Points and ratings" bodyClassName="grid gap-4 p-3">
        <FieldGroup columns={2}>
          <Field label="Performance point step" hint="DMOJ's PP_STEP: how fast a solve's weight decays.">
            <Input
              type="number"
              mono
              step="0.01"
              value={form.ppStep}
              onChange={(event) => change("ppStep", event.target.value)}
            />
          </Field>
          <Field label="Performance point entries" hint="DMOJ's PP_ENTRIES: how many solves count.">
            <Input
              type="number"
              mono
              value={form.ppEntries}
              onChange={(event) => change("ppEntries", event.target.value)}
            />
          </Field>
          <Field label="Rating ratios" hint="Comma separated, in rank order, as DMOJ's RATING_LEVELS.">
            <Input
              mono
              value={form.ratingRatios}
              onChange={(event) => change("ratingRatios", event.target.value)}
            />
          </Field>
          <Field
            label="Language stats threshold"
            hint="Minimum submissions before a language appears in the stats."
          >
            <Input
              type="number"
              mono
              value={form.statsLanguageThreshold}
              onChange={(event) => change("statsLanguageThreshold", event.target.value)}
            />
          </Field>
        </FieldGroup>
      </Panel>

      <Panel title="Page sizes" bodyClassName="grid gap-4 p-3">
        <FieldGroup columns={2}>
          <Field label="Problems per page">
            <Input
              type="number"
              mono
              value={form.problemsPerPage}
              onChange={(event) => change("problemsPerPage", event.target.value)}
            />
          </Field>
          <Field label="Submissions per page">
            <Input
              type="number"
              mono
              value={form.submissionsPerPage}
              onChange={(event) => change("submissionsPerPage", event.target.value)}
            />
          </Field>
          <Field label="Leaderboard rows per page">
            <Input
              type="number"
              mono
              value={form.userRankingsPerPage}
              onChange={(event) => change("userRankingsPerPage", event.target.value)}
            />
          </Field>
          <Field label="Blog posts per page">
            <Input
              type="number"
              mono
              value={form.blogPostsPerPage}
              onChange={(event) => change("blogPostsPerPage", event.target.value)}
            />
          </Field>
          <Field label="Comments per page">
            <Input
              type="number"
              mono
              value={form.commentsPerPage}
              onChange={(event) => change("commentsPerPage", event.target.value)}
            />
          </Field>
          <Field label="Tickets per page">
            <Input
              type="number"
              mono
              value={form.ticketsPerPage}
              onChange={(event) => change("ticketsPerPage", event.target.value)}
            />
          </Field>
        </FieldGroup>
      </Panel>

      <Panel title="Community" bodyClassName="grid gap-4 p-3">
        <FieldGroup columns={2}>
          <Field label="Hide a comment below" hint="A comment scoring under this is collapsed.">
            <Input
              type="number"
              mono
              value={form.commentVoteHideThreshold}
              onChange={(event) => change("commentVoteHideThreshold", event.target.value)}
            />
          </Field>
          <Field
            label="Reply window (days)"
            hint="How long a thread stays open for replies. 0 means forever."
          >
            <Input
              type="number"
              mono
              value={form.commentReplyTimeframeDays}
              onChange={(event) => change("commentReplyTimeframeDays", event.target.value)}
            />
          </Field>
          <Field label="Longest comment" hint="Characters.">
            <Input
              type="number"
              mono
              value={form.commentMaxBodyLength}
              onChange={(event) => change("commentMaxBodyLength", event.target.value)}
            />
          </Field>
          <Field label="New problems on the home page" hint="How many the side box lists.">
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

type ConfigRow = { _id: string; key: string; value: string };

function MiscConfig() {
  const data = useQuery(api.admin.site.configRows, {}) as
    | { rows: ConfigRow[]; knownKeys: string[] }
    | undefined;
  const setConfig = useMutation(api.admin.site.setConfig);
  const deleteConfig = useMutation(api.admin.site.deleteConfig);

  const [draft, setDraft] = useState<{ key: string; value: string; existing: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

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
    if (reason.trim().length === 0) {
      setError("Give a reason for the change; it is recorded on the revision.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setConfig({ key: draft.key, value: draft.value, reason });
      setMessage({ tone: "ok", text: `${draft.key} has been saved.` });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That value could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<{ key: string; value: string; set: boolean; known: boolean }>[] = [
    {
      key: "key",
      header: "Key",
      cell: (row) => (
        <span className="grid">
          <span className="font-mono text-mono font-medium text-foreground">{row.key}</span>
          {KEY_HELP[row.key] ? (
            <span className="text-sm text-muted-foreground">{KEY_HELP[row.key]}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "value",
      header: "Value",
      cell: (row) =>
        row.value ? (
          <span className="line-clamp-2 max-w-[520px] font-mono text-mono text-subtle">{row.value}</span>
        ) : (
          <span className="text-muted-foreground">{row.set ? "Empty" : "Not set"}</span>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
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
            Edit
          </Button>
          <ConfirmAction
            trigger={
              <Button
                variant="ghost"
                size="sm"
                disabled={!row.set}
                title={row.set ? undefined : "There is nothing stored under that key."}
              >
                Clear
              </Button>
            }
            title={`Clear ${row.key}?`}
            description="The row is deleted and the site falls back to its built-in default."
            confirmLabel="Clear value"
            onConfirm={async () => {
              try {
                await deleteConfig({ key: row.key, reason: "Cleared from the console" });
                setMessage({ tone: "ok", text: `${row.key} has been cleared.` });
              } catch (caught) {
                setMessage({
                  tone: "bad",
                  text: caught instanceof Error ? caught.message : "That value could not be cleared.",
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
              DMOJ&rsquo;s <code className="font-mono">MiscConfig</code>: raw HTML fragments the site drops
              into a page. Everything here is trusted and rendered as written.
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
              New key
            </Button>
          </>
        }
        emptyTitle="No configuration"
        emptyDescription="Nothing has been overridden on this deployment."
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={
          draft?.existing ? `Edit ${draft.key}` : draft?.key ? `Set ${draft.key}` : "New configuration key"
        }
        description={draft?.key ? KEY_HELP[draft.key] : undefined}
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel="Save value"
        width={720}
      >
        <Field label="Key" hint="At most 30 characters.">
          <Input
            mono
            maxLength={30}
            value={draft?.key ?? ""}
            disabled={draft?.existing}
            title={draft?.existing ? "Clear the value and add it again to rename a key." : undefined}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, key: event.target.value } : current))
            }
          />
        </Field>
        <Field label="Value" hint="HTML, inserted as written. Leave blank to show nothing.">
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
