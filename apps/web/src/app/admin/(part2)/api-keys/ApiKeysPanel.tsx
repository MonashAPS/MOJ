"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  Field,
  FieldGroup,
  Input,
  Panel,
} from "@moj/ui";
import { AlertTriangle, KeyRound, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { formatDateTime } from "@/lib/format";
import { ConfirmAction, CopyButton, DASH, Flags, StatusLine } from "../_components/console";
import { RecordDialog } from "../_components/RecordDialog";
import { createKeyAction, listKeysAction, revokeKeyAction } from "./actions";
import { API_KEY_SCOPES, type ConsoleKeyRow } from "./scopes";

export function ApiKeysPanel({ username, apiUrl }: { username: string; apiUrl: string }) {
  const t = useTranslations("admin.apiKeys");
  const [rows, setRows] = useState<ConsoleKeyRow[] | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const [draft, setDraft] = useState<{ name: string; scopes: string[]; expiresInDays: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ key: string; row: ConsoleKeyRow; warning?: string } | null>(null);

  function refresh() {
    startTransition(async () => {
      const result = await listKeysAction();
      if (result.ok) setRows(result.data);
      else {
        setRows([]);
        setMessage({ tone: "bad", text: result.error });
      }
    });
  }

  useEffect(refresh, []);

  async function create() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const result = await createKeyAction({
      name: draft.name,
      scopes: draft.scopes,
      expiresInDays: draft.expiresInDays.trim() === "" ? null : Number(draft.expiresInDays),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setIssued(result.data);
    setDraft(null);
    refresh();
  }

  const columns: AdminColumn<ConsoleKeyRow>[] = [
    { key: "name", header: t("columnName"), cell: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: "start",
      header: t("columnStart"),
      cell: (row) => <span className="font-mono text-mono">{row.start ? `${row.start}…` : DASH}</span>,
    },
    {
      key: "scopes",
      header: t("columnScopes"),
      cell: (row) =>
        row.scopes.length === 0 ? (
          <span className="text-muted-foreground">{DASH}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {row.scopes.map((scope) => (
              <Badge key={scope} variant="outline" mono>
                {scope}
              </Badge>
            ))}
          </span>
        ),
    },
    {
      key: "state",
      header: t("columnState"),
      cell: (row) => (
        <Flags
          flags={[
            { on: row.enabled, label: t("stateEnabled"), tone: "good" },
            { on: !row.enabled, label: t("stateDisabled"), tone: "bad" },
            { on: !row.mirrored, label: t("stateSiteOnly"), tone: "warn" },
            {
              on: row.expiresAt !== null && row.expiresAt < Date.now(),
              label: t("stateExpired"),
              tone: "bad",
            },
          ]}
        />
      ),
    },
    {
      key: "created",
      header: t("columnCreated"),
      numeric: true,
      cell: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "expires",
      header: t("columnExpires"),
      numeric: true,
      cell: (row) => (row.expiresAt === null ? t("never") : formatDateTime(row.expiresAt)),
    },
    {
      key: "used",
      header: t("columnLastUsed"),
      numeric: true,
      cell: (row) => (row.lastUsedAt === null ? DASH : formatDateTime(row.lastUsedAt)),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columnActions")}</span>,
      cell: (row) => (
        <ConfirmAction
          trigger={
            <Button variant="ghost" size="sm">
              {t("revoke")}
            </Button>
          }
          title={t("revokeTitle", { name: row.name })}
          description={t("revokeDescription")}
          confirmLabel={t("revokeConfirm")}
          onConfirm={async () => {
            const result = await revokeKeyAction(row.id, row.convexId);
            if (result.ok) {
              setMessage({ tone: "ok", text: t("revokedMessage", { name: row.name }) });
              refresh();
            } else {
              setMessage({ tone: "bad", text: result.error });
            }
          }}
        />
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      {message ? <StatusLine tone={message.tone}>{message.text}</StatusLine> : null}

      <AdminTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        toolbar={
          <>
            <span className="text-sm text-muted-foreground">
              {username ? t("ownership", { username }) : t("ownershipSelf")}
            </span>
            <Button
              className="ml-auto"
              size="sm"
              icon={<Plus aria-hidden />}
              onClick={() => {
                setDraft({ name: "", scopes: ["problems:write"], expiresInDays: "" });
                setError(null);
              }}
            >
              {t("newKey")}
            </Button>
          </>
        }
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
        emptyAction={
          <Button
            variant="secondary"
            onClick={() => setDraft({ name: "", scopes: ["problems:write"], expiresInDays: "" })}
          >
            {t("newKey")}
          </Button>
        }
      />

      <Panel title={t("usageTitle")} bodyClassName="grid gap-3 p-3">
        <p className="text-sm text-subtle">
          {t.rich("usageIntro", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
        </p>
        <pre className="overflow-x-auto rounded-md bg-code p-3 font-mono text-mono">{WORKFLOW(apiUrl)}</pre>
        <p className="text-sm text-subtle">{t("usageCurl")}</p>
        <pre className="overflow-x-auto rounded-md bg-code p-3 font-mono text-mono">{CURL(apiUrl)}</pre>
        <p className="text-sm text-muted-foreground">
          {t.rich("usageNote", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
        </p>
      </Panel>

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={t("createTitle")}
        description={t("createDescription")}
        onSubmit={create}
        busy={busy}
        error={error}
        submitLabel={t("createSubmit")}
      >
        <FieldGroup columns={2}>
          <Field label={t("name")} hint={t("nameHint")}>
            <Input
              value={draft?.name ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, name: event.target.value } : current))
              }
              placeholder="problems-2026"
            />
          </Field>
          <Field label={t("expiresInDays")} optional={t("optional")} hint={t("expiresInDaysHint")}>
            <Input
              type="number"
              mono
              min={1}
              value={draft?.expiresInDays ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, expiresInDays: event.target.value } : current))
              }
            />
          </Field>
        </FieldGroup>

        <Field label={t("scopes")} hint={t("scopesHint")}>
          <div className="grid gap-2">
            {API_KEY_SCOPES.map((scope) => (
              <Checkbox
                key={scope.value}
                checked={draft?.scopes.includes(scope.value) ?? false}
                onCheckedChange={(value) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          scopes: value
                            ? [...current.scopes, scope.value]
                            : current.scopes.filter((entry) => entry !== scope.value),
                        }
                      : current,
                  )
                }
                label={
                  <span className="grid">
                    <span className="font-mono text-mono">{scope.label}</span>
                    <span className="text-sm text-muted-foreground">{t(scope.hintKey)}</span>
                  </span>
                }
              />
            ))}
          </div>
        </Field>
      </RecordDialog>

      <Dialog open={issued !== null} onOpenChange={(next) => (next ? undefined : setIssued(null))}>
        <DialogContent
          title={t("issuedTitle", { name: issued?.row.name ?? "" })}
          description={t("issuedDescription")}
          width={720}
        >
          <div className="grid gap-3">
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-code p-3 font-mono text-mono">
                {issued?.key}
              </code>
              <CopyButton value={issued?.key ?? ""} label={t("copyKey")} />
            </div>
            {issued?.warning ? (
              <Alert variant="warning">
                <AlertTriangle className="size-3.5" aria-hidden />
                <AlertTitle>{t("mirrorWarningTitle")}</AlertTitle>
                <AlertDescription>{issued.warning}</AlertDescription>
              </Alert>
            ) : (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t("bothRoutes")}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{t("done")}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const WORKFLOW = (apiUrl: string) => `name: Upload problems
on:
  push:
    branches: [main]
jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: MonashAPS/MOJ/actions/upload-problems@main
        with:
          judge-url: \${{ secrets.JUDGE_URL }}   # ${apiUrl}
          api-key: \${{ secrets.JUDGE_API_KEY }}
          problems-dir: problems`;

const CURL = (apiUrl: string) => `curl -X PUT ${apiUrl}/api/problems/aplusb \\
  -H "Authorization: Bearer $JUDGE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "A plus B", "statement": "Add two numbers.", "points": 100}'`;
