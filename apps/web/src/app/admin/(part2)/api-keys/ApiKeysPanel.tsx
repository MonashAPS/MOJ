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
import { useEffect, useState, useTransition } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { formatDateTime } from "@/lib/format";
import { ConfirmAction, CopyButton, DASH, Flags, StatusLine } from "../_components/console";
import { RecordDialog } from "../_components/RecordDialog";
import { createKeyAction, listKeysAction, revokeKeyAction } from "./actions";
import { API_KEY_SCOPES, type ConsoleKeyRow } from "./scopes";

export function ApiKeysPanel({ username, apiUrl }: { username: string; apiUrl: string }) {
  const [rows, setRows] = useState<ConsoleKeyRow[] | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const [draft, setDraft] = useState<{ name: string; scopes: string[]; expiresInDays: string } | null>(null);
  const [reason, setReason] = useState("");
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
    if (reason.trim().length === 0) {
      setError("Say what the key is for; it is the only record of why it exists.");
      return;
    }
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
    { key: "name", header: "Name", cell: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: "start",
      header: "Starts with",
      cell: (row) => <span className="font-mono text-mono">{row.start ? `${row.start}…` : DASH}</span>,
    },
    {
      key: "scopes",
      header: "Scopes",
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
      header: "State",
      cell: (row) => (
        <Flags
          flags={[
            { on: row.enabled, label: "Enabled", tone: "good" },
            { on: !row.enabled, label: "Disabled", tone: "bad" },
            { on: !row.mirrored, label: "Site only", tone: "warn" },
            { on: row.expiresAt !== null && row.expiresAt < Date.now(), label: "Expired", tone: "bad" },
          ]}
        />
      ),
    },
    { key: "created", header: "Created", numeric: true, cell: (row) => formatDateTime(row.createdAt) },
    {
      key: "expires",
      header: "Expires",
      numeric: true,
      cell: (row) => (row.expiresAt === null ? "Never" : formatDateTime(row.expiresAt)),
    },
    {
      key: "used",
      header: "Last used",
      numeric: true,
      cell: (row) => (row.lastUsedAt === null ? DASH : formatDateTime(row.lastUsedAt)),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (row) => (
        <ConfirmAction
          trigger={
            <Button variant="ghost" size="sm">
              Revoke
            </Button>
          }
          title={`Revoke ${row.name}?`}
          description="Any workflow presenting this key starts failing immediately. It cannot be restored; issue a new one instead."
          confirmLabel="Revoke key"
          onConfirm={async () => {
            const result = await revokeKeyAction(row.id, row.convexId);
            if (result.ok) {
              setMessage({ tone: "ok", text: `${row.name} has been revoked.` });
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
              Keys belong to {username || "you"} and act with {username || "your"} permissions.
            </span>
            <Button
              className="ml-auto"
              size="sm"
              icon={<Plus aria-hidden />}
              onClick={() => {
                setDraft({ name: "", scopes: ["problems:write"], expiresInDays: "" });
                setReason("");
                setError(null);
              }}
            >
              New key
            </Button>
          </>
        }
        emptyTitle="No API keys"
        emptyDescription="A key is what a problem repository's workflow presents when it uploads a statement."
        emptyAction={
          <Button
            variant="secondary"
            onClick={() => setDraft({ name: "", scopes: ["problems:write"], expiresInDays: "" })}
          >
            New key
          </Button>
        }
      />

      <Panel title="Using a key from a problem repository" bodyClassName="grid gap-3 p-3">
        <p className="text-sm text-subtle">
          The reusable action uploads every problem a push touched. Put the key in the repository&rsquo;s
          secrets as <code className="font-mono">JUDGE_API_KEY</code>, and this site&rsquo;s address as{" "}
          <code className="font-mono">JUDGE_URL</code> — the same address you are reading this on.
        </p>
        <pre className="overflow-x-auto rounded-md bg-code p-3 font-mono text-mono">{WORKFLOW(apiUrl)}</pre>
        <p className="text-sm text-subtle">
          To upload by hand, present the key as a bearer token against the problems API:
        </p>
        <pre className="overflow-x-auto rounded-md bg-code p-3 font-mono text-mono">{CURL(apiUrl)}</pre>
        <p className="text-sm text-muted-foreground">
          The endpoint updates only the fields the body carries; anything absent is left as it is. Creating a
          problem needs a name. <code className="font-mono">problems:write</code> is the scope it checks.
        </p>
      </Panel>

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title="New API key"
        description="The key is shown once, here, and never again. Only its hash is stored."
        onSubmit={create}
        reason={reason}
        onReasonChange={setReason}
        reasonLabel="What is this key for"
        reasonHint="Recorded with the key so a stale one can be recognised later."
        busy={busy}
        error={error}
        submitLabel="Create key"
      >
        <FieldGroup columns={2}>
          <Field label="Name" hint="The repository or workflow that will hold it.">
            <Input
              value={draft?.name ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, name: event.target.value } : current))
              }
              placeholder="problems-2026"
            />
          </Field>
          <Field label="Expires in (days)" optional=" (optional)" hint="Blank means the key never expires.">
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

        <Field label="Scopes" hint="A key can do nothing a scope does not name.">
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
                    <span className="text-sm text-muted-foreground">{scope.hint}</span>
                  </span>
                }
              />
            ))}
          </div>
        </Field>
      </RecordDialog>

      <Dialog open={issued !== null} onOpenChange={(next) => (next ? undefined : setIssued(null))}>
        <DialogContent
          title={`Key for ${issued?.row.name ?? ""}`}
          description="Copy it now. It is not shown again and cannot be recovered."
          width={720}
        >
          <div className="grid gap-3">
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-code p-3 font-mono text-mono">
                {issued?.key}
              </code>
              <CopyButton value={issued?.key ?? ""} label="Copy key" />
            </div>
            {issued?.warning ? (
              <Alert variant="warning">
                <AlertTriangle className="size-3.5" aria-hidden />
                <AlertTitle>The judge&rsquo;s key table was not updated</AlertTitle>
                <AlertDescription>{issued.warning}</AlertDescription>
              </Alert>
            ) : (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                The key works against the site and against the problems API, whichever route the judge takes
                to verify it.
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Done</Button>
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
